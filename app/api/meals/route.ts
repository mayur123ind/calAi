import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { addMeal } from "@/lib/db";
import { parsePhotoData } from "@/lib/photos";
import { DayKey, ItemsSchema, MealTypeSchema } from "@/lib/schemas";

const Body = z.object({
  day: DayKey,
  meal_type: MealTypeSchema,
  note: z.string().max(600).nullable(),
  photo: z
    .string()
    .max(400_000)
    .regex(/^data:image\/(jpeg|png|webp);base64,/)
    .nullable(),
  items: ItemsSchema,
});

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Every item needs a name and numbers of zero or more." }, { status: 400 });
  }
  const photo = body.data.photo ? parsePhotoData(body.data.photo) : null;
  const id = await addMeal(user.id, { ...body.data, photo, eaten_at: new Date().toISOString() });
  return Response.json({ id }, { status: 201 });
}
