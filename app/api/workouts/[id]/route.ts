import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { deleteWorkoutEntry, saveWorkoutEntry } from "@/lib/db";

const notFound = () => Response.json({ error: "Workout entry not found" }, { status: 404 });
const n = (max: number) => z.number().finite().min(0).max(max).nullable();

const Body = z.object({
  note: z.string().trim().max(300).nullable(),
  sets: z
    .array(z.object({ reps: n(1000), weight_kg: n(1000), rpe: z.number().min(1).max(10).nullable(), minutes: n(600), done: z.boolean() }))
    .max(30),
});

/** Saves an exercise card: its note and every set. */
export async function PUT(request: Request, ctx: RouteContext<"/api/workouts/[id]">) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = Number((await ctx.params).id);
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Check the reps, weights and RPE (1–10)." }, { status: 400 });
  if (!Number.isInteger(id) || !(await saveWorkoutEntry(user.id, id, { ...body.data, note: body.data.note || null }))) return notFound();
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/workouts/[id]">) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || !(await deleteWorkoutEntry(user.id, id))) return notFound();
  return new Response(null, { status: 204 });
}
