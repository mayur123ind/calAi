import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { addFavorite, getFavorites, getMeal } from "@/lib/db";

// Saved from an existing meal; the name defaults to its foods.
const Body = z.object({
  mealId: z.number().int(),
  name: z.string().trim().max(80).optional(),
});

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const meal = await getMeal(user.id, body.data.mealId);
  if (!meal) return Response.json({ error: "Meal not found" }, { status: 404 });
  const name = body.data.name || meal.items.map((i) => i.name).join(", ").slice(0, 80);
  await addFavorite(user.id, { name, meal_type: meal.meal_type, items: meal.items });
  return Response.json({ favorites: await getFavorites(user.id) }, { status: 201 });
}
