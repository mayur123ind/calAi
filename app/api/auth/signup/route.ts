import { z } from "zod";
import { MIN_PASSWORD, USERNAME, startSession } from "@/lib/auth";
import { createUser, findUserByUsername } from "@/lib/db";
import { hashPassword } from "@/lib/password";

const Body = z.object({
  username: z.string().trim().regex(USERNAME),
  password: z.string().min(MIN_PASSWORD).max(200),
});

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json(
      { error: `Use 3–32 letters, numbers, dots, dashes or underscores for the username, and at least ${MIN_PASSWORD} characters for the password.` },
      { status: 400 },
    );
  }
  const { username, password } = body.data;
  if (await findUserByUsername(username)) {
    return Response.json({ error: "That username is taken. Try another one." }, { status: 409 });
  }
  const id = await createUser(username, await hashPassword(password));
  await startSession(id, request);
  return Response.json({ id, username, role: "user" }, { status: 201 });
}
