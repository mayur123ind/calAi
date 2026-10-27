import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { getFavorites, reorderFavorites } from "@/lib/db";

const Body = z.object({ ids: z.array(z.number().int()).max(500) });

/** Saves the order favourites were dragged into. */
export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid order" }, { status: 400 });
  await reorderFavorites(user.id, body.data.ids);
  return Response.json({ favorites: await getFavorites(user.id) });
}
