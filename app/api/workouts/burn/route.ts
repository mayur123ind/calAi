import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { calculateBurn } from "@/lib/burn";
import { deleteBurn, getProfile, getWeights, getWorkouts, saveBurn } from "@/lib/db";
import { getExercise } from "@/lib/exercises";
import { DayKey } from "@/lib/schemas";

const Body = z.object({ day: DayKey });

/** Calculates a day's workout burn from the sets marked done, and keeps it for Progress. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid date" }, { status: 400 });
  const { day } = body.data;

  const entries = (await getWorkouts(user.id, day, day))
    .map((e) => ({ exercise: getExercise(e.exercise_id), sets: e.sets }))
    .filter((e): e is { exercise: NonNullable<typeof e.exercise>; sets: typeof e.sets } => !!e.exercise);
  // Weight on or before that day, else the profile's.
  const weighIn = (await getWeights(user.id)).filter((w) => w.day <= day).at(-1);
  const weightKg = weighIn?.kg ?? (await getProfile(user.id)).profile.weightKg;
  const { kcal, lines } = calculateBurn(entries, weightKg);
  if (lines.length === 0) {
    await deleteBurn(user.id, day);
    return Response.json({ error: "Tick off the sets you finished, then calculate again." }, { status: 400 });
  }
  await saveBurn(user.id, day, kcal, { weightKg, lines });
  return Response.json({ day, kcal, details: { weightKg, lines } });
}
