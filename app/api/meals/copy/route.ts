import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { copyMeals } from "@/lib/db";
import { DayKey, MealTypeSchema } from "@/lib/schemas";

const Body = z.object({ fromDay: DayKey, toDay: DayKey, meal_type: MealTypeSchema });

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const copied = await copyMeals(user.id, body.data.fromDay, body.data.toDay, body.data.meal_type);
  if (copied === 0) return Response.json({ error: "Nothing to copy from that day." }, { status: 404 });
  return Response.json({ copied }, { status: 201 });
}
