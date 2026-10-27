import { z } from "zod";
import { MIN_PASSWORD, currentUser, forbidden, unauthorized } from "@/lib/auth";
import { countActiveAdmins, deleteUser, deleteUserSessions, getUserById, listUsers, updateUser } from "@/lib/db";
import { hashPassword } from "@/lib/password";

async function target(ctx: RouteContext<"/api/admin/users/[id]">) {
  const user = await currentUser();
  if (!user) return { error: unauthorized() };
  if (user.role !== "admin") return { error: forbidden() };
  const id = Number((await ctx.params).id);
  const row = Number.isInteger(id) ? await getUserById(id) : undefined;
  if (!row) return { error: Response.json({ error: "User not found" }, { status: 404 }) };
  return { me: user, row };
}

const Patch = z
  .object({
    disabled: z.boolean().optional(),
    role: z.enum(["user", "admin"]).optional(),
    password: z.string().min(MIN_PASSWORD).max(200).optional(),
  })
  .strict();

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/users/[id]">) {
  const t = await target(ctx);
  if ("error" in t) return t.error;
  const body = Patch.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: `Passwords need at least ${MIN_PASSWORD} characters.` }, { status: 400 });
  }
  const { disabled, role, password } = body.data;

  const losesAdmin = t.row.role === "admin" && !t.row.disabled && (disabled === true || role === "user");
  if (losesAdmin && await countActiveAdmins() <= 1) {
    return Response.json({ error: "Keep at least one active admin." }, { status: 400 });
  }
  if (t.row.id === t.me.id && disabled) {
    return Response.json({ error: "You can't turn off your own account." }, { status: 400 });
  }

  await updateUser(t.row.id, { disabled, role, password_hash: password ? await hashPassword(password) : undefined });
  if (disabled || password) await deleteUserSessions(t.row.id);
  return Response.json({ users: await listUsers() });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/users/[id]">) {
  const t = await target(ctx);
  if ("error" in t) return t.error;
  if (t.row.id === t.me.id) return Response.json({ error: "You can't delete your own account." }, { status: 400 });
  if (t.row.role === "admin" && !t.row.disabled && await countActiveAdmins() <= 1) {
    return Response.json({ error: "Keep at least one active admin." }, { status: 400 });
  }
  await deleteUser(t.row.id);
  return Response.json({ users: await listUsers() });
}
