// Detailed nutrients beyond the seven core ones, shared by server and client.
// Stored per food item as a sparse JSON object; a missing key means "not known", not zero.

import type { Sex } from "./nutrition";

export const MICROS = [
  { key: "sat_fat_g", label: "Saturated fat", unit: "g", kind: "limit" },
  { key: "trans_fat_g", label: "Trans fat", unit: "g", kind: "limit" },
  { key: "mono_fat_g", label: "Monounsaturated fat", unit: "g", kind: "info" },
  { key: "poly_fat_g", label: "Polyunsaturated fat", unit: "g", kind: "info" },
  { key: "omega3_g", label: "Omega-3", unit: "g", kind: "goal" },
  { key: "cholesterol_mg", label: "Cholesterol", unit: "mg", kind: "limit" },
  { key: "potassium_mg", label: "Potassium", unit: "mg", kind: "goal" },
  { key: "calcium_mg", label: "Calcium", unit: "mg", kind: "goal" },
  { key: "iron_mg", label: "Iron", unit: "mg", kind: "goal" },
  { key: "magnesium_mg", label: "Magnesium", unit: "mg", kind: "goal" },
  { key: "zinc_mg", label: "Zinc", unit: "mg", kind: "goal" },
  { key: "vitamin_a_mcg", label: "Vitamin A", unit: "mcg", kind: "goal" },
  { key: "vitamin_c_mg", label: "Vitamin C", unit: "mg", kind: "goal" },
  { key: "vitamin_d_mcg", label: "Vitamin D", unit: "mcg", kind: "goal" },
  { key: "vitamin_e_mg", label: "Vitamin E", unit: "mg", kind: "goal" },
  { key: "vitamin_k_mcg", label: "Vitamin K", unit: "mcg", kind: "goal" },
  { key: "vitamin_b6_mg", label: "Vitamin B6", unit: "mg", kind: "goal" },
  { key: "vitamin_b12_mcg", label: "Vitamin B12", unit: "mcg", kind: "goal" },
  { key: "folate_mcg", label: "Folate", unit: "mcg", kind: "goal" },
] as const;

export type MicroKey = (typeof MICROS)[number]["key"];
export type Micros = Partial<Record<MicroKey, number>>;
export const MICRO_KEYS = MICROS.map((m) => m.key) as MicroKey[];

/** Every nutrient a Home card or nutrient goal can point at: the core six (not calories) plus the micros. */
export const CARD_NUTRIENTS = [
  { key: "protein_g", label: "Protein", unit: "g", kind: "goal" },
  { key: "carbs_g", label: "Carbs", unit: "g", kind: "goal" },
  { key: "fat_g", label: "Fat", unit: "g", kind: "goal" },
  { key: "fiber_g", label: "Fiber", unit: "g", kind: "goal" },
  { key: "sugar_g", label: "Sugar", unit: "g", kind: "limit" },
  { key: "sodium_mg", label: "Sodium", unit: "mg", kind: "limit" },
  ...MICROS,
] as const;

export type CardKey = (typeof CARD_NUTRIENTS)[number]["key"];
export const cardInfo = (key: CardKey) => CARD_NUTRIENTS.find((n) => n.key === key)!;

/**
 * Reference daily amounts for adults (US/WHO dietary reference intakes), used until the person sets
 * or AI-estimates their own. "info" nutrients have no reference and return null.
 */
export function referenceGoal(key: MicroKey, sex: Sex, age: number, calories: number): number | null {
  const m = sex === "male";
  switch (key) {
    case "sat_fat_g":
      return Math.round((calories * 0.1) / 9);
    case "trans_fat_g":
      return Math.round(((calories * 0.01) / 9) * 10) / 10;
    case "omega3_g":
      return m ? 1.6 : 1.1;
    case "cholesterol_mg":
      return 300;
    case "potassium_mg":
      return m ? 3400 : 2600;
    case "calcium_mg":
      return (m && age > 70) || (!m && age > 50) ? 1200 : 1000;
    case "iron_mg":
      return m || age > 50 ? 8 : 18;
    case "magnesium_mg":
      return m ? (age > 30 ? 420 : 400) : age > 30 ? 320 : 310;
    case "zinc_mg":
      return m ? 11 : 8;
    case "vitamin_a_mcg":
      return m ? 900 : 700;
    case "vitamin_c_mg":
      return m ? 90 : 75;
    case "vitamin_d_mcg":
      return age > 70 ? 20 : 15;
    case "vitamin_e_mg":
      return 15;
    case "vitamin_k_mcg":
      return m ? 120 : 90;
    case "vitamin_b6_mg":
      return age > 50 ? (m ? 1.7 : 1.5) : 1.3;
    case "vitamin_b12_mcg":
      return 2.4;
    case "folate_mcg":
      return 400;
    default:
      return null;
  }
}

export function sumMicros(items: { micros?: Micros | null }[]): Micros {
  const out: Micros = {};
  for (const i of items) {
    for (const [k, v] of Object.entries(i.micros ?? {}) as [MicroKey, number][]) {
      if (typeof v === "number") out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}
