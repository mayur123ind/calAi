import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { deleteMeal, getMeal, updateMeal } from "@/lib/db";
import { ItemsSchema, MealTypeSchema } from "@/lib/schemas";

const notFound = () => Response.json({ error: "Meal not found" }, { status: 404 });

async function mealId(ctx: RouteContext<"/api/meals/[id]">) {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) ? id : null;
}

export async function GET(_request: Request, ctx: RouteContext<"/api/meals/[id]">) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = await mealId(ctx);
  const meal = id === null ? null : await getMeal(user.id, id);
  return meal ? Response.json(meal) : notFound();
}

const Body = z.object({
  meal_type: MealTypeSchema,
  note: z.string().max(600).nullable(),
  items: ItemsSchema,
});

export async function PUT(request: Request, ctx: RouteContext<"/api/meals/[id]">) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = await mealId(ctx);
  if (id === null) return notFound();
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Every item needs a name and numbers of zero or more." }, { status: 400 });
  }
  return await updateMeal(user.id, id, body.data) ? Response.json({ id }) : notFound();
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/meals/[id]">) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = await mealId(ctx);
  if (id === null) return Response.json({ error: "Invalid id" }, { status: 400 });
  if (!await deleteMeal(user.id, id)) return notFound();
  return new Response(null, { status: 204 });
}
