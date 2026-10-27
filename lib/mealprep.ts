// Shared by server and client: meal prep types and the calorie split between meals.
import type { MealType, Nutrient } from "./nutrition";

export const PANTRY_UNITS = ["g", "kg", "ml", "l", "pcs"] as const;
export type PantryUnit = (typeof PANTRY_UNITS)[number];
export type PantryItem = { name: string; qty: number; unit: PantryUnit };

export const DIETS = [
  { id: "veg", label: "Veg" },
  { id: "egg", label: "Egg" },
  { id: "nonveg", label: "Non-veg" },
  { id: "vegan", label: "Vegan" },
] as const;
export type Diet = (typeof DIETS)[number]["id"];

/** How a day's calories are usually shared between meals. */
export const MEAL_SHARE: Record<MealType, number> = { breakfast: 0.25, lunch: 0.35, snack: 0.1, dinner: 0.3 };

export type RecipeIngredient = { name: string; amount: number; unit: "g" | "ml" | "pcs" | "tsp" | "tbsp"; from_pantry: boolean };

export type PlannedMeal = {
  meal_type: MealType;
  dish: string;
  why: string;
  prep_minutes: number;
  cook_minutes: number;
  ingredients: RecipeIngredient[];
  portion_grams: number;
  per_portion: Record<Nutrient, number>;
  steps: string[];
  tip: string;
};

/** A pantry line after planning: how much the plan uses and what's left. */
export type PantryUse = PantryItem & { used: number; left: number };

export type MealPlan = {
  day: string;
  people: number;
  diet: Diet;
  budget: number; // kcal left for the planned meals when the plan was made
  meals: PlannedMeal[];
  pantry: PantryUse[];
  to_buy: string[];
  prep_ahead: string[];
  note: string;
};
