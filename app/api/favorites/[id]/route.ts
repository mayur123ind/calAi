import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { deleteFavorite, getFavorites, renameFavorite } from "@/lib/db";

const notFound = () => Response.json({ error: "Favourite not found" }, { status: 404 });

export async function DELETE(_request: Request, ctx: RouteContext<"/api/favorites/[id]">) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || !(await deleteFavorite(user.id, id))) return notFound();
  return Response.json({ favorites: await getFavorites(user.id) });
}

const Patch = z.object({ name: z.string().trim().min(1).max(80) });

export async function PATCH(request: Request, ctx: RouteContext<"/api/favorites/[id]">) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = Number((await ctx.params).id);
  const body = Patch.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Give the favourite a name." }, { status: 400 });
  if (!Number.isInteger(id) || !(await renameFavorite(user.id, id, body.data.name))) return notFound();
  return Response.json({ favorites: await getFavorites(user.id) });
}
