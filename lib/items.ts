// Food item math for the review screen, shared by every way of logging. Grams are the source of truth:
// servings, calories and every nutrient scale from them.

import { MICRO_KEYS, type MicroKey, type Micros } from "./nutrients";
import { NUTRIENTS, type FoodItem, type Nutrient } from "./nutrition";

export type Confidence = "high" | "medium" | "low";

export type EditItem = FoodItem & {
  key: string;
  confidence?: Confidence;
  /** Per-gram values of every nutrient, so changing grams rescales the rest. */
  per: Record<string, number> | null;
  /** Locked: serving changes scale the nutrients. Unlocked: nutrients are edited directly. */
  locked: boolean;
};

let keySeq = 0;
export const newKey = () => `i${++keySeq}`;

export function perGram(i: FoodItem): EditItem["per"] {
  if (!(i.grams > 0)) return null;
  const per: Record<string, number> = {};
  for (const n of NUTRIENTS) per[n] = (i[n] ?? 0) / i.grams;
  for (const [k, v] of Object.entries(i.micros ?? {})) per[k] = (v ?? 0) / i.grams;
  return per;
}

export function toEdit(i: FoodItem & { confidence?: Confidence }): EditItem {
  const item: FoodItem = {
    ...i,
    fiber_g: i.fiber_g ?? 0,
    sugar_g: i.sugar_g ?? 0,
    sodium_mg: i.sodium_mg ?? 0,
    micros: i.micros ?? null,
    unit: i.unit && i.unit_grams && i.unit_grams > 0 ? i.unit : null,
    unit_grams: i.unit && i.unit_grams && i.unit_grams > 0 ? i.unit_grams : null,
  };
  return { ...item, confidence: i.confidence, key: newKey(), per: perGram(item), locked: true };
}

/** New grams: every nutrient follows from the per-gram values. */
export function scaleTo(i: EditItem, grams: number): EditItem {
  const next: EditItem = { ...i, grams };
  if (!i.per) return next;
  for (const n of NUTRIENTS) next[n] = (i.per[n] ?? 0) * grams;
  if (i.micros) {
    next.micros = Object.fromEntries(Object.keys(i.micros).map((k) => [k, (i.per![k] ?? 0) * grams])) as Micros;
  }
  return next;
}

/** A nutrient typed in by hand (unlocked). The per-gram values follow, so a later serving change scales from it. */
export function setNutrient(i: EditItem, field: Nutrient | MicroKey, value: number): EditItem {
  const next: EditItem = (NUTRIENTS as readonly string[]).includes(field)
    ? { ...i, [field]: value }
    : { ...i, micros: { ...(i.micros ?? {}), [field]: value } };
  return { ...next, per: perGram(next) };
}

export const servings = (i: FoodItem) => (i.unit && i.unit_grams ? i.grams / i.unit_grams : null);

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** What gets saved: decimals kept (1 place for grams and macros, 2 for small nutrients), unknowns dropped. */
export function toSaved(i: EditItem): FoodItem {
  const micros = Object.fromEntries(
    MICRO_KEYS.filter((k) => typeof i.micros?.[k] === "number" && Number.isFinite(i.micros[k])).map((k) => [k, r2(i.micros![k]!)]),
  );
  return {
    name: i.name.trim(),
    grams: r1(i.grams),
    calories: r1(i.calories),
    protein_g: r1(i.protein_g),
    carbs_g: r1(i.carbs_g),
    fat_g: r1(i.fat_g),
    fiber_g: r1(i.fiber_g),
    sugar_g: r1(i.sugar_g),
    sodium_mg: r1(i.sodium_mg),
    micros: Object.keys(micros).length ? micros : null,
    unit: i.unit && i.unit_grams ? i.unit : null,
    unit_grams: i.unit && i.unit_grams ? r1(i.unit_grams) : null,
  };
}

export const blankItem = (): FoodItem => ({
  name: "",
  grams: 100,
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  fiber_g: 0,
  sugar_g: 0,
  sodium_mg: 0,
});
