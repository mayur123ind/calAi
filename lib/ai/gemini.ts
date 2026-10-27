import "server-only";
import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { ProviderError, classifyStatus, jsonSchemaFor, type GenerateRequest, type Part, type Provider } from "./core";

// Google Gemini through the official @google/genai SDK. One client per API key.
const clients = new Map<string, GoogleGenAI>();

function client(apiKey: string) {
  let c = clients.get(apiKey);
  if (!c) {
    // The router does its own backoff, so the SDK makes one attempt per call.
    c = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
    clients.set(apiKey, c);
  }
  return c;
}

/** The -latest aliases and gemini-3+ accept thinkingLevel; older 2.x models reject it. */
const takesThinkingLevel = (model: string) => /-latest$|^gemini-([3-9]|\d{2})/.test(model);

const toGemini = (p: Part) =>
  "text" in p ? { text: p.text } : "image" in p ? { inlineData: p.image } : { inlineData: p.audio };

export const gemini: Provider = {
  async generate(req: GenerateRequest, model: string, apiKey: string) {
    try {
      const res = await client(apiKey).models.generateContent({
        model,
        contents: req.turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: t.parts.map(toGemini) })),
        config: {
          systemInstruction: req.system,
          maxOutputTokens: req.maxTokens,
          // Quick extraction doesn't need long reasoning; Gemini 3+ models take a thinking level.
          ...(req.effort === "low" && takesThinkingLevel(model) ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
          ...(req.schema ? { responseMimeType: "application/json", responseJsonSchema: geminiSchema(req.schema) } : {}),
          httpOptions: { timeout: req.timeoutMs },
        },
      });
      const text = res.text;
      if (!text) throw new ProviderError(res.promptFeedback?.blockReason ? "refused" : "bad", null, "Empty answer");
      return text;
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      if (e instanceof ApiError) throw new ProviderError(classifyStatus(e.status), e.status, e.message);
      const timedOut = e instanceof Error && /abort|timeout/i.test(`${e.name} ${e.message}`);
      throw new ProviderError(timedOut ? "slow" : "network", null, e instanceof Error ? e.message : "Network error");
    }
  },
};

// Gemini accepts a subset of JSON Schema and dislikes additionalProperties on some models.
function geminiSchema(schema: Parameters<typeof jsonSchemaFor>[0]) {
  const s = jsonSchemaFor(schema);
  const strip = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    delete (node as Record<string, unknown>).additionalProperties;
    for (const v of Object.values(node)) (Array.isArray(v) ? v : [v]).forEach(strip);
  };
  strip(s);
  return s;
}
