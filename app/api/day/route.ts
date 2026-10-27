import type { NextRequest } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import {
  getActiveFast,
  getDaySummaries,
  getMealsForDay,
  getPrefs,
  getProfile,
  getWater,
  getWeights,
  savePrefs,
  saveProfile,
} from "@/lib/db";
import { dayKey, isDayKey, parseDay, shiftDay } from "@/lib/dates";
import { adaptiveStep } from "@/lib/forecast";
import { CARD_NUTRIENTS, MICROS, sumMicros } from "@/lib/nutrients";
import { MEAL_TYPES, goalFor, suggestedCalories, sumItems, targetsFor, type Prefs, type Profile } from "@/lib/nutrition";

/** First day of the week containing `day`, given the person's week start (0 Sun, 1 Mon, 6 Sat). */
function weekStartOf(day: string, start: Prefs["weekStart"]) {
  const back = (parseDay(day).getDay() - start + 7) % 7;
  return shiftDay(day, -back);
}

/** Adaptive Goals runs at most once a week, when Today is opened. */
async function runAdaptive(userId: number, profile: Profile, prefs: Prefs, today: string) {
  if (!prefs.adaptive.enabled) return profile;
  if (prefs.adaptive.lastCheck && prefs.adaptive.lastCheck > shiftDay(today, -7)) return profile;
  const from = shiftDay(today, -28);
  const [weights, days] = await Promise.all([getWeights(userId), getDaySummaries(userId, from, today)]);
  const step = adaptiveStep(profile, profile.customKcal ?? suggestedCalories(profile), weights, days, targetsFor(profile), today);
  if (!step) return profile; // not enough data yet: try again next time
  const next = { ...profile, adaptiveKcal: step.adaptiveKcal };
  await saveProfile(userId, next);
  await savePrefs(userId, { ...prefs, adaptive: { ...prefs.adaptive, lastCheck: today, note: step.note } });
  prefs.adaptive = { ...prefs.adaptive, lastCheck: today, note: step.note };
  return next;
}

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const day = request.nextUrl.searchParams.get("date");
  if (!isDayKey(day)) return Response.json({ error: "Invalid date" }, { status: 400 });

  const today = dayKey();
  // Everything Today needs is fetched at once: each database round trip is slow, so none wait on another.
  // The week strip loads ±6 days, which covers the week whatever day it starts on.
  const [prefs, stored, meals, before, around, waterMl, activeFast] = await Promise.all([
    getPrefs(user.id),
    getProfile(user.id),
    getMealsForDay(user.id, day),
    getMealsForDay(user.id, shiftDay(day, -1)),
    getDaySummaries(user.id, shiftDay(day, -6), shiftDay(day, 6)),
    getWater(user.id, day),
    getActiveFast(user.id),
  ]);
  const saved = stored.saved;
  const profile = saved && day === today ? await runAdaptive(user.id, stored.profile, prefs, today) : stored.profile;
  const targets = targetsFor(profile);

  const items = meals.flatMap((m) => m.items);

  // Meals from the day before that this day doesn't have yet, offered as one-tap copies.
  const copyable = MEAL_TYPES.filter((t) => !meals.some((m) => m.meal_type === t.id))
    .map((t) => {
      const list = before.filter((m) => m.meal_type === t.id).flatMap((m) => m.items);
      return { meal_type: t.id, calories: sumItems(list).calories, names: list.map((i) => i.name) };
    })
    .filter((c) => c.names.length > 0);

  // The week strip: calories per day of the week this day falls in.
  const weekFrom = weekStartOf(day, prefs.weekStart);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = shiftDay(weekFrom, i);
    return { day: d, calories: around.find((s) => s.day === d)?.calories ?? 0 };
  });

  const goals = Object.fromEntries(CARD_NUTRIENTS.map((n) => [n.key, goalFor(n.key, profile, targets, prefs)]));

  return Response.json({
    day,
    meals,
    totals: sumItems(items),
    micros: sumMicros(items),
    microsKnown: MICROS.filter((m) => items.some((i) => typeof i.micros?.[m.key] === "number")).map((m) => m.key),
    targets,
    goals,
    goalsSet: saved,
    homeCards: prefs.homeCards,
    logSort: prefs.logSort,
    weekStart: prefs.weekStart,
    week,
    water: prefs.water.enabled
      ? { ml: waterMl, goal: prefs.waterGoalMl, glassMl: prefs.water.glassMl }
      : null,
    fasting: prefs.fasting.enabled ? { goalHours: prefs.fasting.goalHours, active: activeFast ?? null } : null,
    adaptive: prefs.adaptive.enabled ? { kcal: profile.adaptiveKcal, note: prefs.adaptive.note } : null,
    reminders: prefs.reminders,
    copyable,
  });
}
