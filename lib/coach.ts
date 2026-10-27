import "server-only";
import { generateText, type Part, type Turn } from "./ai";
import {
  addCoachMessage,
  getBodyFat,
  getBurns,
  getCoachMessages,
  getDaySummaries,
  getFastsSince,
  getMealsForDay,
  getPrefs,
  getProfile,
  getWaterRange,
  getWeights,
  getWorkouts,
} from "./db";
import { dayKey, shiftDay } from "./dates";
import { getExercise } from "./exercises";
import { forecast } from "./forecast";
import { ACTIVITY_LEVELS, targetsFor } from "./nutrition";
import type { PhotoData } from "./photos";

const COACH_PROMPT = `You are the Coach inside CalAi, a calorie and fitness tracker used mostly by people eating Indian home food.
You talk with one person and can see their live data in the CONTEXT block below (refreshed every message).

How to answer:
- Ground answers in their numbers: name days, foods, amounts, sets and trends from CONTEXT. Do the arithmetic for them.
- For "expected weight in N days" use the forecast block (energy balance at ~7,700 kcal per kg, or their real weigh-in trend
  when there is one) and say which you used and how confident it is.
- Days with no meals logged are UNLOGGED, not fasting. Only the sessions in "fasts" are fasting; never infer a fast from
  missing logs or from low calories.
- Workout burn is extra calories above resting; their daily target already covers normal activity.
- Be practical and kind. Prefer one or two concrete next steps over long lists. Short paragraphs; simple lists are fine;
  no tables, no headings.
- If they attach a photo, describe what you see and relate it to their goals (estimate calories if it's food).
- Never give medical advice or diagnoses, never suggest eating under 1,200 kcal a day, and point to a doctor for
  symptoms, medication, pregnancy or eating-disorder concerns.
- If CONTEXT lacks what you need, say what to log to get a better answer.`;

const r1 = (n: number) => Math.round(n * 10) / 10;
/** Times as the person would read them (the server runs in their timezone). */
const local = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** A compact snapshot of everything the Coach may need, rebuilt for every message. */
async function context(userId: number) {
  const today = dayKey();
  const from14 = shiftDay(today, -13);
  const [{ profile, saved }, prefs, weights, bodyFat, days, recent28, todayMeals, workouts, burns, fasts, water] = await Promise.all([
    getProfile(userId),
    getPrefs(userId),
    getWeights(userId),
    getBodyFat(userId),
    getDaySummaries(userId, from14, today),
    getDaySummaries(userId, shiftDay(today, -28), today),
    getMealsForDay(userId, today),
    getWorkouts(userId, shiftDay(today, -20), shiftDay(today, 7)),
    getBurns(userId, shiftDay(today, -30), today),
    getFastsSince(userId, new Date(Date.now() - 30 * 86_400_000).toISOString()),
    getWaterRange(userId, shiftDay(today, -6), today),
  ]);
  const targets = targetsFor(profile);
  const f = forecast(profile, targets, weights, recent28, today);

  return {
    today,
    now_local: new Date().toLocaleString("en-IN", { weekday: "long", hour: "numeric", minute: "2-digit" }),
    profile: saved
      ? {
          sex: profile.sex,
          age: profile.age,
          height_cm: profile.heightCm,
          weight_kg: profile.weightKg,
          activity: ACTIVITY_LEVELS.find((a) => a.value === profile.activity)?.label,
          goal: profile.goal,
          target_weight_kg: profile.targetWeightKg,
          pinned_macros_g: profile.pinned,
        }
      : "not set up yet (using a starter 2,000 kcal target)",
    daily_targets: targets,
    adaptive_goals: prefs.adaptive.enabled ? { correction_kcal: profile.adaptiveKcal, last_note: prefs.adaptive.note } : "off",
    nutrient_goals_custom: prefs.nutrientGoals,
    training_preferences: prefs.training,
    last_14_days: Array.from({ length: 14 }, (_, i) => {
      const day = shiftDay(from14, i);
      const d = days.find((x) => x.day === day);
      return d
        ? { day, kcal: Math.round(d.calories), protein_g: Math.round(d.protein_g), carbs_g: Math.round(d.carbs_g), fat_g: Math.round(d.fat_g), fiber_g: Math.round(d.fiber_g), meals: d.meals }
        : { day, unlogged: true };
    }),
    today_meals: todayMeals.map((m) => ({ meal: m.meal_type, items: m.items.map((i) => `${i.name} ${Math.round(i.grams)}g ${Math.round(i.calories)}kcal`) })),
    weights_last_60_days: weights.filter((w) => w.day >= shiftDay(today, -60)),
    body_fat_pct: bodyFat.slice(-10),
    forecast: f,
    workouts: workouts.map((w) => ({
      day: w.day,
      exercise: getExercise(w.exercise_id)?.name ?? w.exercise_id,
      planned_only: !w.sets.some((s) => s.done),
      sets_done: w.sets
        .filter((s) => s.done)
        .map((s) => (s.minutes ? `${s.minutes} min` : `${s.reps ?? "?"}×${s.weight_kg ?? "bodyweight"}kg${s.rpe ? ` RPE ${s.rpe}` : ""}`)),
      note: w.note,
    })),
    workout_burn: burns.map((b) => ({ day: b.day, kcal: Math.round(b.kcal) })),
    fasts: prefs.fasting.enabled || fasts.length
      ? fasts.map((x) => ({
          started: local(x.started_at),
          ended: x.ended_at ? local(x.ended_at) : "still running",
          hours: r1(((x.ended_at ? Date.parse(x.ended_at) : Date.now()) - Date.parse(x.started_at)) / 3_600_000),
          goal_hours: x.goal_hours,
        }))
      : "fasting tracking is off; no fasts logged",
    water_last_7_days: prefs.water.enabled ? water : "water tracking is off",
  };
}

const HISTORY = 30; // messages of memory sent with each turn

/** Sends a message to the Coach with the person's live data, and stores both sides of the exchange. */
export async function askCoach(
  userId: number,
  text: string,
  photo: { forModel: { mimeType: string; base64: string }; stored: PhotoData } | null,
  language: string | null,
) {
  const history = await getCoachMessages(userId, HISTORY);
  const turns: Turn[] = history.map((m) => ({
    role: m.role,
    parts: [{ text: m.photo && m.role === "user" ? `[photo attached]\n${m.content}` : m.content }],
  }));
  const parts: Part[] = [];
  if (photo) parts.push({ image: { mimeType: photo.forModel.mimeType, data: photo.forModel.base64 } });
  parts.push({ text: text || "What do you see?" });
  turns.push({ role: "user", parts });

  const system = `${COACH_PROMPT}${language ? `\n\nReply in the language with code "${language}" unless they write in another language.` : ""}

CONTEXT (live data, JSON):
${JSON.stringify(await context(userId))}`;

  const reply = (await generateText(userId, system, mergeRoles(turns), { timeoutMs: 60_000, maxTokens: 4000 })).trim();
  // Saved only once the reply exists, so a failed request leaves no half-finished exchange behind.
  await addCoachMessage(userId, "user", text, photo?.stored ?? null);
  await addCoachMessage(userId, "assistant", reply);
  return reply;
}

/** Providers want turns to alternate; join any back-to-back messages from the same side. */
function mergeRoles(turns: Turn[]): Turn[] {
  const out: Turn[] = [];
  for (const t of turns) {
    const last = out.at(-1);
    if (last && last.role === t.role) last.parts.push(...t.parts);
    else out.push({ role: t.role, parts: [...t.parts] });
  }
  while (out[0]?.role === "assistant") out.shift();
  return out;
}
