// Shared by server and client: types, goal math and formatting helpers.

import { referenceGoal, type CardKey, type MicroKey, type Micros } from "./nutrients";

export type MealType = "breakfast" | "lunch" | "snack" | "dinner";
export const MEAL_TYPES: { id: MealType; label: string }[] = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "snack", label: "Snack" },
  { id: "dinner", label: "Dinner" },
];

export type FoodItem = {
  name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  /** Detailed nutrients for this portion, when known. */
  micros?: Micros | null;
  /** A visible serving unit ("slice", "cup") and how many grams one is. Grams stay the source of truth. */
  unit?: string | null;
  unit_grams?: number | null;
};

/** Every number on a food item, in the order they're shown and exported. */
export const NUTRIENTS = ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "sodium_mg"] as const;
export type Nutrient = (typeof NUTRIENTS)[number];

export type Meal = {
  id: number;
  day: string;
  eaten_at: string;
  meal_type: MealType;
  note: string | null;
  photo: string | null;
  items: FoodItem[];
};

export type Totals = Record<Nutrient, number>;

export type Sex = "female" | "male";
export type Goal = "lose" | "maintain" | "gain";
export type Split = "balanced" | "protein" | "lowcarb";
export type Macro = "protein_g" | "carbs_g" | "fat_g";

export type Profile = {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: number;
  goal: Goal;
  split: Split;
  customKcal: number | null;
  targetWeightKg: number | null;
  /** Macros fixed in grams; the others share what's left of the calories. */
  pinned: Partial<Record<Macro, number>>;
  /** Weekly correction from Adaptive Goals, added to the calorie target. */
  adaptiveKcal: number;
};

// fiber_g is a minimum; sugar_g and sodium_mg are upper limits.
export type Targets = Record<Nutrient, number>;

export type Reminders = { enabled: boolean; breakfast: string; lunch: string; dinner: string };
export type Theme = "system" | "light" | "dark";
export type MealTimes = Record<MealType, string>;

export type Prefs = {
  waterGoalMl: number;
  reminders: Reminders;
  water: { enabled: boolean; glassMl: number; reminder: boolean; reminderEveryHours: number };
  fasting: { enabled: boolean; goalHours: number; alert: boolean };
  theme: Theme;
  /** 0 = Sunday, 1 = Monday, 6 = Saturday. */
  weekStart: 0 | 1 | 6;
  /** When each meal begins, for automatic meal grouping. */
  mealTimes: MealTimes;
  /** The three nutrient cards under the calorie ring on Home. */
  homeCards: CardKey[];
  logSort: "grouped" | "latest";
  /** Personal goals for detailed nutrients; anything missing falls back to the reference amount. */
  nutrientGoals: Partial<Record<MicroKey, number>>;
  adaptive: { enabled: boolean; lastCheck: string | null; note: string | null };
  bodyFat: boolean;
  training: { focus: "general" | "strength" | "muscle" | "endurance"; daysPerWeek: number; equipment: string };
  /** "auto" follows the browser's language. */
  language: string;
};

export const DEFAULT_PREFS: Prefs = {
  waterGoalMl: 2500,
  reminders: { enabled: false, breakfast: "10:00", lunch: "14:30", dinner: "21:30" },
  water: { enabled: false, glassMl: 250, reminder: false, reminderEveryHours: 2 },
  fasting: { enabled: false, goalHours: 16, alert: true },
  theme: "system",
  weekStart: 1,
  mealTimes: { breakfast: "05:00", lunch: "11:00", snack: "16:00", dinner: "19:00" },
  homeCards: ["protein_g", "carbs_g", "fat_g"],
  logSort: "grouped",
  nutrientGoals: {},
  adaptive: { enabled: true, lastCheck: null, note: null },
  bodyFat: false,
  training: { focus: "general", daysPerWeek: 3, equipment: "" },
  language: "auto",
};

/** Saved prefs over the defaults, one level deep, so new settings get their default for older accounts. */
export function withDefaultPrefs(saved: Partial<Prefs> | null | undefined): Prefs {
  const out = { ...DEFAULT_PREFS, ...saved } as Prefs;
  for (const key of ["reminders", "water", "fasting", "mealTimes", "adaptive", "training"] as const) {
    (out as Record<string, unknown>)[key] = { ...DEFAULT_PREFS[key], ...(saved?.[key] ?? {}) };
  }
  return out;
}

export const GLASS_ML = 250;

export const DEFAULT_PROFILE: Profile = {
  sex: "male",
  age: 30,
  heightCm: 170,
  weightKg: 70,
  activity: 1.375,
  goal: "maintain",
  split: "balanced",
  customKcal: null,
  targetWeightKg: null,
  pinned: {},
  adaptiveKcal: 0,
};

export const ACTIVITY_LEVELS = [
  { value: 1.2, label: "Sedentary", hint: "Desk or home-based work, little or no training" },
  { value: 1.375, label: "Light", hint: "Mostly seated work with some walking, or light training 1–3 days a week" },
  { value: 1.55, label: "Moderate", hint: "On your feet for part of the day, or training 3–5 days a week" },
  { value: 1.725, label: "Active", hint: "Standing or walking work most of the day, or hard training 6–7 days a week" },
  { value: 1.9, label: "Very active", hint: "Physical work such as farming or construction, or training twice a day" },
  { value: 2.05, label: "Extra active", hint: "Heavy manual labour plus daily training, or endurance athlete volume" },
];

