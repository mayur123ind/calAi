import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { getPrefs, savePrefs } from "@/lib/db";
import { CARD_NUTRIENTS, MICRO_KEYS, type CardKey, type MicroKey } from "@/lib/nutrients";
import { withDefaultPrefs } from "@/lib/nutrition";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  return Response.json(await getPrefs(user.id));
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const cardKey = z.enum(CARD_NUTRIENTS.map((n) => n.key) as [CardKey, ...CardKey[]]);

// Every field is optional: screens send only the settings they own, and the rest are kept.
const Body = z
  .object({
    waterGoalMl: z.number().int().min(250).max(8000),
    reminders: z.object({ enabled: z.boolean(), breakfast: time, lunch: time, dinner: time }),
    water: z.object({
      enabled: z.boolean(),
      glassMl: z.number().int().min(50).max(1000),
      reminder: z.boolean(),
      reminderEveryHours: z.number().int().min(1).max(6),
    }),
    fasting: z.object({ enabled: z.boolean(), goalHours: z.number().min(1).max(168), alert: z.boolean() }),
    theme: z.enum(["system", "light", "dark"]),
    weekStart: z.union([z.literal(0), z.literal(1), z.literal(6)]),
    mealTimes: z.object({ breakfast: time, lunch: time, snack: time, dinner: time }),
    homeCards: z.array(cardKey).length(3),
    logSort: z.enum(["grouped", "latest"]),
    nutrientGoals: z.partialRecord(z.enum(MICRO_KEYS as [MicroKey, ...MicroKey[]]), z.number().min(0).max(100_000)),
    adaptive: z.object({ enabled: z.boolean() }),
    bodyFat: z.boolean(),
    training: z.object({
      focus: z.enum(["general", "strength", "muscle", "endurance"]),
      daysPerWeek: z.number().int().min(0).max(7),
      equipment: z.string().trim().max(200),
    }),
    language: z.string().regex(/^(auto|[a-z]{2}(-[A-Z]{2})?)$/),
  })
  .partial()
  .strict();

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Some settings weren't valid. Check them and try again." }, { status: 400 });
  const current = await getPrefs(user.id);
  const { adaptive, ...rest } = body.data;
  // Adaptive Goals' bookkeeping (last check, note) stays server-side; people only switch it on or off.
  const next = withDefaultPrefs({ ...current, ...rest, adaptive: adaptive ? { ...current.adaptive, ...adaptive } : current.adaptive });
  await savePrefs(user.id, next);
  return Response.json(next);
}
