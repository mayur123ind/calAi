import "server-only";
import { ProviderError, classifyStatus, jsonSchemaFor, type GenerateRequest, type Part, type Provider } from "./core";

// OpenAI's Chat Completions API, which OpenRouter and Groq also speak. Called over HTTPS with fetch.

const BASE: Record<"openai" | "openrouter" | "groq", string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
};

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

function toContent(parts: Part[]): ContentPart[] {
  return parts.flatMap((p): ContentPart[] => {
    if ("text" in p) return [{ type: "text", text: p.text }];
    if ("image" in p) return [{ type: "image_url", image_url: { url: `data:${p.image.mimeType};base64,${p.image.data}` } }];
    return []; // audio goes through the transcription endpoints instead
  });
}

export function openAiCompatible(kind: keyof typeof BASE): Provider {
  return {
    async generate(req: GenerateRequest, model: string, apiKey: string) {
      const schema = req.schema ? jsonSchemaFor(req.schema) : null;
      // OpenAI enforces the schema exactly; OpenRouter and Groq models vary, so they get JSON mode plus the schema in the prompt.
      const strict = kind === "openai";
      const system =
        schema && !strict ? `${req.system}\n\nReply with only a JSON object matching this JSON Schema:\n${JSON.stringify(schema)}` : req.system;
      let res: Response;
      try {
        res = await fetch(`${BASE[kind]}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            ...(kind === "openrouter" ? { "X-Title": "CalAi" } : {}),
          },
          body: JSON.stringify({
            model,
            max_completion_tokens: req.maxTokens,
            messages: [
              { role: "system", content: system },
              ...req.turns.map((t) => ({ role: t.role, content: toContent(t.parts) })),
            ],
            ...(schema
              ? strict
                ? { response_format: { type: "json_schema", json_schema: { name: "answer", schema, strict: true } } }
                : { response_format: { type: "json_object" } }
              : {}),
          }),
          signal: AbortSignal.timeout(req.timeoutMs),
        });
      } catch (e) {
        throw new ProviderError("network", null, e instanceof Error ? e.message : "Network error");
      }
      if (!res.ok) throw new ProviderError(classifyStatus(res.status), res.status, await res.text().catch(() => ""));
      const data = (await res.json()) as { choices?: { message?: { content?: string | null; refusal?: string | null } }[] };
      const msg = data.choices?.[0]?.message;
      if (msg?.refusal) throw new ProviderError("refused", null, msg.refusal);
      if (!msg?.content) throw new ProviderError("bad", null, "Empty answer");
      return msg.content;
    },
  };
}
