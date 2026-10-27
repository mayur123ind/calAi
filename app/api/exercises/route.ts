import type { NextRequest } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import { CATEGORIES, EQUIPMENT, MUSCLES, exerciseImage, searchExercises } from "@/lib/exercises";

const PAGE = 40;
const pick = (v: string | null, allowed: string[]) => (v && allowed.includes(v) ? v : undefined);

/** Searches the exercise library with filters; 40 at a time. */
export async function GET(request: NextRequest) {
  if (!(await currentUser())) return unauthorized();
  const p = request.nextUrl.searchParams;
  const list = searchExercises({
    q: (p.get("q") ?? "").slice(0, 80),
    primary: pick(p.get("primary"), MUSCLES),
    secondary: pick(p.get("secondary"), MUSCLES),
    equipment: pick(p.get("equipment"), EQUIPMENT),
    category: pick(p.get("category"), CATEGORIES),
    sort: p.get("sort") === "level" ? "level" : "name",
  });
  const offset = Math.max(0, Math.min(Number(p.get("offset")) || 0, list.length));
  return Response.json({
    total: list.length,
    filters: { muscles: MUSCLES, equipment: EQUIPMENT, categories: CATEGORIES },
    exercises: list.slice(offset, offset + PAGE).map((e) => ({
      id: e.id,
      name: e.name,
      level: e.level,
      equipment: e.equipment,
      category: e.category,
      primary: e.primary,
      thumb: e.images ? exerciseImage(e.id, 0) : null,
    })),
  });
}
