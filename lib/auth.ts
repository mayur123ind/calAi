import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { deleteSession, getSessionUser, insertSession, type SessionUser } from "./db";

export const SESSION_COOKIE = "calai_session";
const SESSION_DAYS = 30;

// The cookie holds a random token; the database stores only its SHA-256, so a leaked database can't sign anyone in.
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export const USERNAME = /^[a-zA-Z0-9._@-]{3,32}$/;
export const MIN_PASSWORD = 8;

export async function startSession(userId: number, request: Request) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await insertSession(hashToken(token), userId, expires.toISOString());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
    secure: new URL(request.url).protocol === "https:",
  });
}

export async function currentSessionHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

export async function currentUser(): Promise<SessionUser | null> {
  const hash = await currentSessionHash();
  return hash ? getSessionUser(hash) : null;
}

export async function endSession() {
  const hash = await currentSessionHash();
  if (hash) await deleteSession(hash);
  (await cookies()).delete(SESSION_COOKIE);
}

export const unauthorized = () => Response.json({ error: "Please sign in again." }, { status: 401 });
export const forbidden = () => Response.json({ error: "Only admins can do that." }, { status: 403 });

// ---------- Failed sign-in throttle ----------

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;
const g = globalThis as unknown as { __calaiLogin?: Map<string, { failures: number; until: number }> };
const attempts = (g.__calaiLogin ??= new Map());

/** Seconds until this username may try again, or 0. */
export function lockedFor(username: string): number {
  const a = attempts.get(username.toLowerCase());
  if (!a || a.failures < MAX_FAILURES) return 0;
  const left = a.until - Date.now();
  if (left <= 0) {
    attempts.delete(username.toLowerCase());
    return 0;
  }
  return Math.ceil(left / 1000);
}

export function noteFailure(username: string) {
  const key = username.toLowerCase();
  const a = attempts.get(key) ?? { failures: 0, until: 0 };
  a.failures += 1;
  a.until = Date.now() + LOCK_MS;
  attempts.set(key, a);
}

export function clearFailures(username: string) {
  attempts.delete(username.toLowerCase());
}
