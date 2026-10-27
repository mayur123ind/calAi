import { currentUser, unauthorized } from "@/lib/auth";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  return Response.json(user);
}
