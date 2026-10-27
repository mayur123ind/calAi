import { z } from "zod";
import { MIN_PASSWORD, currentSessionHash, currentUser, unauthorized } from "@/lib/auth";
import { deleteUserSessions, getUserById, updateUser } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";

const Body = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(MIN_PASSWORD).max(200),
});

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: `The new password needs at least ${MIN_PASSWORD} characters.` }, { status: 400 });
  }
  const row = await getUserById(user.id);
  if (!row || !(await verifyPassword(body.data.current, row.password_hash))) {
    return Response.json({ error: "Your current password isn't right." }, { status: 400 });
  }
  await updateUser(user.id, { password_hash: await hashPassword(body.data.next) });
  // Sign out every other device.
  await deleteUserSessions(user.id, (await currentSessionHash()) ?? undefined);
  return new Response(null, { status: 204 });
}
