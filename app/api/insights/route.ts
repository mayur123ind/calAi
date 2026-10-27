import type { NextRequest } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import { getDaySummaries, getInsight, getItemsInRange, getProfile, saveInsight } from "@/lib/db";
import { isDayKey, shiftDay } from "@/lib/dates";
import { AnalyzeError, weeklyInsight } from "@/lib/ai/tasks";
import { NUTRIENTS, targetsFor } from "@/lib/nutrition";

export const maxDuration = 60;

// One insight per user per day: GET returns today's if it exists, POST makes (or remakes) it.
export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const today = request.nextUrl.searchParams.get("today");
  if (!isDayKey(today)) return Response.json({ error: "Invalid date" }, { status: 400 });
  return Response.json({ insight: await getInsight(user.id, today) });
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const today = request.nextUrl.searchParams.get("today");
  if (!isDayKey(today)) return Response.json({ error: "Invalid date" }, { status: 400 });

  const from = shiftDay(today, -6);
  const summaries = await getDaySummaries(user.id, from, today);
  if (summaries.length < 2) {
    return Response.json({ error: "Log meals on at least 2 days this week to get insights." }, { status: 400 });
  }

  const byDay = new Map(summaries.map((s) => [s.day, s]));
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = shiftDay(from, i);
    const s = byDay.get(day);
    return { day, ...Object.fromEntries(NUTRIENTS.map((n) => [n, Math.round(s?.[n] ?? 0)])) };
  });
  const counts = new Map<string, number>();
  for (const i of await getItemsInRange(user.id, from, today)) {
    const k = i.name.trim();
    counts.set(k, (counts.get(k) ?? 0) + Math.round(i.calories));
  }
  const topFoods = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, kcal]) => ({ name, kcal }));

  try {
    const insight = await weeklyInsight(user.id, { targets: targetsFor((await getProfile(user.id)).profile), days, topFoodsByCalories: topFoods });
    await saveInsight(user.id, today, insight);
    return Response.json({ insight });
  } catch (e) {
    const err = e instanceof AnalyzeError ? e : new AnalyzeError("Couldn't make insights right now.", 500);
    return Response.json({ error: err.message }, { status: err.status });
  }
}
