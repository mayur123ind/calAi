import type { NextRequest } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import { getBodyFat, getBurns, getDaySummaries, getPrefs, getProfile, getWeights } from "@/lib/db";
import { dayKey, isDayKey, shiftDay } from "@/lib/dates";
import { forecast } from "@/lib/forecast";
import { targetsFor } from "@/lib/nutrition";

/** Everything the Progress page charts for [from, today], plus the weight forecast. */
export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const today = dayKey();
  const fromParam = request.nextUrl.searchParams.get("from");
  const from = isDayKey(fromParam) && fromParam <= today ? fromParam : "0000-00-00";

  const [{ profile, saved }, prefs, weights, bodyFat, burns] = await Promise.all([
    getProfile(user.id),
    getPrefs(user.id),
    getWeights(user.id),
    getBodyFat(user.id),
    getBurns(user.id),
  ]);
  const targets = targetsFor(profile);
  // The forecast always looks at the last 4 weeks, whatever range is on screen.
  const [days, recent] = await Promise.all([
    getDaySummaries(user.id, from, today),
    getDaySummaries(user.id, shiftDay(today, -28), today),
  ]);

  return Response.json({
    today,
    goalsSet: saved,
    goal: profile.goal,
    targetWeightKg: profile.targetWeightKg,
    targets,
    bodyFatEnabled: prefs.bodyFat,
    weights,
    bodyFat,
    burns: burns.map(({ day, kcal, created_at }) => ({ day, kcal, created_at })),
    days,
    forecast: forecast(profile, targets, weights, recent, today),
  });
}
