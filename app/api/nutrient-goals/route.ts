import { currentUser, unauthorized } from "@/lib/auth";
import { AnalyzeError, estimateNutrientGoals } from "@/lib/ai/tasks";
import { getPrefs, getProfile, savePrefs } from "@/lib/db";
import { MICRO_KEYS } from "@/lib/nutrients";
import { ACTIVITY_LEVELS, targetsFor } from "@/lib/nutrition";

export const maxDuration = 60;

/** AI-estimates goals for the detailed nutrients and saves them. Calories and macros are left alone. */
export async function POST() {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { profile } = await getProfile(user.id);
  try {
    const { goals, note } = await estimateNutrientGoals(user.id, {
      sex: profile.sex,
      age: profile.age,
      height_cm: profile.heightCm,
      weight_kg: profile.weightKg,
      activity: ACTIVITY_LEVELS.find((a) => a.value === profile.activity)?.label ?? profile.activity,
      goal: profile.goal,
      calories: targetsFor(profile).calories,
    });
    const clean = Object.fromEntries(
      MICRO_KEYS.filter((k) => Number.isFinite(goals[k]) && goals[k] > 0).map((k) => [k, Math.round(goals[k] * 10) / 10]),
    );
    const prefs = await getPrefs(user.id);
    await savePrefs(user.id, { ...prefs, nutrientGoals: clean });
    return Response.json({ nutrientGoals: clean, note });
  } catch (e) {
    const err = e instanceof AnalyzeError ? e : new AnalyzeError("Couldn't estimate goals right now.", 500);
    return Response.json({ error: err.message }, { status: err.status });
  }
}
