import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { deleteBodyFat, getBodyFat, upsertBodyFat } from "@/lib/db";
import { DayKey } from "@/lib/schemas";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  return Response.json({ bodyFat: await getBodyFat(user.id) });
}

const Body = z.object({ day: DayKey, pct: z.number().min(2).max(70) });

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Enter a body fat between 2 and 70%." }, { status: 400 });
  await upsertBodyFat(user.id, body.data.day, Math.round(body.data.pct * 10) / 10);
  return Response.json({ bodyFat: await getBodyFat(user.id) });
}

export async function DELETE(request: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const day = request.nextUrl.searchParams.get("day");
  if (!DayKey.safeParse(day).success) return Response.json({ error: "Invalid date" }, { status: 400 });
  await deleteBodyFat(user.id, day!);
  return Response.json({ bodyFat: await getBodyFat(user.id) });
}
