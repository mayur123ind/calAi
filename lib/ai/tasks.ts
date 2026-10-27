import "server-only";
import { z } from "zod";
import { MICROS, MICRO_KEYS, type MicroKey } from "../nutrients";
import { generateJson, generateText, type Part } from "./index";

export { AiError as AnalyzeError } from "./core";

const Micros = z.object(Object.fromEntries(MICRO_KEYS.map((k) => [k, z.number()])) as Record<MicroKey, z.ZodNumber>);

export const AnalyzedItem = z.object({
  name: z.string(),
  grams: z.number(),
  calories: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  fiber_g: z.number(),
  sugar_g: z.number(),
  sodium_mg: z.number(),
  micros: Micros,
  unit: z.string(),
  unit_grams: z.number(),
  confidence: z.enum(["high", "medium", "low"]),
});

export const AnalyzedMeal = z.object({
  items: z.array(AnalyzedItem),
  question: z.string(),
});
export type AnalyzedMeal = z.infer<typeof AnalyzedMeal>;

export const WeeklyInsight = z.object({
  headline: z.string(),
  wins: z.array(z.string()),
  improve: z.array(z.string()),
  tip: z.string(),
});
export type WeeklyInsight = z.infer<typeof WeeklyInsight>;

const Nutrition = z.object({
  calories: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  fiber_g: z.number(),
  sugar_g: z.number(),
  sodium_mg: z.number(),
});

export const GeneratedPlan = z.object({
  meals: z.array(
    z.object({
      meal_type: z.enum(["breakfast", "lunch", "snack", "dinner"]),
      dish: z.string(),
      why: z.string(),
      prep_minutes: z.number(),
      cook_minutes: z.number(),
      ingredients: z.array(
        z.object({
          name: z.string(),
          amount: z.number(),
          unit: z.enum(["g", "ml", "pcs", "tsp", "tbsp"]),
          from_pantry: z.boolean(),
        }),
      ),
      portion_grams: z.number(),
      per_portion: Nutrition,
      steps: z.array(z.string()),
      tip: z.string(),
    }),
  ),
  pantry_usage: z.array(z.object({ name: z.string(), used: z.number() })),
  to_buy: z.array(z.string()),
  prep_ahead: z.array(z.string()),
  note: z.string(),
});
export type GeneratedPlan = z.infer<typeof GeneratedPlan>;

const MICRO_LIST = MICROS.map((m) => `${m.key} (${m.unit})`).join(", ");

const MEAL_PROMPT = `You estimate nutrition for a personal calorie tracker. The user is usually eating Indian home food,
but handle any cuisine. You may get several photos of the same meal (different angles, or separate dishes);
treat them together as ONE meal and never count the same food twice across photos.

For every distinct food you can see (or that the user describes):
- name it the way a person would say it ("Dal tadka", "Phulka roti", "Cucumber raita")
- estimate the portion in grams, using the plate, katori, spoon or hand for scale
  (one phulka is about 30–40 g, a katori holds about 150 g, a cup of rice is about 160 g cooked)
- give calories, protein, carbs and fat for that portion, accounting for visible oil or ghee
- also give fiber (g), sugar (g, natural plus added) and sodium (mg), including salt used in cooking
- give "micros" for the same portion: ${MICRO_LIST}. Use realistic food-composition values; 0 when the food has
  essentially none (e.g. cholesterol in plant foods).
- "unit" is the natural serving people count this food in, when there is one you can see or they mention:
  "roti", "slice", "piece", "idli", "cup", "katori", "glass", "ml" (for drinks), "egg". Use "" when grams is the
  only sensible unit. "unit_grams" is how many grams ONE of that unit weighs (for ml use the grams per ml × 1).
  Grams stay the source of truth: grams = count × unit_grams.
- set confidence to "low" when the portion or the dish is hard to judge

Count identical pieces as one item with the combined weight (e.g. "Phulka roti" 80 g, unit "roti", unit_grams 40).
If the user's note gives counts or ingredients, trust it over the photos.
Set "question" to one short question only if the answer would change the estimate a lot
(e.g. "Is the curry made with cream?"); otherwise set it to "".
If there is no food, return an empty items list and use "question" to say so.`;

const INSIGHT_PROMPT = `You are a friendly, practical nutrition coach inside a calorie tracker used mostly by people eating
Indian home food. You get one person's last 7 days: daily totals, their targets and the foods they ate most.

Write short, specific observations grounded in the numbers (mention days, foods or amounts).
- headline: one sentence summing up the week
- wins: 2–3 things that went well
- improve: 2–3 concrete things to change, with a food swap or habit where possible
- tip: one small action for tomorrow
Days with zero calories were not logged; say so instead of treating them as fasting.
Never give medical advice or suggest eating below 1,200 kcal. Plain sentences, no markdown.`;

