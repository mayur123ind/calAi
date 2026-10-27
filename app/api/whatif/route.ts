import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { AnalyzeError, whatIfSuggestion } from "@/lib/ai/tasks";
import { getMealsForDay, getProfile } from "@/lib/db";
import { MEAL_TYPES, sumItems, targetsFor } from "@/lib/nutrition";
import { DayKey, ItemsSchema, MealTypeSchema } from "@/lib/schemas";

export const maxDuration = 60;

const Body = z.object({ day: DayKey, meal_type: MealTypeSchema, items: ItemsSchema });

/** Meal What if?: a practical AI suggestion about a reviewed meal before it's logged. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Add at least one item first." }, { status: 400 });
  const { day, meal_type, items } = body.data;

  const { profile } = await getProfile(user.id);
  const logged = await getMealsForDay(user.id, day);
  const before = sumItems(logged.flatMap((m) => m.items));
  const meal = sumItems(items);
  const round = (t: Record<string, number>) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v)]));
  try {
    const suggestion = await whatIfSuggestion(user.id, {
      goal: profile.goal,
      targets: targetsFor(profile),
      local_time: new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }),
      already_logged_meals: MEAL_TYPES.filter((t) => logged.some((m) => m.meal_type === t.id)).map((t) => t.label),
      logged_so_far: round(before),
      this_meal: { meal_type, items: items.map((i) => ({ name: i.name, grams: i.grams, calories: Math.round(i.calories) })), totals: round(meal) },
      after_logging: round(sumItems([...logged.flatMap((m) => m.items), ...items])),
    });
    return Response.json({ suggestion });
  } catch (e) {
    const err = e instanceof AnalyzeError ? e : new AnalyzeError("Couldn't get a suggestion right now.", 500);
    return Response.json({ error: err.message }, { status: err.status });
  }
}
