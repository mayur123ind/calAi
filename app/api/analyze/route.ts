import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { AnalyzeError, analyzeMeal } from "@/lib/ai/tasks";

export const maxDuration = 90;

const Image = z.object({
  base64: z.string().min(1).max(2_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

// Up to 10 photos of one meal, analysed together; or just a description.
const Body = z
  .object({
    images: z.array(Image).max(10).default([]),
    note: z.string().max(600).optional(),
  })
  .refine((b) => b.images.length > 0 || b.note?.trim(), "Send a photo or a description");

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Add up to 10 photos, or describe what you ate." }, { status: 400 });
  }
  try {
    return Response.json(await analyzeMeal(user.id, body.data));
  } catch (e) {
    const err = e instanceof AnalyzeError ? e : new AnalyzeError("Something went wrong analyzing the meal.", 500);
    if (!(e instanceof AnalyzeError)) console.error("analyze failed", e);
    return Response.json({ error: err.message }, { status: err.status });
  }
}
