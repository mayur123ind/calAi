import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { deleteWeight, getProfile, getWeights, saveProfile, upsertWeight } from "@/lib/db";
import { isDayKey } from "@/lib/dates";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  return Response.json({ weights: await getWeights(user.id) });
}

const Body = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kg: z.number().min(20).max(400),
});

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Enter a weight between 20 and 400 kg." }, { status: 400 });
  const kg = Math.round(body.data.kg * 10) / 10;
  const before = (await getWeights(user.id)).at(-1);
  await upsertWeight(user.id, body.data.day, kg);
  const weights = await getWeights(user.id);
  const latest = weights.at(-1)!;

  // The newest weigh-in keeps the goal maths current, and may reach the target weight.
  const { profile, saved } = await getProfile(user.id);
  let goalReached = false;
  if (saved && latest.day === body.data.day) {
    const target = profile.targetWeightKg;
    const reached = (w: number) =>
      target !== null && (profile.goal === "lose" ? w <= target : profile.goal === "gain" ? w >= target : Math.abs(w - target) <= 0.5);
    goalReached = reached(kg) && !(before && reached(before.kg));
    await saveProfile(user.id, { ...profile, weightKg: kg });
  }
  return Response.json({ weights, goalReached, targetWeightKg: profile.targetWeightKg });
}

export async function DELETE(request: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const day = request.nextUrl.searchParams.get("day");
  if (!isDayKey(day)) return Response.json({ error: "Invalid date" }, { status: 400 });
  await deleteWeight(user.id, day);
  return Response.json({ weights: await getWeights(user.id) });
}
