// The exercise library: 876 exercises from free-exercise-db (github.com/yuhonas/free-exercise-db, Unlicense),
// trimmed into lib/data/exercises.json. Photos are served by jsDelivr from a pinned commit.

import data from "./data/exercises.json";

export type Exercise = {
  id: string;
  name: string;
  level: "beginner" | "intermediate" | "expert";
  mechanic: "compound" | "isolation" | null;
  force: "push" | "pull" | "static" | null;
  equipment: string;
  category: string;
  primary: string[];
  secondary: string[];
  instructions: string[];
  /** 2 when there are start and end photos, 0 when there are none. */
  images: number;
};

export const EXERCISES = data as Exercise[];
const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));
export const getExercise = (id: string) => BY_ID.get(id);

const IMAGE_BASE = "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises";
export const exerciseImage = (id: string, phase: 0 | 1) => `${IMAGE_BASE}/${id}/${phase}.jpg`;

const uniq = (values: string[]) => [...new Set(values)].sort();
export const MUSCLES = uniq(EXERCISES.flatMap((e) => [...e.primary, ...e.secondary]));
export const EQUIPMENT = uniq(EXERCISES.map((e) => e.equipment));
export const CATEGORIES = uniq(EXERCISES.map((e) => e.category));

export type LibraryQuery = {
  q?: string;
  primary?: string;
  secondary?: string;
  equipment?: string;
  category?: string;
  sort?: "name" | "level";
};

const LEVEL_ORDER = { beginner: 0, intermediate: 1, expert: 2 };

export function searchExercises(query: LibraryQuery): Exercise[] {
  const words = (query.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const list = EXERCISES.filter(
    (e) =>
      (!query.primary || e.primary.includes(query.primary)) &&
      (!query.secondary || e.secondary.includes(query.secondary)) &&
      (!query.equipment || e.equipment === query.equipment) &&
      (!query.category || e.category === query.category) &&
      words.every((w) => `${e.name} ${e.primary.join(" ")} ${e.equipment}`.toLowerCase().includes(w)),
  );
  return query.sort === "level"
    ? list.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.name.localeCompare(b.name))
    : list.sort((a, b) => a.name.localeCompare(b.name));
}

/** Timed rather than counted: cardio and stretches log minutes instead of reps and weight. */
export const isTimed = (e: Pick<Exercise, "category">) => e.category === "cardio" || e.category === "stretching";
