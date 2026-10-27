import { z } from "zod";
import { MICRO_KEYS, type MicroKey } from "./nutrients";

const num = z.number().finite().min(0).max(100_000);

export const DayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const MealTypeSchema = z.enum(["breakfast", "lunch", "snack", "dinner"]);

export const MicrosSchema = z.partialRecord(z.enum(MICRO_KEYS as [MicroKey, ...MicroKey[]]), num);

export const FoodItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  grams: num,
  calories: num,
  protein_g: num,
  carbs_g: num,
  fat_g: num,
  // Older clients and saved favourites may not send these.
  fiber_g: num.default(0),
  sugar_g: num.default(0),
  sodium_mg: num.default(0),
  micros: MicrosSchema.nullable().optional(),
  unit: z.string().trim().min(1).max(24).nullable().optional(),
  unit_grams: z.number().finite().positive().max(5000).nullable().optional(),
});

export const ItemsSchema = z.array(FoodItemSchema).min(1).max(40);
