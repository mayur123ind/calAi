import { currentUser, unauthorized } from "@/lib/auth";
import { AiError, loadAi } from "@/lib/ai";
import { speechLocale } from "@/lib/ai/catalog";
import { transcribe } from "@/lib/ai/speech";

export const maxDuration = 90;

const MAX_BYTES = 10 * 1024 * 1024; // about 10 minutes of compressed speech
const AUDIO_TYPES = /^audio\/(webm|ogg|mp4|mpeg|wav|x-m4a|aac)(;.*)?$/;

/** A recorded voice note (multipart "audio") in, its text out, using the person's chosen speech provider. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const data = await request.formData().catch(() => null);
  const file = data?.get("audio");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "No recording received." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "That recording is too long. Keep it under 10 minutes." }, { status: 413 });
  const mimeType = file.type || "audio/webm";
  if (!AUDIO_TYPES.test(mimeType)) return Response.json({ error: "That isn't an audio recording." }, { status: 415 });

  const ai = await loadAi(user.id);
  const provider = ai.speech.provider;
  if (provider === "browser") {
    return Response.json({ error: "On-device speech runs in the browser; nothing to send." }, { status: 400 });
  }
  try {
    const text = await transcribe(ai, provider, { data: Buffer.from(await file.arrayBuffer()), mimeType: mimeType.split(";")[0] }, speechLocale(ai));
    return Response.json({ text });
  } catch (e) {
    if (e instanceof AiError) return Response.json({ error: e.message }, { status: e.status });
    console.error("transcribe failed", e);
    return Response.json({ error: "Couldn't transcribe that. Try again, or type it instead." }, { status: 500 });
  }
}
