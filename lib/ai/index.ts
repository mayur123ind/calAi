import "server-only";
import { z } from "zod";
import { getAiSettingsRow } from "../db";
import { decryptSecret } from "../secrets";
import { anthropic } from "./anthropic";
import { DEFAULT_AI_SETTINGS, providerInfo, type AiProviderId, type AiSettings, type KeyProviderId } from "./catalog";
import { AiError, ProviderError, type GenerateRequest, type Provider, type Turn } from "./core";
import { gemini } from "./gemini";
import { openAiCompatible } from "./openai";

export { AiError } from "./core";
export type { Part, Turn } from "./core";

const PROVIDERS: Record<AiProviderId, Provider> = {
  gemini,
  openai: openAiCompatible("openai"),
  openrouter: openAiCompatible("openrouter"),
  groq: openAiCompatible("groq"),
  anthropic,
};

export type ResolvedAi = AiSettings & { keys: Partial<Record<KeyProviderId, string>> };

/** The person's AI settings with their API keys decrypted. Server-side only; keys never go to the browser. */
export async function loadAi(userId: number): Promise<ResolvedAi> {
  const row = await getAiSettingsRow(userId);
  const saved = (row?.settings ?? {}) as Partial<AiSettings>;
  const settings: AiSettings = {
    ...DEFAULT_AI_SETTINGS,
    ...saved,
    speech: { ...DEFAULT_AI_SETTINGS.speech, ...saved.speech },
  };
  const keys: ResolvedAi["keys"] = {};
  for (const [provider, enc] of Object.entries(row?.keys ?? {})) {
    const plain = decryptSecret(enc);
    if (plain) keys[provider as KeyProviderId] = plain;
  }
  return { ...settings, keys };
}

/** The key for a provider: the person's own, or for Gemini the app's key from .env.local. */
export function keyFor(ai: ResolvedAi, provider: KeyProviderId): string | null {
  const own = ai.keys[provider];
  if (own) return own;
  if (provider === "gemini") {
    const app = process.env.GEMINI_API_KEY;
    return app && app !== "your-key-here" ? app : null;
  }
  return null;
}

const BACKOFF_MS = [1000, 2000, 4000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function failureMessage(e: ProviderError, provider: string, model: string): AiError {
  switch (e.kind) {
    case "auth":
      return new AiError(`${provider} rejected the API key. Check it under Account → AI access.`, 502);
    case "quota":
      return new AiError(`${provider}'s limit is used up for now. Try again later, or add the food by hand.`, 429);
    case "busy":
    case "slow":
      return new AiError(`${provider} is busy right now. Try again in a minute, or add the food by hand.`, 503);
    case "model":
      return new AiError(`The model "${model}" isn't available on ${provider}. Pick another under Account → AI access.`, 502);
    case "network":
      return new AiError(`Couldn't reach ${provider}. Check your internet connection and try again.`, 502);
    case "refused":
      return new AiError(`${provider} declined to answer this one. Try rewording it.`, 422);
    default:
      return new AiError(`${provider} couldn't process this request. Try a different photo or description.`, 502);
  }
}

/**
 * Sends one request through the person's chosen provider. Overloads (429 / 503 / 529) are retried after
 * 1 s, 2 s and 4 s; if the main model still fails, the fallback model gets the same treatment.
 */
async function run(ai: ResolvedAi, req: GenerateRequest, accept: (text: string) => boolean): Promise<string> {
  const info = providerInfo(ai.provider);
  const apiKey = keyFor(ai, ai.provider);
  if (!apiKey) {
    throw new AiError(
      ai.provider === "gemini"
        ? "Add a Gemini API key under Account → AI access (or GEMINI_API_KEY in .env.local)."
        : `Add your ${info.label} API key under Account → AI access.`,
      400,
    );
  }
  const system = ai.instructions.trim()
    ? `${req.system}\n\nThe person's own instructions (follow them unless they conflict with the rules above):\n${ai.instructions.trim()}`
    : req.system;
  const envDefaults =
    ai.provider === "gemini"
      ? [process.env.GEMINI_MODEL || info.defaultModel, process.env.GEMINI_FALLBACK_MODEL || info.defaultFallback]
      : [info.defaultModel, info.defaultFallback];
  const models = [ai.model || envDefaults[0], ai.model ? ai.fallbackModel : ai.fallbackModel || envDefaults[1]].filter(
    (m, i, list): m is string => !!m && list.indexOf(m) === i,
  );

  const provider = PROVIDERS[ai.provider];
  let last: AiError = new AiError(`${info.label}'s answer couldn't be read. Try again, or add the food by hand.`, 502);
  for (const [index, model] of models.entries()) {
    let unreadable = 0;
    const started = Date.now();
    for (let attempt = 0; ; attempt++) {
      try {
        const text = await provider.generate({ ...req, system }, model, apiKey);
        if (accept(text)) return text;
        // Smaller models occasionally return JSON that doesn't fit the schema: one more try, then move on.
        if (++unreadable >= 2) break;
      } catch (e) {
        if (!(e instanceof ProviderError)) throw e;
        console.warn(`[ai] ${ai.provider}/${model} attempt ${attempt + 1} failed: ${e.kind}${e.status ? ` ${e.status}` : ""}`);
        last = failureMessage(e, info.label, model);
        if (e.kind === "auth") throw last;
        // Back off on overloads, but don't spend more than ~30 s on one model when there's a fallback to try.
        const budgetLeft = index === models.length - 1 || Date.now() - started < 30_000;
        if (e.transient && attempt < BACKOFF_MS.length && budgetLeft) {
          await sleep(BACKOFF_MS[attempt]);
          continue;
        }
        if (e.kind === "bad" || e.kind === "refused") throw last;
        break; // still busy, timed out, unknown model, network: try the fallback model
      }
    }
  }
  throw last;
}

/** Asks for JSON matching `schema`. */
export async function generateJson<T>(
  userId: number,
  schema: z.ZodType<T>,
  system: string,
  turns: Turn[],
  opts: { timeoutMs?: number; maxTokens?: number } = {},
): Promise<T> {
  const ai = await loadAi(userId);
  let parsed: T | undefined;
  await run(
    ai,
    { system, turns, schema, effort: "low", timeoutMs: opts.timeoutMs ?? 30_000, maxTokens: opts.maxTokens ?? 8000 },
    (text) => {
      try {
        const r = schema.safeParse(JSON.parse(stripFence(text)));
        if (r.success) parsed = r.data;
        return r.success;
      } catch {
        return false;
      }
    },
  );
  return parsed as T;
}

/** Free-text reply, for the Coach and short suggestions. */
export async function generateText(
  userId: number,
  system: string,
  turns: Turn[],
  opts: { timeoutMs?: number; maxTokens?: number } = {},
): Promise<string> {
  const ai = await loadAi(userId);
  return run(
    ai,
    { system, turns, effort: "medium", timeoutMs: opts.timeoutMs ?? 60_000, maxTokens: opts.maxTokens ?? 4000 },
    (t) => t.trim().length > 0,
  );
}

/** Some JSON-mode models still wrap their answer in a ```json fence. */
const stripFence = (t: string) => t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
