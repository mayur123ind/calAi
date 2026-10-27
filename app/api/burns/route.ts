import type { NextRequest } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import { deleteBurn, getBurns } from "@/lib/db";
import { DayKey } from "@/lib/schemas";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  return Response.json({ burns: await getBurns(user.id) });
}

/** Deletes a day's calculated workout burn (the workout itself stays). */
export async function DELETE(request: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const day = request.nextUrl.searchParams.get("day");
  if (!DayKey.safeParse(day).success) return Response.json({ error: "Invalid date" }, { status: 400 });
  if (!(await deleteBurn(user.id, day!))) return Response.json({ error: "Nothing to delete" }, { status: 404 });
  return Response.json({ burns: await getBurns(user.id) });
}
