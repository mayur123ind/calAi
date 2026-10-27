import "server-only";
import crypto from "node:crypto";

// AES-256-GCM for secrets people give us (their own AI API keys). The key lives in DATA_ENCRYPTION_KEY,
// never in the database, so a leaked database alone doesn't reveal anyone's keys.
// Stored form: "v1:<iv b64>:<tag b64>:<ciphertext b64>".

function key(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  const buf = raw ? Buffer.from(raw, "base64") : null;
  if (!buf || buf.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 random bytes, base64 encoded (see .env.example)");
  return buf;
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string | null {
  const [v, iv, tag, data] = stored.split(":");
  if (v !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** "sk-…abcd": enough to recognise a key without showing it. */
export const maskSecret = (s: string) => (s.length > 8 ? `${s.slice(0, 3)}…${s.slice(-4)}` : "••••");
