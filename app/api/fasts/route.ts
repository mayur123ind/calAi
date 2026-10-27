import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { cancelFast, endFast, getActiveFast, getPrefs, listFasts, startFast } from "@/lib/db";

async function state(userId: number) {
  return { active: (await getActiveFast(userId)) ?? null, history: await listFasts(userId) };
}

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  return Response.json(await state(user.id));
}

const iso = z.iso.datetime({ offset: true });
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), startedAt: iso.optional(), goalHours: z.number().min(1).max(168).optional() }),
  z.object({ action: z.literal("end"), endedAt: iso.optional() }),
  z.object({ action: z.literal("cancel") }),
]);

/** Start, end or cancel the running fast. Fasting never touches nutrition totals. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const now = new Date().toISOString();
  const b = body.data;
  if (b.action === "start") {
    const startedAt = b.startedAt ?? now;
    if (startedAt > now) return Response.json({ error: "A fast can't start in the future." }, { status: 400 });
    const goal = b.goalHours ?? (await getPrefs(user.id)).fasting.goalHours;
    if (!(await startFast(user.id, startedAt, goal))) {
      return Response.json({ error: "A fast is already running." }, { status: 409 });
    }
  } else if (b.action === "end") {
    const active = await getActiveFast(user.id);
    const endedAt = b.endedAt ?? now;
    if (!active) return Response.json({ error: "No fast is running." }, { status: 409 });
    if (endedAt < active.started_at || endedAt > now) return Response.json({ error: "Pick an end time between the start and now." }, { status: 400 });
    await endFast(user.id, endedAt);
  } else if (!(await cancelFast(user.id))) {
    return Response.json({ error: "No fast is running." }, { status: 409 });
  }
  return Response.json(await state(user.id));
}
