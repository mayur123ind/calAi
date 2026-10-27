import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { copyWorkoutDay } from "@/lib/db";
import { DayKey } from "@/lib/schemas";
import { workoutsView } from "@/lib/workouts";

const Body = z.object({ fromDay: DayKey, toDay: DayKey });

/** Repeats a day's exercises (e.g. last week's) on another day, with fresh empty sets. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success || body.data.fromDay === body.data.toDay) return Response.json({ error: "Invalid days" }, { status: 400 });
  const copied = await copyWorkoutDay(user.id, body.data.fromDay, body.data.toDay);
  if (copied === 0) return Response.json({ error: "Nothing was planned on that day." }, { status: 404 });
  return Response.json({ copied, ...(await workoutsView(user.id, body.data.toDay, body.data.toDay)) });
}
