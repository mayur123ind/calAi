import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { getPrefs, getProfile, savePrefs, saveProfile } from "@/lib/db";
import { targetsFor } from "@/lib/nutrition";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { profile, saved } = await getProfile(user.id);
  return Response.json({ profile, saved, targets: targetsFor(profile) });
}

const grams = z.number().min(0).max(1000);
const Body = z.object({
  sex: z.enum(["female", "male"]),
  age: z.number().int().min(14).max(100),
  heightCm: z.number().min(100).max(250),
  weightKg: z.number().min(30).max(300),
  activity: z.number().min(1.2).max(2.05),
  goal: z.enum(["lose", "maintain", "gain"]),
  split: z.enum(["balanced", "protein", "lowcarb"]),
  customKcal: z.number().int().min(1000).max(6000).nullable(),
  targetWeightKg: z.number().min(30).max(300).nullable().default(null),
  pinned: z.object({ protein_g: grams, carbs_g: grams, fat_g: grams }).partial().default({}),
});

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Check the highlighted values and try again." }, { status: 400 });
  }
  const { profile: current, saved } = await getProfile(user.id);
  const prefs = await getPrefs(user.id);

  // Typing your own calorie target during first setup means you want a fixed plan: Adaptive Goals stays off.
  // Later edits keep whatever Adaptive Goals was set to, and its correction resets when the plan changes by hand.
  const handEdited = body.data.customKcal !== null;
  if (!saved && handEdited && prefs.adaptive.enabled) {
    await savePrefs(user.id, { ...prefs, adaptive: { ...prefs.adaptive, enabled: false } });
  }
  const planChanged = body.data.customKcal !== current.customKcal || body.data.goal !== current.goal;
  const profile = { ...body.data, adaptiveKcal: planChanged ? 0 : current.adaptiveKcal };
  await saveProfile(user.id, profile);
  return Response.json({ profile, saved: true, targets: targetsFor(profile) });
}
