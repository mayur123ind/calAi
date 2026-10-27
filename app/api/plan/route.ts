import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { addPlan, getMealsForDay, getPantry, getProfile, listPlans, savePantry } from "@/lib/db";
import { isDayKey } from "@/lib/dates";
import { AnalyzeError, generateMealPlan } from "@/lib/ai/tasks";
import { MEAL_SHARE, PANTRY_UNITS, type MealPlan, type PantryItem, type PantryUnit } from "@/lib/mealprep";
import { MEAL_TYPES, NUTRIENTS, sumItems, targetsFor, type MealType } from "@/lib/nutrition";
import { DayKey, MealTypeSchema } from "@/lib/schemas";

export const maxDuration = 120;

/** What's still open today: calories and macros left, and which meals are already logged. */
async function dayBudget(userId: number, day: string) {
  const targets = targetsFor((await getProfile(userId)).profile);
  const meals = await getMealsForDay(userId, day);
  const eaten = sumItems(meals.flatMap((m) => m.items));
  const left = Object.fromEntries(NUTRIENTS.map((n) => [n, Math.max(0, Math.round(targets[n] - eaten[n]))])) as typeof targets;
  return { targets, left, logged: [...new Set(meals.map((m) => m.meal_type))] };
}

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const day = request.nextUrl.searchParams.get("today");
  if (!isDayKey(day)) return Response.json({ error: "Invalid date" }, { status: 400 });
  return Response.json({ pantry: await getPantry(user.id), plans: await listPlans(user.id), ...(await dayBudget(user.id, day)) });
}

const Body = z.object({
  day: DayKey,
  meals: z.array(MealTypeSchema).min(1).max(4),
  people: z.number().int().min(1).max(12),
  diet: z.enum(["veg", "egg", "nonveg", "vegan"]),
  notes: z.string().trim().max(300),
  pantry: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        qty: z.number().positive().max(100_000),
        unit: z.enum(PANTRY_UNITS),
      }),
    )
    .min(1)
    .max(40),
});

const norm = (s: string) => s.trim().toLowerCase();

// The model works in g, ml and pcs only; kg and l are converted on the way in and back on the way out.
const BASE_UNIT: Record<PantryUnit, { unit: "g" | "ml" | "pcs"; factor: number }> = {
  g: { unit: "g", factor: 1 },
  kg: { unit: "g", factor: 1000 },
  ml: { unit: "ml", factor: 1 },
  l: { unit: "ml", factor: 1000 },
  pcs: { unit: "pcs", factor: 1 },
};
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Add at least one ingredient with a quantity, and pick a meal to plan." }, { status: 400 });
  }
  const { day, people, diet, notes, pantry } = body.data;
  const meals = MEAL_TYPES.map((t) => t.id).filter((t) => body.data.meals.includes(t));
  await savePantry(user.id, pantry);

  // Split what's left of today's target across the meals being planned, by their usual share.
  const { targets, left } = await dayBudget(user.id, day);
  const shareTotal = meals.reduce((s, m) => s + MEAL_SHARE[m], 0);
  const budgets = Object.fromEntries(
    meals.map((m) => {
      const f = MEAL_SHARE[m] / shareTotal;
      return [m, { calories: Math.round(left.calories * f), protein_g: Math.round(left.protein_g * f) }];
    }),
  ) as Record<MealType, { calories: number; protein_g: number }>;

  let generated;
  try {
    generated = await generateMealPlan(user.id, {
      meals_to_plan: meals,
      people,
      diet,
      notes: notes || "none",
      ingredients_available: pantry.map((p) => ({
        name: p.name,
        qty: p.qty * BASE_UNIT[p.unit].factor,
        unit: BASE_UNIT[p.unit].unit,
      })),
      per_person_budget_by_meal: budgets,
      daily_targets_per_person: { calories: targets.calories, protein_g: targets.protein_g, fiber_g: targets.fiber_g },
    });
  } catch (e) {
    const err = e instanceof AnalyzeError ? e : new AnalyzeError("Couldn't make a plan right now.", 500);
    return Response.json({ error: err.message }, { status: err.status });
  }

  // Keep only the meals that were asked for, and work out leftovers ourselves rather than trusting the model's arithmetic.
  const used = new Map(generated.pantry_usage.map((u) => [norm(u.name), Math.max(0, u.used)]));
  const plan: MealPlan = {
    day,
    people,
    diet,
    budget: left.calories,
    meals: generated.meals.filter((m) => meals.includes(m.meal_type)),
    pantry: pantry.map((p: PantryItem) => {
      const u = round3((used.get(norm(p.name)) ?? 0) / BASE_UNIT[p.unit].factor);
      return { ...p, used: u, left: round3(p.qty - u) };
    }),
    to_buy: generated.to_buy,
    prep_ahead: generated.prep_ahead,
    note: generated.note,
  };
  const id = await addPlan(user.id, day, plan);
  return Response.json({ id, plan, plans: await listPlans(user.id) }, { status: 201 });
}
