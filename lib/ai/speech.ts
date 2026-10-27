import "server-only";
import { gemini } from "./gemini";
import { keyFor, type ResolvedAi } from "./index";
import { AiError, ProviderError, classifyStatus } from "./core";
import { SPEECH_LANGUAGES, SPEECH_PROVIDERS, type SpeechProviderId } from "./catalog";

// Server-side speech to text. The "browser" option never reaches the server: it uses the Web Speech API.

type Audio = { data: Buffer; mimeType: string };

const BACKOFF_MS = [1000, 2000, 4000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(url: string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(45_000) });
  } catch (e) {
    throw new ProviderError("network", null, e instanceof Error ? e.message : "Network error");
  }
  if (!res.ok) throw new ProviderError(classifyStatus(res.status), res.status, await res.text().catch(() => ""));
  return res.json();
}

const fileName = (mimeType: string) => `speech.${mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("wav") ? "wav" : "webm"}`;

function form(audio: Audio, fields: Record<string, string>, fileField = "file") {
  const f = new FormData();
  f.append(fileField, new Blob([new Uint8Array(audio.data)], { type: audio.mimeType }), fileName(audio.mimeType));
  for (const [k, v] of Object.entries(fields)) if (v) f.append(k, v);
  return f;
}

async function once(provider: Exclude<SpeechProviderId, "browser">, audio: Audio, lang: string, key: string): Promise<string> {
  const iso = lang.split("-")[0];
  switch (provider) {
    case "openai":
    case "groq": {
      const base = provider === "openai" ? "https://api.openai.com/v1" : "https://api.groq.com/openai/v1";
      const model = provider === "openai" ? "gpt-4o-mini-transcribe" : "whisper-large-v3-turbo";
      const data = (await post(`${base}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form(audio, { model, language: iso, prompt: "Food and drinks eaten, with amounts. Indian dish names are common." }),
      })) as { text?: string };
      return data.text ?? "";
    }
    case "deepgram": {
      const params = new URLSearchParams({ model: "nova-3", language: lang.startsWith("en") ? lang : iso, smart_format: "true" });
      const data = (await post(`https://api.deepgram.com/v1/listen?${params}`, {
        method: "POST",
        headers: { Authorization: `Token ${key}`, "Content-Type": audio.mimeType },
        body: new Uint8Array(audio.data),
      })) as { results?: { channels?: { alternatives?: { transcript?: string }[] }[] } };
      return data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    }
    case "elevenlabs": {
      const data = (await post("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": key },
        body: form(audio, { model_id: "scribe_v1", language_code: iso }),
      })) as { text?: string };
      return data.text ?? "";
    }
    case "gemini": {
      const language = SPEECH_LANGUAGES.find((l) => l.locale === lang)?.label ?? lang;
      return gemini.generate(
        {
          system: "You transcribe short voice notes about food for a calorie tracker. Reply with only the transcript.",
          turns: [
            {
              role: "user",
              parts: [
                { audio: { mimeType: audio.mimeType, data: audio.data.toString("base64") } },
                { text: `Transcribe this. The speaker is using ${language}; write it in that language's usual script.` },
              ],
            },
          ],
          effort: "low",
          timeoutMs: 45_000,
          maxTokens: 2000,
        },
        process.env.GEMINI_MODEL || "gemini-flash-latest",
        key,
      );
    }
  }
}

/** Transcribes one recording with the chosen provider, backing off 1 s / 2 s / 4 s on overloads. */
export async function transcribe(ai: ResolvedAi, provider: Exclude<SpeechProviderId, "browser">, audio: Audio, lang: string) {
  const info = SPEECH_PROVIDERS.find((p) => p.id === provider)!;
  const key = keyFor(ai, info.key!);
  if (!key) throw new AiError(`Add your ${info.label} API key under Account → AI access, or switch to on-device speech.`, 400);
  for (let attempt = 0; ; attempt++) {
    try {
      return (await once(provider, audio, lang, key)).trim();
    } catch (e) {
      if (!(e instanceof ProviderError)) throw e;
      if (e.transient && attempt < BACKOFF_MS.length) {
        await sleep(BACKOFF_MS[attempt]);
        continue;
      }
      throw new AiError(
        e.kind === "auth"
          ? `${info.label} rejected the API key. Check it under Account → AI access.`
          : e.transient
            ? `${info.label} is busy right now. Try again in a minute.`
            : `${info.label} couldn't transcribe that. Try again, or type it instead.`,
        e.kind === "auth" ? 502 : e.transient ? 503 : 502,
      );
    }
  }
}
