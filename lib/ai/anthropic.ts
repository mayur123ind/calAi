import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ProviderError, classifyStatus, jsonSchemaFor, type GenerateRequest, type Part, type Provider } from "./core";

// Claude through the official @anthropic-ai/sdk, with the person's own API key.
const clients = new Map<string, Anthropic>();

function client(apiKey: string) {
  let c = clients.get(apiKey);
  if (!c) {
    // The router does its own backoff (1 s / 2 s / 4 s), so the SDK doesn't retry on top of it.
    c = new Anthropic({ apiKey, maxRetries: 0 });
    clients.set(apiKey, c);
  }
  return c;
}

type Block = Anthropic.Beta.BetaContentBlockParam;
type ImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

const toBlock = (p: Part): Block[] =>
  "text" in p
    ? [{ type: "text", text: p.text }]
    : "image" in p
      ? [{ type: "image", source: { type: "base64", media_type: p.image.mimeType as ImageType, data: p.image.data } }]
      : [];

// Server-side fallback re-runs a declined request on Anthropic's recommended model for that refusal category.
// Claude Haiku 5.5 has no server-side fallback, so it is sent without one.
const supportsFallback = (model: string) => !model.startsWith("claude-haiku");

export const anthropic: Provider = {
  async generate(req: GenerateRequest, model: string, apiKey: string) {
    let res: Anthropic.Beta.BetaMessage;
    try {
      res = await client(apiKey).beta.messages.create(
        {
          model,
          max_tokens: req.maxTokens,
          system: req.system,
          messages: req.turns.map((t) => ({ role: t.role, content: t.parts.flatMap(toBlock) })),
          output_config: {
            effort: req.effort,
            ...(req.schema ? { format: { type: "json_schema" as const, schema: jsonSchemaFor(req.schema) } } : {}),
          },
          ...(supportsFallback(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        },
        { timeout: req.timeoutMs },
      );
    } catch (e) {
      if (e instanceof Anthropic.APIConnectionError) throw new ProviderError("network", null, e.message);
      if (e instanceof Anthropic.APIError) throw new ProviderError(classifyStatus(e.status ?? 500), e.status ?? null, e.message);
      throw new ProviderError("network", null, e instanceof Error ? e.message : "Network error");
    }
    if (res.stop_reason === "refusal") throw new ProviderError("refused", null, "Claude declined this request");
    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (!text) throw new ProviderError("bad", null, "Empty answer");
    return text;
  },
};
