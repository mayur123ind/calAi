import { currentUser, forbidden, unauthorized } from "@/lib/auth";
import { listUsers } from "@/lib/db";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  return Response.json({ users: await listUsers(), me: user.id });
}
