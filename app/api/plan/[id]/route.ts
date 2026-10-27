import { currentUser, unauthorized } from "@/lib/auth";
import { deletePlan, getPlan, listPlans } from "@/lib/db";

const notFound = () => Response.json({ error: "Plan not found" }, { status: 404 });

export async function GET(_request: Request, ctx: RouteContext<"/api/plan/[id]">) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = Number((await ctx.params).id);
  const plan = Number.isInteger(id) ? await getPlan(user.id, id) : null;
  return plan ? Response.json({ id, plan }) : notFound();
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/plan/[id]">) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || !await deletePlan(user.id, id)) return notFound();
  return Response.json({ plans: await listPlans(user.id) });
}