const PLAN_PROMPT = `You are a home-cooking coach inside a calorie tracker, mostly used by people cooking Indian home food.
You get: the ingredients the person has (with quantities and units), which meals to plan, how many people
are eating, their diet, any notes, and a calorie budget plus macro targets for each meal for ONE person.

Plan one dish (or a simple combo like "Dal + phulka") for each requested meal:
- Build every dish mainly from their ingredients. Never use more of an ingredient than they have, across all meals together.
- You may assume basic staples without listing them in to_buy: salt, cooking oil or ghee, water, turmeric,
  chilli powder, cumin, mustard seeds, garam masala, ginger-garlic paste. Still list oil/ghee and any staple
  in the recipe ingredients with real amounts (from_pantry false unless they listed it), because they count toward calories.
- Respect the diet strictly: veg = no meat, fish or egg; egg = veg plus eggs; vegan = no dairy, ghee, honey or egg.
- Ingredient amounts are what to cook for ALL people together, in g or ml (raw weight), pcs for countable items,
  or tsp/tbsp for spices and oil. Weigh dry staples raw (e.g. rice 80 g raw per person, atta 40 g per 2 phulkas).
- portion_grams is the cooked weight ONE person should put on their plate; per_portion is that portion's nutrition.
  Aim each portion within about 10% of that meal's calorie budget and lean toward the protein target.
- steps: 4 to 8 short, clear instructions in order, with heat level, timings and visual cues
  ("Cook on medium heat for 6–7 min until the onions turn golden").
- tip: one practical tip (storage, swaps, how to make it lighter).
- why: one sentence on how the dish fits their goals.
- pantry_usage: for EVERY ingredient they listed, the total amount the plan uses across all meals and people, in the
  SAME unit they gave (g, ml or pcs) and with the exact same name. Use 0 for unused items.
- to_buy: anything the recipes need that they don't have and isn't a basic staple. Empty if nothing.
- prep_ahead: 2 to 4 meal-prep steps that save time today (soak, knead dough once for all meals, chop together, marinate).
- note: one sentence summary of the day's plan.
Plain text only, no markdown.`;

export type MealImage = { base64: string; mimeType: string };

export async function analyzeMeal(userId: number, input: { images: MealImage[]; note?: string }) {
  const parts: Part[] = input.images.map((i) => ({ image: { mimeType: i.mimeType, data: i.base64 } }));
  const note = input.note?.trim();
  const count = input.images.length;
  parts.push({
    text: [
      count > 1 ? `${count} photos of one meal.` : "",
      note ? `User note: ${note}` : count ? "Estimate this meal." : "",
    ]
      .filter(Boolean)
      .join(" "),
  });
  // Several photos and detailed nutrients take longer than a single estimate.
  return generateJson(userId, AnalyzedMeal, MEAL_PROMPT, [{ role: "user", parts }], {
    // Per attempt; a model that takes longer hands over to the fallback model.
    timeoutMs: count > 3 ? 50_000 : count > 0 ? 30_000 : 20_000,
  });
}

export async function generateMealPlan(userId: number, request: unknown) {
  return generateJson(userId, GeneratedPlan, PLAN_PROMPT, [{ role: "user", parts: [{ text: JSON.stringify(request) }] }], {
    timeoutMs: 60_000,
    maxTokens: 12000,
  });
}

export async function weeklyInsight(userId: number, summary: unknown) {
  return generateJson(userId, WeeklyInsight, INSIGHT_PROMPT, [{ role: "user", parts: [{ text: JSON.stringify(summary) }] }]);
}

// ---------- Meal What if? ----------

const WHAT_IF_PROMPT = `You are a practical nutrition coach inside a calorie tracker (mostly Indian home food).
You get today's targets, what's already logged today, a meal the person is about to log, and what today would
look like after it. Give ONE short, practical suggestion (2–3 sentences, plain text, no markdown): whether this
meal fits, and if not, a concrete tweak (smaller portion of a named item, a swap, adding protein or vegetables,
or what to keep lighter later today). Mention numbers only when they help. Never suggest eating under 1,200 kcal
a day, and never give medical advice.`;

export async function whatIfSuggestion(userId: number, context: unknown) {
  return generateText(userId, WHAT_IF_PROMPT, [{ role: "user", parts: [{ text: JSON.stringify(context) }] }], {
    timeoutMs: 30_000,
    maxTokens: 2000,
  });
}

// ---------- AI nutrient goals ----------

const NutrientGoals = z.object({
  goals: Micros,
  note: z.string(),
});

const GOALS_PROMPT = `You set daily intake goals for detailed nutrients in a calorie tracker. You get a person's sex, age,
height, weight, activity, weight goal and daily calorie target. Return a daily goal for each nutrient, based on
current dietary reference intakes for someone like them (use the Upper Limit-style cap for nutrients people should
limit: saturated fat, trans fat, cholesterol). Do NOT change calories, protein, carbs or fat; they are not asked for.
For monounsaturated and polyunsaturated fat give a sensible daily amount for their calories.
note: one sentence on anything notable (e.g. more iron for menstruating women). Plain text.`;

export async function estimateNutrientGoals(userId: number, profile: unknown) {
  return generateJson(userId, NutrientGoals, GOALS_PROMPT, [{ role: "user", parts: [{ text: JSON.stringify(profile) }] }]);
}
