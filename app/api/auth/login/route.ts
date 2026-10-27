import { z } from "zod";
import { clearFailures, lockedFor, noteFailure, startSession } from "@/lib/auth";
import { findUserByUsername } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

const Body = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
});

// Compared against when the username doesn't exist, so both paths take the same time.
const DUMMY_HASH = `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`;

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Enter your username and password." }, { status: 400 });
  const { username, password } = body.data;

  const wait = lockedFor(username);
  if (wait > 0) {
    return Response.json(
      { error: `Too many wrong passwords. Try again in ${Math.ceil(wait / 60)} min.` },
      { status: 429 },
    );
  }

  const user = await findUserByUsername(username);
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) {
    noteFailure(username);
    return Response.json({ error: "Wrong username or password." }, { status: 401 });
  }
  if (user.disabled) {
    return Response.json({ error: "This account is turned off. Ask the admin to turn it back on." }, { status: 403 });
  }

  clearFailures(username);
  await startSession(user.id, request);
  return Response.json({ id: user.id, username: user.username, role: user.role });
}
