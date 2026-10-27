"use client";

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Check, Pin } from "iconoir-react";
import { PREFS_EVENT } from "@/components/Reminders";
import { Notice, PageHeader, Segmented, Spinner, btn, input } from "@/components/ui";
import { MICROS, referenceGoal, type MicroKey } from "@/lib/nutrients";
import {
  ACTIVITY_LEVELS,
  GOALS,
  MIN_KCAL,
  SPLITS,
  fmt,
  fmt1,
  suggestedCalories,
  targetsFor,
  type Macro,
  type Prefs,
  type Profile,
} from "@/lib/nutrition";

const MACRO_LABELS: { key: Macro; label: string }[] = [
  { key: "protein_g", label: "Protein" },
  { key: "carbs_g", label: "Carbs" },
  { key: "fat_g", label: "Fat" },
];

type Draft = Omit<Profile, "age" | "heightCm" | "weightKg" | "customKcal" | "targetWeightKg" | "pinned"> & {
  age: string;
  heightCm: string;
  weightKg: string;
  customKcal: string;
  useCustom: boolean;
  targetWeightKg: string;
  /** "" means the macro follows the balance; a number pins it in grams. */
  pinned: Record<Macro, string>;
};

const toDraft = (p: Profile): Draft => ({
  ...p,
  age: String(p.age),
  heightCm: String(p.heightCm),
  weightKg: String(p.weightKg),
  customKcal: p.customKcal ? String(p.customKcal) : "",
  useCustom: p.customKcal !== null,
  targetWeightKg: p.targetWeightKg ? String(p.targetWeightKg) : "",
  pinned: Object.fromEntries(
    MACRO_LABELS.map((m) => [m.key, p.pinned?.[m.key] !== undefined ? String(p.pinned[m.key]) : ""]),
  ) as Record<Macro, string>,
});

function toProfile(d: Draft): Profile | null {
  const age = Number(d.age);
  const heightCm = Number(d.heightCm);
  const weightKg = Number(d.weightKg.replace(",", "."));
  const custom = Number(d.customKcal);
  const target = d.targetWeightKg ? Number(d.targetWeightKg.replace(",", ".")) : null;
  if (!(age >= 14 && age <= 100 && heightCm >= 100 && heightCm <= 250 && weightKg >= 30 && weightKg <= 300)) return null;
  if (d.useCustom && !(custom >= 1000 && custom <= 6000)) return null;
  if (target !== null && !(target >= 30 && target <= 300)) return null;
  const pinned: Profile["pinned"] = {};
  for (const m of MACRO_LABELS) {
    if (d.pinned[m.key] === "") continue;
    const g = Number(d.pinned[m.key]);
    if (!(g >= 0 && g <= 1000)) return null;
    pinned[m.key] = Math.round(g);
  }
  return {
    sex: d.sex,
    age: Math.round(age),
    heightCm,
    weightKg,
    activity: d.activity,
    goal: d.goal,
    split: d.split,
    customKcal: d.useCustom ? Math.round(custom) : null,
    targetWeightKg: target,
    pinned,
    adaptiveKcal: d.adaptiveKcal,
  };
}

