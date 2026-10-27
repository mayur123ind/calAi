import { currentUser, unauthorized } from "@/lib/auth";
import { exerciseImage, getExercise, isTimed } from "@/lib/exercises";

export async function GET(_request: Request, ctx: RouteContext<"/api/exercises/[id]">) {
  if (!(await currentUser())) return unauthorized();
  const e = getExercise((await ctx.params).id);
  if (!e) return Response.json({ error: "Exercise not found" }, { status: 404 });
  return Response.json({
    ...e,
    timed: isTimed(e),
    photos: e.images ? [exerciseImage(e.id, 0), exerciseImage(e.id, 1)] : [],
  });
}
