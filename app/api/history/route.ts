import type { NextRequest } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import { getDaySummaries, getLoggedDays, getProfile } from "@/lib/db";
import { isDayKey, shiftDay } from "@/lib/dates";
import { targetsFor } from "@/lib/nutrition";

const CALENDAR_DAYS = 7 * 15;

/** Current run of logged days ending today (or yesterday, if today isn't logged yet) and the longest run ever. */
function streaks(days: string[], today: string) {
  const set = new Set(days);
  let current = 0;
  let cursor = set.has(today) ? today : shiftDay(today, -1);
  while (set.has(cursor)) {
    current++;
    cursor = shiftDay(cursor, -1);
  }
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    run = prev && shiftDay(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best };
}

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const today = request.nextUrl.searchParams.get("today");
  const days = Math.min(Math.max(Number(request.nextUrl.searchParams.get("days")) || 30, 7), 365);
  if (!isDayKey(today)) return Response.json({ error: "Invalid date" }, { status: 400 });

  const from = shiftDay(today, -(days - 1));
  const calendarFrom = shiftDay(today, -(CALENDAR_DAYS - 1));
  const [summaries, { profile }, logged, calendar] = await Promise.all([
    getDaySummaries(user.id, from, today),
    getProfile(user.id),
    getLoggedDays(user.id),
    getDaySummaries(user.id, calendarFrom, today),
  ]);
  return Response.json({
    from,
    to: today,
    days: summaries,
    targets: targetsFor(profile),
    streak: streaks(logged, today),
    calendar: { from: calendarFrom, days: calendar.map((d) => ({ day: d.day, calories: d.calories })) },
  });
}