export const GOALS: { id: Goal; label: string; delta: number; hint: string }[] = [
  { id: "lose", label: "Lose weight", delta: -500, hint: "About 0.5 kg a week" },
  { id: "maintain", label: "Maintain", delta: 0, hint: "Stay where you are" },
  { id: "gain", label: "Gain weight", delta: 300, hint: "Slow, lean gain" },
];

// Share of calories from protein / carbs / fat.
export const SPLITS: { id: Split; label: string; p: number; c: number; f: number }[] = [
  { id: "balanced", label: "Balanced", p: 0.25, c: 0.45, f: 0.3 },
  { id: "protein", label: "High protein", p: 0.35, c: 0.35, f: 0.3 },
  { id: "lowcarb", label: "Lower carb", p: 0.3, c: 0.25, f: 0.45 },
];

export const MIN_KCAL: Record<Sex, number> = { female: 1200, male: 1500 };
export const KCAL_PER_GRAM: Record<Macro, number> = { protein_g: 4, carbs_g: 4, fat_g: 9 };

/** Mifflin-St Jeor resting energy. */
export function bmr(p: Pick<Profile, "sex" | "weightKg" | "heightCm" | "age">): number {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === "male" ? 5 : -161);
}

/** Resting energy times activity: what maintaining this weight takes. */
export const tdee = (p: Profile) => bmr(p) * p.activity;

/** TDEE plus the goal adjustment, before any Adaptive Goals correction. */
export function suggestedCalories(p: Profile): number {
  const delta = GOALS.find((g) => g.id === p.goal)?.delta ?? 0;
  const kcal = Math.round((tdee(p) + delta) / 10) * 10;
  return Math.max(MIN_KCAL[p.sex], kcal);
}

export function targetsFor(p: Profile): Targets {
  const base = p.customKcal ?? suggestedCalories(p);
  const calories = Math.max(MIN_KCAL[p.sex], base + (p.adaptiveKcal ?? 0));
  const split = SPLITS.find((s) => s.id === p.split) ?? SPLITS[0];
  const share: Record<Macro, number> = { protein_g: split.p, carbs_g: split.c, fat_g: split.f };

  // Pinned macros keep their grams; the unpinned ones split the remaining calories in their usual ratio.
  const pinned = p.pinned ?? {};
  const pinnedKcal = (Object.keys(pinned) as Macro[]).reduce((s, m) => s + (pinned[m] ?? 0) * KCAL_PER_GRAM[m], 0);
  const free = (["protein_g", "carbs_g", "fat_g"] as Macro[]).filter((m) => pinned[m] === undefined);
  const freeShare = free.reduce((s, m) => s + share[m], 0);
  const left = Math.max(0, calories - pinnedKcal);
  const grams = (m: Macro) =>
    pinned[m] !== undefined ? pinned[m]! : freeShare > 0 ? Math.round((left * (share[m] / freeShare)) / KCAL_PER_GRAM[m]) : 0;

  return {
    calories,
    protein_g: grams("protein_g"),
    carbs_g: grams("carbs_g"),
    fat_g: grams("fat_g"),
    // 14 g fiber per 1,000 kcal; free sugar under 10% of calories; WHO sodium limit.
    fiber_g: Math.round((calories / 1000) * 14),
    sugar_g: Math.round((calories * 0.1) / 4),
    sodium_mg: 2000,
  };
}

/** The daily goal for any nutrient a card can show: the person's own, else the reference amount. */
export function goalFor(key: CardKey, profile: Profile, targets: Targets, prefs: Pick<Prefs, "nutrientGoals">): number | null {
  if (key in targets) return targets[key as Nutrient];
  const own = prefs.nutrientGoals[key as MicroKey];
  if (typeof own === "number") return own;
  return referenceGoal(key as MicroKey, profile.sex, profile.age, targets.calories);
}

export const emptyTotals = (): Totals =>
  Object.fromEntries(NUTRIENTS.map((n) => [n, 0])) as Totals;

export function sumItems(items: FoodItem[]): Totals {
  const t = emptyTotals();
  for (const i of items) for (const n of NUTRIENTS) t[n] += i[n] ?? 0;
  return t;
}

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Which meal a time of day falls in, using the person's meal start times. */
export function mealTypeAt(date: Date, times: MealTimes = DEFAULT_PREFS.mealTimes): MealType {
  const now = date.getHours() * 60 + date.getMinutes();
  const starts = MEAL_TYPES.map((t) => ({ id: t.id, at: minutesOf(times[t.id]) })).sort((a, b) => a.at - b.at);
  // Before the first start of the day still counts as the last meal of the night before.
  let current = starts[starts.length - 1].id;
  for (const s of starts) if (now >= s.at) current = s.id;
  return current;
}


const nf = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
export const fmt = (n: number) => nf.format(Math.round(n));
/** Up to one decimal, for macros and detailed nutrients. */
export const fmt1 = (n: number) => nf1.format(Math.round(n * 10) / 10);

