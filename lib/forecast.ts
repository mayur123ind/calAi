// Energy-balance weight forecast and Adaptive Goals. Pure functions, shared by server and client.
// About 7,700 kcal of surplus or deficit makes one kilogram of body weight.

import { dayKey, parseDay, shiftDay } from "./dates";
import { GOALS, tdee, type Profile, type Targets } from "./nutrition";

export const KCAL_PER_KG = 7700;

type Weight = { day: string; kg: number };
type DayIntake = { day: string; calories: number };

export type Forecast = {
  /** Average calories on properly logged days in the window, or null if too few. */
  avgIntake: number | null;
  loggedDays: number;
  /** Days with something logged but under half the target: probably incomplete logs. */
  sparseDays: number;
  windowDays: number;
  formulaTdee: number;
  /** Maintenance calories implied by intake and the real weight trend, when there's enough of both. */
  observedTdee: number | null;
  latestKg: number | null;
  predictedWeeklyKg: number | null;
  observedWeeklyKg: number | null;
  expected: { days: number; kg: number }[];
  targetKg: number | null;
  daysToGoal: number | null;
  /** Weight is moving the "wrong" way compared with what the logged food implies. */
  underLogging: boolean;
};

const daysBetween = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000);

/** Least-squares slope of weight over time, in kg per day. */
export function weightSlope(weights: Weight[]): number | null {
  if (weights.length < 2) return null;
  const t0 = weights[0].day;
  const xs = weights.map((w) => daysBetween(t0, w.day));
  if (xs[xs.length - 1] - xs[0] < 7) return null; // under a week of data is mostly water and noise
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = weights.reduce((a, w) => a + w.kg, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (weights[i].kg - my);
    den += (xs[i] - mx) ** 2;
  }
  return den ? num / den : null;
}

export function forecast(
  profile: Profile,
  targets: Targets,
  weights: Weight[],
  intake: DayIntake[],
  today = dayKey(),
  windowDays = 28,
): Forecast {
  const from = shiftDay(today, -windowDays + 1);
  // Today is still in progress, so it doesn't count toward averages.
  const days = intake.filter((d) => d.day >= from && d.day < today && d.calories > 0);
  const complete = days.filter((d) => d.calories >= targets.calories * 0.5);
  const avgIntake = complete.length >= 5 ? complete.reduce((a, d) => a + d.calories, 0) / complete.length : null;

  const recent = weights.filter((w) => w.day >= from);
  const slope = weightSlope(recent);
  const observedWeeklyKg = slope === null ? null : slope * 7;
  const formulaTdee = Math.round(tdee(profile));
  const predictedWeeklyKg = avgIntake === null ? null : ((avgIntake - formulaTdee) * 7) / KCAL_PER_KG;
  const observedTdee =
    avgIntake !== null && observedWeeklyKg !== null ? Math.round(avgIntake - (observedWeeklyKg * KCAL_PER_KG) / 7) : null;

  const latestKg = weights.at(-1)?.kg ?? null;
  // Forecast from the real trend when there is one, else from logged food against the formula.
  const weekly = observedWeeklyKg ?? predictedWeeklyKg;
  const expected =
    latestKg !== null && weekly !== null
      ? [30, 60, 90].map((d) => ({ days: d, kg: Math.round((latestKg + (weekly / 7) * d) * 10) / 10 }))
      : [];

  const targetKg = profile.targetWeightKg;
  let daysToGoal: number | null = null;
  if (targetKg !== null && latestKg !== null && weekly) {
    const days = ((targetKg - latestKg) / weekly) * 7;
    daysToGoal = days > 0 && days < 3650 ? Math.round(days) : null;
  }

  // Gaining faster (or losing slower) than the food log allows by more than ~0.25 kg a week suggests missed food.
  const underLogging =
    predictedWeeklyKg !== null && observedWeeklyKg !== null && observedWeeklyKg - predictedWeeklyKg > 0.25;

  return {
    avgIntake: avgIntake === null ? null : Math.round(avgIntake),
    loggedDays: complete.length,
    sparseDays: days.length - complete.length,
    windowDays,
    formulaTdee,
    observedTdee,
    latestKg,
    predictedWeeklyKg: predictedWeeklyKg === null ? null : Math.round(predictedWeeklyKg * 100) / 100,
    observedWeeklyKg: observedWeeklyKg === null ? null : Math.round(observedWeeklyKg * 100) / 100,
    expected,
    targetKg,
    daysToGoal,
    underLogging,
  };
}

const MAX_STEP = 150; // kcal per weekly check
const MAX_TOTAL = 600;

/**
 * Adaptive Goals: once a week, nudge the calorie target toward what the person's real maintenance
 * (from intake and weight trend) says their goal needs. Needs 10+ well-logged days and 2+ weeks of weigh-ins.
 * Returns the new correction and a note, or null when there isn't enough data yet.
 */
export function adaptiveStep(
  profile: Profile,
  base: number,
  weights: Weight[],
  intake: DayIntake[],
  targets: Targets,
  today = dayKey(),
): { adaptiveKcal: number; note: string } | null {
  const f = forecast(profile, targets, weights, intake, today, 21);
  const span = weights.filter((w) => w.day >= shiftDay(today, -27));
  const spanDays = span.length >= 3 ? daysBetween(span[0].day, span[span.length - 1].day) : 0;
  if (f.observedTdee === null || f.loggedDays < 10 || spanDays < 14) return null;

  const delta = GOALS.find((g) => g.id === profile.goal)?.delta ?? 0;
  const wanted = Math.max(-MAX_TOTAL, Math.min(MAX_TOTAL, f.observedTdee + delta - base));
  const current = profile.adaptiveKcal ?? 0;
  const step = Math.max(-MAX_STEP, Math.min(MAX_STEP, wanted - current));
  const next = Math.round((current + step) / 10) * 10;
  const change = next - current;
  const note =
    Math.abs(change) < 10
      ? `Your weight is tracking your plan (maintenance about ${f.observedTdee} kcal). No change this week.`
      : `Your weight trend puts your maintenance near ${f.observedTdee} kcal, so your target moved ${change > 0 ? "up" : "down"} ${Math.abs(change)} kcal.`;
  return { adaptiveKcal: next, note };
}
