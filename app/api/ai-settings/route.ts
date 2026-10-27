import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { loadAi } from "@/lib/ai";
import { AI_PROVIDERS, KEY_PROVIDERS, SPEECH_PROVIDERS, type AiSettings } from "@/lib/ai/catalog";
import { getAiSettingsRow, saveAiSettingsRow } from "@/lib/db";
import { encryptSecret, maskSecret } from "@/lib/secrets";

/** Settings plus a masked hint per stored key. The keys themselves never leave the server. */
async function view(userId: number) {
  const ai = await loadAi(userId);
  const { keys, ...settings } = ai;
  const appGemini = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "your-key-here";
  return {
    settings,
    keys: Object.fromEntries(KEY_PROVIDERS.map((p) => [p, keys[p] ? maskSecret(keys[p]!) : null])),
    appGemini,
  };
}

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  return Response.json(await view(user.id));
}

const providerIds = AI_PROVIDERS.map((p) => p.id) as [AiSettings["provider"], ...AiSettings["provider"][]];
const speechIds = SPEECH_PROVIDERS.map((p) => p.id) as [AiSettings["speech"]["provider"], ...AiSettings["speech"]["provider"][]];
const model = z.string().trim().max(120).regex(/^[\w.:/@-]*$/);
const locale = z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/);

const Body = z.object({
  settings: z.object({
    provider: z.enum(providerIds),
    model,
    fallbackModel: model,
    instructions: z.string().max(1500),
    speech: z.object({
      provider: z.enum(speechIds),
      languages: z.partialRecord(z.enum(speechIds), locale),
    }),
  }),
  // A string sets that provider's key, null removes it, and a missing provider keeps what's stored.
  keys: z.partialRecord(z.enum(KEY_PROVIDERS), z.string().trim().min(8).max(300).regex(/^\S+$/).nullable()).default({}),
});

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Check the model names and API keys, then try again." }, { status: 400 });

  const stored = { ...((await getAiSettingsRow(user.id))?.keys ?? {}) };
  for (const [provider, key] of Object.entries(body.data.keys)) {
    if (key === null) delete stored[provider];
    else if (key) stored[provider] = encryptSecret(key);
  }
  const s = body.data.settings;
  const info = AI_PROVIDERS.find((p) => p.id === s.provider)!;
  // Claude only accepts the listed models; the other providers take any model id the person types.
  if (!info.freeText && s.model && !(info.models as readonly string[]).includes(s.model)) {
    return Response.json({ error: `Pick one of the listed ${info.label} models.` }, { status: 400 });
  }
  await saveAiSettingsRow(user.id, s, stored);
  return Response.json(await view(user.id));
}
