import "server-only";
import { getBurns, getWorkouts } from "./db";
import { exerciseImage, getExercise, isTimed } from "./exercises";

/** The diary for [from, to] (at most ~2 months), with exercise names and photos filled in. */
export async function workoutsView(userId: number, from: string, to: string) {
  const [entries, burns] = await Promise.all([getWorkouts(userId, from, to), getBurns(userId, from, to)]);
  return {
    entries: entries.map((e) => {
      const ex = getExercise(e.exercise_id);
      return {
        ...e,
        name: ex?.name ?? e.exercise_id,
        category: ex?.category ?? "strength",
        timed: ex ? isTimed(ex) : false,
        thumb: ex?.images ? exerciseImage(ex.id, 0) : null,
      };
    }),
    burns: burns.map(({ day, kcal, details }) => ({ day, kcal, details })),
  };
}
