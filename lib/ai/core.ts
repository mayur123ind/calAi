import "server-only";
import { z } from "zod";

// Provider-neutral request shapes shared by every AI provider adapter.

export type Part =
  | { text: string }
  | { image: { mimeType: string; data: string } } // base64, no data: prefix
  | { audio: { mimeType: string; data: string } };

export type Turn = { role: "user" | "assistant"; parts: Part[] };

export type GenerateRequest = {
  system: string;
  turns: Turn[];
  /** When set, the answer must be JSON matching this schema. */
  schema?: z.ZodType;
  /** "low" for quick extraction, "medium" for conversation. Providers without the idea ignore it. */
  effort: "low" | "medium";
  timeoutMs: number;
  maxTokens: number;
};

export type ProviderFailure = "auth" | "busy" | "quota" | "slow" | "model" | "network" | "refused" | "bad";

/** A failed call, classified so the router knows whether to back off, switch models or give up. */
export class ProviderError extends Error {
  constructor(
    public kind: ProviderFailure,
    public status: number | null,
    message: string = kind,
  ) {
    super(message);
  }
  /** 429 / 503 / 529 overloads answer quickly and clear quickly: worth retrying after a pause. */
  get transient() {
    return this.kind === "busy" || this.kind === "quota";
  }
}

export function classifyStatus(status: number): ProviderFailure {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "quota";
  if (status === 404) return "model";
  if (status === 503 || status === 529) return "busy";
  // Timeouts and gateway errors already cost a long wait; better to move on to the fallback model.
  if (status === 408 || status === 504) return "slow";
  if (status >= 500) return "busy";
  return "bad";
}

/** What the person sees when an AI call fails; status is the HTTP status our route returns. */
export class AiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export interface Provider {
  generate(req: GenerateRequest, model: string, apiKey: string): Promise<string>;
}

/** JSON Schema for a zod schema, with every object closed (strict structured-output modes require it). */
export function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const out: Record<string, unknown> = { ...z.toJSONSchema(schema) };
  delete out.$schema;
  const close = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (n.type === "object" && n.properties) {
      n.additionalProperties = false;
      n.required = Object.keys(n.properties as object);
    }
    for (const v of Object.values(n)) {
      if (Array.isArray(v)) v.forEach(close);
      else close(v);
    }
  };
  close(out);
  return out;
}

export const textOf = (parts: Part[]) =>
  parts
    .filter((p): p is { text: string } => "text" in p)
    .map((p) => p.text)
    .join("\n");