export default function GoalsPage() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setDraft(toDraft(d.profile)))
      .catch(() => setError("Couldn't load your goals. Refresh to try again."));
  }, []);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setStatus("idle");
  };

  const profile = draft ? toProfile(draft) : null;
  const targets = profile ? targetsFor(profile) : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) {
      setError(
        "Check your age (14–100), height (100–250 cm), weights (30–300 kg), pinned macros (0–1,000 g) and any custom target (1,000–6,000 kcal).",
      );
      return;
    }
    setError(null);
    setStatus("saving");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    if (res.ok) {
      const saved = await res.json();
      setDraft(toDraft(saved.profile));
      setStatus("saved");
    } else {
      setError((await res.json()).error ?? "Couldn't save your goals.");
      setStatus("idle");
    }
  }

  return (
    <div className="stagger mx-auto max-w-5xl px-4 sm:px-6 lg:px-10">
      <PageHeader title="Goals" sub="Your daily target is worked out from these details." />

      {!draft ? (
        error ? <Notice tone="error">{error}</Notice> : <div className="h-96 animate-pulse rounded-3xl bg-surface-2" aria-hidden="true" />
      ) : (
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-10">
          <div className="space-y-7">
            <Group title="About you">
              <Segmented
                label="Sex"
                value={draft.sex}
                onChange={(v) => set("sex", v)}
                options={[
                  { value: "female", label: "Female" },
                  { value: "male", label: "Male" },
                ]}
              />
              <div className="grid grid-cols-3 gap-3">
                <NumInput label="Age" unit="yrs" value={draft.age} onChange={(v) => set("age", v)} />
                <NumInput label="Height" unit="cm" value={draft.heightCm} onChange={(v) => set("heightCm", v)} />
                <NumInput label="Weight" unit="kg" value={draft.weightKg} onChange={(v) => set("weightKg", v)} decimal />
              </div>
            </Group>

            <Group title="How active are you?" hint="Think about your work and your training">
              <div role="radiogroup" aria-label="Activity level" className="grid gap-2 sm:grid-cols-2">
                {ACTIVITY_LEVELS.map((a) => {
                  const active = draft.activity === a.value;
                  return (
                    <button
                      key={a.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => set("activity", a.value)}
                      className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors ${
                        active ? "border-leaf bg-leaf-soft" : "border-line bg-surface hover:bg-surface-2"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                          active ? "border-leaf bg-leaf text-on-leaf" : "border-line"
                        }`}
                      >
                        {active && <Check className="size-3" strokeWidth={3} />}
                      </span>
                      <span>
                        <span className="block text-[15px] font-medium">{a.label}</span>
                        <span className="block text-sm text-muted">{a.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Group>

            <Group title="Your goal" hint={GOALS.find((g) => g.id === draft.goal)?.hint}>
              <Segmented label="Goal" value={draft.goal} onChange={(v) => set("goal", v)} options={GOALS.map((g) => ({ value: g.id, label: g.label }))} />
              <div className="max-w-56">
                <NumInput label="Target weight (optional)" unit="kg" value={draft.targetWeightKg} onChange={(v) => set("targetWeightKg", v)} decimal />
              </div>
            </Group>

            <Group title="Macro balance" hint="Pinned macros stay fixed; the rest share what's left">
              <Segmented label="Macro balance" value={draft.split} onChange={(v) => set("split", v)} options={SPLITS.map((s) => ({ value: s.id, label: s.label }))} />
              <div className="grid grid-cols-3 gap-3">
                {MACRO_LABELS.map((m) => {
                  const pinned = draft.pinned[m.key] !== "";
                  return (
                    <div key={m.key} className={`rounded-2xl border p-3 ${pinned ? "border-leaf bg-leaf-soft/50" : "border-line"}`}>
                      <label className="flex cursor-pointer items-center gap-1.5 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={pinned}
                          onChange={(e) => set("pinned", { ...draft.pinned, [m.key]: e.target.checked ? String(targets?.[m.key] ?? 100) : "" })}
                          className="size-4 accent-[var(--leaf)]"
                        />
                        <Pin className="size-3.5" /> {m.label}
                      </label>
                      {pinned ? (
                        <input
                          aria-label={`${m.label} grams`}
                          inputMode="numeric"
                          value={draft.pinned[m.key]}
                          onChange={(e) => /^\d{0,4}$/.test(e.target.value) && set("pinned", { ...draft.pinned, [m.key]: e.target.value })}
                          className="num mt-2 h-10 w-full rounded-xl border border-line bg-surface px-3 focus:border-leaf focus:outline-none"
                        />
                      ) : (
                        <p className="num mt-2 text-sm text-muted">{targets ? `${fmt(targets[m.key])} g, auto` : "auto"}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Group>

            <Group title="Calorie target">
              <label className="flex cursor-pointer items-center gap-3 text-[15px]">
                <input
                  type="checkbox"
                  checked={draft.useCustom}
                  onChange={(e) => set("useCustom", e.target.checked)}
                  className="size-5 accent-[var(--leaf)]"
                />
                Set my own calorie target
              </label>
              {draft.useCustom && (
                <div className="max-w-48">
                  <NumInput label="Daily target" unit="kcal" value={draft.customKcal} onChange={(v) => set("customKcal", v)} />
                </div>
              )}
            </Group>
          </div>

          <aside className="card p-5 shadow-md sm:p-6 lg:sticky lg:top-10">
            <p className="text-sm font-medium text-muted">Your daily target</p>
            {targets ? (
              <>
                <p className="num mt-1 font-display text-5xl font-semibold tracking-tight">
                  {fmt(targets.calories)}
                  <span className="ml-1.5 text-lg font-medium text-muted">kcal</span>
                </p>
                {draft.useCustom && profile && (
                  <p className="mt-1 text-sm text-muted">Suggested for you: {fmt(suggestedCalories(profile))} kcal</p>
                )}
                {draft.adaptiveKcal !== 0 && (
                  <p className="num mt-1 text-sm text-muted">
                    Includes an Adaptive Goals correction of {draft.adaptiveKcal > 0 ? "+" : "−"}
                    {fmt(Math.abs(draft.adaptiveKcal))} kcal.
                  </p>
                )}
                <dl className="mt-5 space-y-2.5 border-t border-line pt-4">
                  <Macro label="Protein" grams={targets.protein_g} color="bg-protein" pinned={draft.pinned.protein_g !== ""} />
                  <Macro label="Carbs" grams={targets.carbs_g} color="bg-carbs" pinned={draft.pinned.carbs_g !== ""} />
                  <Macro label="Fat" grams={targets.fat_g} color="bg-fat" pinned={draft.pinned.fat_g !== ""} />
                </dl>
                {profile && targets.calories <= MIN_KCAL[profile.sex] && !draft.useCustom && (
                  <p className="mt-4 text-sm leading-relaxed text-muted">
                    Held at {fmt(MIN_KCAL[profile.sex])} kcal, the usual safe minimum without medical supervision.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-[15px] text-muted">Fill in your details to see a target.</p>
            )}

            {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}

            <button type="submit" disabled={status === "saving"} className={`${btn.primary} mt-6 w-full`}>
              {status === "saving" ? <><Spinner /> Saving…</> : status === "saved" ? <><Check className="size-5" /> Goals saved</> : "Save goals"}
            </button>
          </aside>
        </form>
      )}

      {draft && (
        <div className="mt-10 space-y-10">
          <AdaptiveToggle />
          <NutrientGoals sex={draft.sex} age={Number(draft.age) || 30} calories={targets?.calories ?? 2000} />
        </div>
      )}
    </div>
  );
}

async function putPrefs(patch: Partial<Omit<Prefs, "adaptive">> & { adaptive?: { enabled: boolean } }): Promise<Prefs | null> {
  const res = await fetch("/api/prefs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).catch(() => null);
  if (!res?.ok) return null;
  window.dispatchEvent(new Event(PREFS_EVENT));
  return res.json();
}

function AdaptiveToggle() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  useEffect(() => {
    fetch("/api/prefs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setPrefs);
  }, []);
  if (!prefs) return null;
  return (
    <section aria-labelledby="adaptive-heading" className="card p-5 shadow-sm">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={prefs.adaptive.enabled}
          onChange={async (e) => {
            const next = await putPrefs({ adaptive: { enabled: e.target.checked } });
            if (next) setPrefs(next);
          }}
          className="mt-1 size-5 accent-[var(--leaf)]"
        />
        <span>
          <span id="adaptive-heading" className="block font-display text-lg font-semibold tracking-tight">Adaptive Goals</span>
          <span className="block text-[15px] text-muted">
            Once a week, compare what you ate with how your weight actually moved, and nudge your calorie target (at most 150 kcal a week).
            Pinned macros stay as they are. Needs about 10 logged days and two weeks of weigh-ins.
          </span>
          {prefs.adaptive.note && <span className="mt-2 block text-sm">Last check: {prefs.adaptive.note}</span>}
        </span>
      </label>
    </section>
  );
}

/** Goals for detailed nutrients: reference amounts by default, your own numbers, or an AI estimate. */
function NutrientGoals({ sex, age, calories }: { sex: Profile["sex"]; age: number; calories: number }) {
  const [goals, setGoals] = useState<Partial<Record<MicroKey, string>> | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "estimating">("idle");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/prefs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Prefs | null) => setGoals(Object.fromEntries(Object.entries(p?.nutrientGoals ?? {}).map(([k, v]) => [k, String(v)]))));
  }, []);
  if (!goals) return null;

  const shown = MICROS.filter((m) => m.kind !== "info");

  async function save() {
    setStatus("saving");
    setError(null);
    const nutrientGoals = Object.fromEntries(
      Object.entries(goals!)
        .filter(([, v]) => v && Number(v) > 0)
        .map(([k, v]) => [k, Number(v)]),
    );
    const next = await putPrefs({ nutrientGoals });
    setStatus(next ? "saved" : "idle");
    if (!next) setError("Couldn't save the goals. Check the numbers.");
  }

  async function estimate() {
    setStatus("estimating");
    setError(null);
    const res = await fetch("/api/nutrient-goals", { method: "POST" }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setStatus("idle");
    if (!res?.ok) {
      setError(data?.error ?? "Couldn't estimate goals right now.");
      return;
    }
    setGoals(Object.fromEntries(Object.entries(data.nutrientGoals as Record<string, number>).map(([k, v]) => [k, String(v)])));
    setNote(data.note);
    window.dispatchEvent(new Event(PREFS_EVENT));
  }

  return (
    <section id="nutrients" aria-labelledby="nutrients-heading" className="scroll-mt-6">
      <h2 id="nutrients-heading" className="font-display text-2xl font-bold tracking-tight">Nutrient goals</h2>
      <p className="mt-1 max-w-2xl text-[15px] text-muted">
        Optional goals for detailed nutrients. Empty boxes use the usual adult reference amount (shown faintly). These never change your
        calorie or macro targets.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((m) => {
          const ref = referenceGoal(m.key, sex, age, calories);
          return (
            <label key={m.key} className="rounded-2xl border border-line bg-surface/80 p-3">
              <span className="flex items-baseline justify-between text-sm font-medium">
                {m.label}
                <span className="text-xs font-normal text-muted">{m.kind === "limit" ? "max" : "aim"}</span>
              </span>
              <span className="relative mt-1.5 block">
                <input
                  inputMode="decimal"
                  value={goals[m.key] ?? ""}
                  placeholder={ref !== null ? fmt1(ref) : ""}
                  onChange={(e) => {
                    const v = e.target.value.replace(",", ".");
                    if (/^\d{0,5}(\.\d{0,2})?$/.test(v)) {
                      setGoals({ ...goals, [m.key]: v });
                      setStatus("idle");
                    }
                  }}
                  className="num h-10 w-full rounded-xl border border-line bg-surface px-3 pr-12 placeholder:text-muted/50 focus:border-leaf focus:outline-none"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{m.unit}</span>
              </span>
            </label>
          );
        })}
      </div>
      {note && <div className="mt-4"><Notice>{note}</Notice></div>}
      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={status === "saving" || status === "estimating"} className={btn.primary}>
          {status === "saving" ? <><Spinner /> Saving…</> : status === "saved" ? <><Check className="size-5" /> Saved</> : "Save nutrient goals"}
        </button>
        <button type="button" onClick={estimate} disabled={status === "estimating"} className={btn.secondary}>
          {status === "estimating" ? <><Spinner /> Estimating…</> : "Estimate with AI"}
        </button>
        <button
          type="button"
          onClick={() => {
            setGoals({});
            setStatus("idle");
          }}
          className={btn.ghost}
        >
          Use reference amounts
        </button>
      </div>
    </section>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-3 flex w-full items-baseline justify-between gap-3">
        <span className="font-display text-lg font-semibold tracking-tight">{title}</span>
        {hint && <span className="text-right text-sm text-muted">{hint}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

function NumInput({
  label,
  unit,
  value,
  onChange,
  decimal,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  decimal?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      <div className="relative">
        <input
          id={id}
          inputMode={decimal ? "decimal" : "numeric"}
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if ((decimal ? /^\d{0,3}([.,]\d?)?$/ : /^\d{0,4}$/).test(v)) onChange(v);
          }}
          className={`${input} num pr-11`}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">{unit}</span>
      </div>
    </div>
  );
}

function Macro({ label, grams, color, pinned }: { label: string; grams: number; color: string; pinned: boolean }) {
  return (
    <div className="flex items-center gap-2.5 text-[15px]">
      <span className={`size-2.5 rounded-full ${color}`} />
      <dt className="flex-1">
        {label} {pinned && <Pin className="inline size-3.5 text-muted" aria-label="pinned" />}
      </dt>
      <dd className="num font-semibold">{fmt(grams)} g</dd>
    </div>
  );
}
