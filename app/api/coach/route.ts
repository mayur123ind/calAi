import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { AiError } from "@/lib/ai";
import { askCoach } from "@/lib/coach";
import { clearCoach, getCoachMessages, getPrefs, getProfile } from "@/lib/db";
import { parsePhotoData } from "@/lib/photos";

export const maxDuration = 120;

/** The conversation so far (memory persists across visits) and the goal, for the suggested questions. */
export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  const [messages, { profile, saved }] = await Promise.all([getCoachMessages(user.id), getProfile(user.id)]);
  return Response.json({ messages, goal: saved ? profile.goal : null });
}

const dataUrl = (max: number) =>
  z
    .string()
    .max(max)
    .regex(/^data:image\/(jpeg|png|webp);base64,/);

const Body = z
  .object({
    text: z.string().trim().max(2000),
    // A larger image for the model to look at, and a thumbnail to keep with the message.
    photo: z.object({ preview: dataUrl(2_000_000), thumb: dataUrl(400_000) }).nullable().default(null),
    language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).nullable().default(null),
  })
  .refine((b) => b.text || b.photo, "Say something or attach a photo");

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Type a message or attach a photo." }, { status: 400 });
  const { text, photo } = body.data;
  const prefs = await getPrefs(user.id);
  const language = prefs.language !== "auto" ? prefs.language : body.data.language;
  try {
    const preview = photo ? parsePhotoData(photo.preview) : null;
    await askCoach(
      user.id,
      text,
      photo && preview
        ? { forModel: { mimeType: preview.contentType, base64: preview.data.toString("base64") }, stored: parsePhotoData(photo.thumb) }
        : null,
      language,
    );
    return Response.json({ messages: await getCoachMessages(user.id) });
  } catch (e) {
    if (e instanceof AiError) return Response.json({ error: e.message }, { status: e.status });
    console.error("coach failed", e);
    return Response.json({ error: "The Coach couldn't answer right now. Try again." }, { status: 500 });
  }
}

/** Reset: start a fresh conversation. */
export async function DELETE() {
  const user = await currentUser();
  if (!user) return unauthorized();
  await clearCoach(user.id);
  return new Response(null, { status: 204 });
}
