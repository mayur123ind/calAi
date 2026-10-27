import { currentUser, unauthorized } from "@/lib/auth";
import { getFavorites, getRecentMeals } from "@/lib/db";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  const [{ recent, frequent }, favorites] = await Promise.all([getRecentMeals(user.id), getFavorites(user.id)]);
  return Response.json({ favorites, recent, frequent });
}
