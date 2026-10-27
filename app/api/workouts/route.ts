import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { addWorkoutEntry } from "@/lib/db";
import { isDayKey } from "@/lib/dates";
import { getExercise } from "@/lib/exercises";
import { DayKey } from "@/lib/schemas";
import { workoutsView } from "@/lib/workouts";

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  if (!isDayKey(from) || !isDayKey(to) || from > to) return Response.json({ error: "Invalid dates" }, { status: 400 });
  return Response.json(await workoutsView(user.id, from, to));
}

const Body = z.object({ day: DayKey, exerciseId: z.string().max(120), sets: z.number().int().min(1).max(20).default(3) });

/** Plans an exercise on a day, with empty sets ready to log. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success || !getExercise(body.data.exerciseId)) return Response.json({ error: "Pick an exercise from the library." }, { status: 400 });
  const id = await addWorkoutEntry(user.id, body.data.day, body.data.exerciseId, body.data.sets);
  return Response.json({ id, ...(await workoutsView(user.id, body.data.day, body.data.day)) }, { status: 201 });
}
