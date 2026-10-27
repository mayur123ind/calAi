// Calorie burn from logged sets, using MET values (Compendium of Physical Activities).
// kcal = (MET − 1) × body weight (kg) × hours. The −1 removes resting energy, which the daily
// target already counts, so the number is the *extra* burn from training.

import type { Exercise } from "./exercises";

export type SetLog = { reps: number | null; weight_kg: number | null; rpe: number | null; minutes: number | null; done: boolean };
export type BurnLine = { exercise: string; sets: number; minutes: number; met: number; kcal: number };

/** Effort for resistance work: harder sets (RPE) burn more. */
function strengthMet(rpe: number | null) {
  if (rpe === null) return 5;
  if (rpe <= 6) return 3.5;
  if (rpe < 9) return 5;
  return 6;
}

const MET_BY_CATEGORY: Record<string, number> = {
  cardio: 7,
  stretching: 2.3,
  plyometrics: 8,
};

/** Minutes a set takes including rest: about 4 s a rep plus 90 s rest (60 s for jumps). */
function setMinutes(e: Exercise, s: SetLog) {
  if (s.minutes) return s.minutes;
  if (e.category === "cardio" || e.category === "stretching") return 1;
  const reps = s.reps ?? 10;
  return (reps * 4 + (e.category === "plyometrics" ? 60 : 90)) / 60;
}

/** Burn for one day's entries. Only sets marked done count. */
export function calculateBurn(entries: { exercise: Exercise; sets: SetLog[] }[], weightKg: number) {
  const lines: BurnLine[] = [];
  for (const { exercise, sets } of entries) {
    const done = sets.filter((s) => s.done);
    if (done.length === 0) continue;
    let kcal = 0;
    let minutes = 0;
    let metSum = 0;
    for (const s of done) {
      const mins = setMinutes(exercise, s);
      const met = MET_BY_CATEGORY[exercise.category] ?? strengthMet(s.rpe);
      kcal += (met - 1) * weightKg * (mins / 60);
      minutes += mins;
      metSum += met;
    }
    lines.push({
      exercise: exercise.name,
      sets: done.length,
      minutes: Math.round(minutes),
      met: Math.round((metSum / done.length) * 10) / 10,
      kcal: Math.round(kcal),
    });
  }
  return { kcal: lines.reduce((a, l) => a + l.kcal, 0), lines };
}
