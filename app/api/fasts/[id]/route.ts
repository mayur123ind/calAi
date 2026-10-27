import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { deleteFast, getActiveFast, listFasts, updateFast } from "@/lib/db";

const notFound = () => Response.json({ error: "Fast not found" }, { status: 404 });
const iso = z.iso.datetime({ offset: true });
const Body = z
  .object({ started_at: iso, ended_at: iso, goal_hours: z.number().min(1).max(168) })
  .refine((f) => f.ended_at > f.started_at && Date.parse(f.ended_at) - Date.parse(f.started_at) <= 14 * 86_400_000);

async function state(userId: number) {
  return { active: (await getActiveFast(userId)) ?? null, history: await listFasts(userId) };
}

/** Edit a completed fast's times or goal. */
export async function PUT(request: Request, ctx: RouteContext<"/api/fasts/[id]">) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = Number((await ctx.params).id);
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "The end must be after the start, within 14 days." }, { status: 400 });
  if (body.data.ended_at > new Date().toISOString()) return Response.json({ error: "The end can't be in the future." }, { status: 400 });
  if (!Number.isInteger(id) || !(await updateFast(user.id, id, body.data))) return notFound();
  return Response.json(await state(user.id));
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/fasts/[id]">) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || !(await deleteFast(user.id, id))) return notFound();
  return Response.json(await state(user.id));
}
