import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { setWater } from "@/lib/db";
import { DayKey } from "@/lib/schemas";

const Body = z.object({ day: DayKey, ml: z.number().int().min(0).max(10_000) });

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid amount" }, { status: 400 });
  await setWater(user.id, body.data.day, body.data.ml);
  return Response.json(body.data);
}
