"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Cart, Check, Clock, Cutlery, Group, LightBulb, Minus, Plus, Printer, Sparks, Timer, Trash, Xmark } from "iconoir-react";
import { IconButton, Notice, PageHeader, Segmented, Spinner, btn, input } from "@/components/ui";
import { dayKey, shortDate } from "@/lib/dates";
import { DIETS, PANTRY_UNITS, type Diet, type MealPlan, type PantryItem, type PantryUnit, type PlannedMeal } from "@/lib/mealprep";
import { MEAL_TYPES, NUTRIENTS, emptyTotals, fmt, type MealType, type Targets } from "@/lib/nutrition";

type Row = { key: string; name: string; qty: string; unit: PantryUnit };
type PlanListing = { id: number; day: string; created_at: string; dishes: string[] };
type Info = { pantry: PantryItem[]; plans: PlanListing[]; targets: Targets; left: Targets; logged: MealType[] };

let seq = 0;
const row = (p?: PantryItem): Row => ({ key: `r${++seq}`, name: p?.name ?? "", qty: p ? String(p.qty) : "", unit: p?.unit ?? "g" });
const dec = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const mealLabel = (t: MealType) => MEAL_TYPES.find((m) => m.id === t)!.label;

/** 1500 g reads better as 1.5 kg, and 0.16 kg as 160 g. */
function amount(n: number, unit: string) {
  if (unit === "g" && Math.abs(n) >= 1000) return `${dec.format(n / 1000)} kg`;
  if (unit === "ml" && Math.abs(n) >= 1000) return `${dec.format(n / 1000)} l`;
  if (unit === "kg" && Math.abs(n) < 1) return `${dec.format(n * 1000)} g`;
  if (unit === "l" && Math.abs(n) < 1) return `${dec.format(n * 1000)} ml`;
  return `${dec.format(n)} ${unit}`;
}

export function PlanView() {
  const today = dayKey();
  const [info, setInfo] = useState<Info | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [meals, setMeals] = useState<MealType[]>([]);
  const [people, setPeople] = useState(1);
  const [diet, setDiet] = useState<Diet>("veg");
  const [notes, setNotes] = useState("");
  const [current, setCurrent] = useState<{ id: number; plan: MealPlan } | null>(null);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/plan?today=${today}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Info) => {
        setInfo(d);
        setRows(d.pantry.length ? d.pantry.map(row) : [row(), row(), row()]);
        const open = MEAL_TYPES.map((t) => t.id).filter((t) => !d.logged.includes(t));
        setMeals(open.length ? open : ["dinner"]);
      })
      .catch(() => setError("Couldn't load meal prep. Refresh to try again."));
  }, [today]);

  const setRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const toggleMeal = (t: MealType) => setMeals((ms) => (ms.includes(t) ? ms.filter((m) => m !== t) : [...ms, t]));

  async function generate(e: FormEvent) {
    e.preventDefault();
    const pantry = rows
      .filter((r) => r.name.trim() && Number(r.qty) > 0)
      .map((r) => ({ name: r.name.trim(), qty: Number(r.qty), unit: r.unit }));
    if (pantry.length === 0) {
      setError("Add at least one ingredient with how much you have.");
      return;
    }
    if (meals.length === 0) {
      setError("Pick at least one meal to plan.");
      return;
    }
    setError(null);
    setBusy(true);
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), 8000);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: today, meals, people, diet, notes, pantry }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't make a plan right now.");
      setCurrent({ id: data.id, plan: data.plan });
      setInfo((i) => (i ? { ...i, plans: data.plans } : i));
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't make a plan right now.");
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  async function open(id: number) {
    const res = await fetch(`/api/plan/${id}`, { cache: "no-store" });
    if (!res.ok) return setError("Couldn't open that plan.");
    setCurrent(await res.json());
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function remove(id: number) {
    const res = await fetch(`/api/plan/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    const { plans } = await res.json();
    setInfo((i) => (i ? { ...i, plans } : i));
    if (current?.id === id) setCurrent(null);
  }

  return (
    <div className="stagger mx-auto max-w-4xl px-4 sm:px-6 lg:px-10 print:max-w-none print:px-0">
      <div className="print:hidden">
        <PageHeader
          title="Meal prep"
          sub="Tell CalAi what's in your kitchen. It plans today's meals, how many grams to cook and eat, and how to make them."
        />

        {!info ? (
          error ? <Notice tone="error">{error}</Notice> : <div className="h-96 animate-pulse rounded-3xl bg-surface-2" aria-hidden="true" />
        ) : (
          <form onSubmit={generate} className="space-y-6 card p-4 shadow-md sm:p-6">
            <fieldset>
              <legend className="mb-1 font-display text-lg font-semibold tracking-tight">What do you have?</legend>
              <p className="mb-3 text-sm text-muted">One ingredient per line, with how much is in your kitchen.</p>
              <ul className="space-y-2">
                {rows.map((r, i) => (
                  <li key={r.key} className="flex items-center gap-2">
                    <input
                      aria-label={`Ingredient ${i + 1}`}
                      value={r.name}
                      maxLength={60}
                      onChange={(e) => setRow(r.key, { name: e.target.value })}
                      placeholder={["Paneer", "Atta (wheat flour)", "Spinach", "Rice", "Eggs"][i % 5]}
                      className={`${input} min-w-0 flex-1`}
                    />
                    <input
                      aria-label={`How much ${r.name || "of it"}`}
                      inputMode="decimal"
                      value={r.qty}
                      onChange={(e) => /^\d{0,6}([.,]\d{0,2})?$/.test(e.target.value) && setRow(r.key, { qty: e.target.value.replace(",", ".") })}
                      placeholder={["250", "1", "500", "1", "6"][i % 5]}
                      className={`${input} num w-20 shrink-0 sm:w-24`}
                    />
                    <select
                      aria-label="Unit"
                      value={r.unit}
                      onChange={(e) => setRow(r.key, { unit: e.target.value as PantryUnit })}
                      className={`${input} w-[4.5rem] shrink-0 px-2 sm:w-20`}
                    >
                      {PANTRY_UNITS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                    <IconButton
                      label={`Remove ${r.name || "row"}`}
                      onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [row()]))}
                      className="size-9 shrink-0"
                    >
                      <Xmark className="size-5" />
                    </IconButton>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setRows((rs) => [...rs, row()])} disabled={rows.length >= 40} className={`${btn.ghost} mt-2 text-leaf`}>
                <Plus className="size-[18px]" /> Add ingredient
              </button>
              <p className="mt-1 text-xs text-muted">Salt, oil, ghee and everyday masalas are assumed, you don&apos;t need to list them.</p>
            </fieldset>

            <fieldset>
              <legend className="mb-3 font-display text-lg font-semibold tracking-tight">Plan which meals?</legend>
              <div className="flex flex-wrap gap-2">
                {MEAL_TYPES.map((t) => {
                  const on = meals.includes(t.id);
                  const logged = info.logged.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggleMeal(t.id)}
                      className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors ${
                        on ? "border-leaf bg-leaf-soft text-leaf" : "border-line bg-surface text-muted hover:text-ink"
                      }`}
                    >
                      {on && <Check className="size-4" strokeWidth={2.5} />}
                      {t.label}
                      {logged && <span className="text-xs font-normal opacity-75">· logged</span>}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
              <div>
                <p className="mb-2 text-sm font-medium">Cooking for</p>
                <div className="flex h-11 items-center gap-1 rounded-xl border border-line px-1">
                  <IconButton label="Fewer people" onClick={() => setPeople((p) => Math.max(1, p - 1))} disabled={people <= 1} className="size-9">
                    <Minus className="size-4" />
                  </IconButton>
                  <span className="num w-20 text-center text-[15px] font-medium">
                    {people} {people === 1 ? "person" : "people"}
                  </span>
                  <IconButton label="More people" onClick={() => setPeople((p) => Math.min(12, p + 1))} disabled={people >= 12} className="size-9">
                    <Plus className="size-4" />
                  </IconButton>
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Diet</p>
                <Segmented label="Diet" value={diet} onChange={setDiet} options={DIETS.map((d) => ({ value: d.id, label: d.label }))} />
              </div>
            </div>

            <div>
              <label htmlFor="plan-notes" className="mb-1.5 flex items-baseline justify-between text-sm font-medium">
                Anything else? <span className="text-xs font-normal text-muted">Optional</span>
              </label>
              <input
                id="plan-notes"
                value={notes}
                maxLength={300}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="No onion-garlic, ready in 30 minutes, kid-friendly dinner"
                className={input}
              />
            </div>

            <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="num text-sm text-muted">
                You have <b className="font-semibold text-ink">{fmt(info.left.calories)} kcal</b> and{" "}
                <b className="font-semibold text-ink">{fmt(info.left.protein_g)} g protein</b> left today, per person.
              </p>
              <button type="submit" disabled={busy} className={`${btn.primary} w-full sm:w-auto sm:min-w-52`}>
                {busy ? <><Spinner /> Planning your meals…</> : <><Sparks className="size-5" /> {current ? "Plan again" : "Plan my meals"}</>}
              </button>
            </div>
            {busy && slow && (
              <p role="status" className="text-center text-sm text-muted sm:text-right">
                Writing recipes and working out the grams. This can take up to a minute.
              </p>
            )}
            {error && <Notice tone="error">{error}</Notice>}
          </form>
        )}
      </div>

      <div ref={resultRef} className="scroll-mt-4">
        {current && <PlanResult key={current.id} plan={current.plan} />}
      </div>

      {info && info.plans.length > 0 && (
        <section aria-labelledby="past-heading" className="mt-8 print:hidden">
          <h2 id="past-heading" className="mb-3 font-display text-xl font-semibold tracking-tight">Recent plans</h2>
          <ul className="divide-y divide-line overflow-hidden card shadow-sm">
            {info.plans.map((p) => (
              <li key={p.id} className={`flex items-center gap-2 pr-2 ${current?.id === p.id ? "bg-leaf-soft/60" : ""}`}>
                <button type="button" onClick={() => open(p.id)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60">
                  <span className="w-16 shrink-0 text-sm font-medium">{p.day === today ? "Today" : shortDate(p.day)}</span>
                  <span className="truncate text-[15px] text-muted">{p.dishes.join(" · ")}</span>
                </button>
                <IconButton label="Delete plan" onClick={() => remove(p.id)} className="size-9 shrink-0 hover:text-danger">
                  <Trash className="size-[18px]" />
                </IconButton>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PlanResult({ plan }: { plan: MealPlan }) {
  const total = emptyTotals();
  for (const m of plan.meals) for (const n of NUTRIENTS) total[n] += m.per_portion[n] ?? 0;
  const short = plan.pantry.filter((p) => p.left < 0);

  return (
    <article className="mt-8 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            {plan.day === dayKey() ? "Today's" : `${shortDate(plan.day)}'s`} meal plan
          </h2>
          <p className="mt-1 max-w-2xl text-[15px] text-muted">{plan.note}</p>
        </div>
        <button type="button" onClick={() => window.print()} className={`${btn.ghost} print:hidden`}>
          <Printer className="size-[18px]" /> Print
        </button>
      </header>

      <section aria-label="Plan totals" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="You'll eat" value={fmt(total.calories)} unit={`of ${fmt(plan.budget)} kcal left`} tone={total.calories > plan.budget * 1.1 ? "text-protein" : undefined} />
        <Stat label="Protein" value={fmt(total.protein_g)} unit="g" />
        <Stat label="Carbs · Fat" value={`${fmt(total.carbs_g)} · ${fmt(total.fat_g)}`} unit="g" />
        <Stat label="Cooking for" value={`${plan.people}`} unit={plan.people === 1 ? "person" : "people"} />
      </section>

      <section aria-labelledby="usage-heading" className="card p-4 shadow-md sm:p-6">
        <h3 id="usage-heading" className="font-display text-lg font-semibold tracking-tight">Ingredients needed today</h3>
        <p className="mt-0.5 text-sm text-muted">
          Total to take out for every meal in this plan{plan.people > 1 ? `, for all ${plan.people} people` : ""}.
        </p>
        <table className="num mt-3 w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1.5 font-medium">Ingredient</th>
              <th className="py-1.5 text-right font-medium">You have</th>
              <th className="py-1.5 text-right font-medium">Use today</th>
              <th className="py-1.5 text-right font-medium">Left over</th>
            </tr>
          </thead>
          <tbody>
            {plan.pantry.map((p) => (
              <tr key={p.name} className="border-t border-line/70">
                <td className="py-2 pr-2">{p.name}</td>
                <td className="py-2 text-right text-muted">{amount(p.qty, p.unit)}</td>
                <td className={`py-2 text-right font-semibold ${p.used === 0 ? "font-normal text-muted" : ""}`}>
                  {p.used === 0 ? "not used" : amount(p.used, p.unit)}
                </td>
                <td className={`py-2 text-right ${p.left < 0 ? "font-semibold text-protein" : "text-muted"}`}>
                  {p.left < 0 ? `short ${amount(-p.left, p.unit)}` : amount(p.left, p.unit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {short.length > 0 && (
          <div className="mt-3">
            <Notice tone="error">
              The plan needs more {short.map((s) => s.name).join(", ")} than you have. Cut those portions a little, or plan again.
            </Notice>
          </div>
        )}

        {(plan.to_buy.length > 0 || plan.prep_ahead.length > 0) && (
          <div className="mt-5 grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
            {plan.prep_ahead.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Timer className="size-4 text-leaf" /> Prep ahead</p>
                <ul className="space-y-1.5 text-[15px] leading-relaxed">
                  {plan.prep_ahead.map((t, i) => (
                    <li key={i} className="flex gap-2"><span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-leaf" />{t}</li>
                  ))}
                </ul>
              </div>
            )}
            {plan.to_buy.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Cart className="size-4 text-carbs" /> You&apos;ll also need</p>
                <div className="flex flex-wrap gap-1.5">
                  {plan.to_buy.map((t, i) => (
                    <span key={i} className="rounded-full bg-carbs/12 px-3 py-1 text-sm">{t}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {plan.meals.map((m) => (
        <MealCard key={m.meal_type} meal={m} day={plan.day} people={plan.people} />
      ))}

      <p className="text-xs text-muted">Recipes and nutrition are AI estimates. Adjust salt, spice and portions to taste.</p>
    </article>
  );
}

function MealCard({ meal: m, day, people }: { meal: PlannedMeal; day: string; people: number }) {
  const [state, setState] = useState<"idle" | "saving" | "logged" | "error">("idle");
  const [stepsOpen, setStepsOpen] = useState(true);
  const p = m.per_portion;

  async function log() {
    setState("saving");
    const r1 = (n: number) => Math.max(0, Math.round(n * 10) / 10);
    const res = await fetch("/api/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        day,
        meal_type: m.meal_type,
        note: "From meal prep",
        photo: null,
        items: [
          {
            name: m.dish.slice(0, 120),
            grams: r1(m.portion_grams),
            ...Object.fromEntries(NUTRIENTS.map((n) => [n, r1(p[n])])),
          },
        ],
      }),
    }).catch(() => null);
    setState(res?.ok ? "logged" : "error");
  }

  return (
    <section aria-labelledby={`meal-${m.meal_type}`} className="break-inside-avoid card p-4 shadow-md sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-leaf">{mealLabel(m.meal_type)}</p>
          <h3 id={`meal-${m.meal_type}`} className="mt-0.5 font-display text-xl font-semibold tracking-tight">{m.dish}</h3>
          <p className="mt-1 text-[15px] text-muted">{m.why}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs text-muted">
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1"><Clock className="size-3.5" /> {fmt(m.prep_minutes + m.cook_minutes)} min</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1"><Group className="size-3.5" /> Serves {people}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-leaf-soft p-3.5 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="text-sm text-leaf-strong">Your portion</p>
          <p className="num font-display text-2xl font-semibold leading-tight text-leaf-strong">
            {fmt(m.portion_grams)} g <span className="text-base font-medium">· {fmt(p.calories)} kcal</span>
          </p>
          <p className="num mt-1 flex flex-wrap gap-3 text-sm text-leaf-strong/80">
            <span><b className="font-semibold text-protein">P</b> {fmt(p.protein_g)}g</span>
            <span><b className="font-semibold text-carbs">C</b> {fmt(p.carbs_g)}g</span>
            <span><b className="font-semibold text-fat">F</b> {fmt(p.fat_g)}g</span>
            <span>Fiber {fmt(p.fiber_g)}g</span>
          </p>
        </div>
        <div className="print:hidden">
          {state === "logged" ? (
            <Link href={day === dayKey() ? "/" : `/?date=${day}`} className={`${btn.secondary} h-11`}>
              <Check className="size-5 text-leaf" /> Logged · view day
            </Link>
          ) : (
            <button type="button" onClick={log} disabled={state === "saving"} className={`${btn.primary} h-11 w-full sm:w-auto`}>
              {state === "saving" ? <><Spinner /> Logging…</> : <><Cutlery className="size-5" /> {state === "error" ? "Try again" : `Log as ${mealLabel(m.meal_type).toLowerCase()}`}</>}
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div>
          <h4 className="mb-2 text-sm font-semibold">Ingredients{people > 1 ? ` for ${people}` : ""}</h4>
          <ul className="num divide-y divide-line/70 text-[15px]">
            {m.ingredients.map((i, idx) => (
              <li key={idx} className="flex items-baseline justify-between gap-3 py-1.5">
                <span>
                  {i.name}
                  {!i.from_pantry && <span className="ml-1.5 text-xs text-muted">staple</span>}
                </span>
                <span className="shrink-0 font-semibold">{amount(i.amount, i.unit)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <button
            type="button"
            onClick={() => setStepsOpen((o) => !o)}
            aria-expanded={stepsOpen}
            className="mb-2 flex w-full items-center justify-between text-sm font-semibold"
          >
            Cooking guide
            <span className="text-xs font-normal text-muted print:hidden">{stepsOpen ? "Hide" : `Show ${m.steps.length} steps`}</span>
          </button>
          {stepsOpen && (
            <ol className="space-y-3">
              {m.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
                  <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          )}
          {m.tip && (
            <p className="mt-4 flex gap-2 rounded-xl bg-surface-2 p-3 text-sm leading-relaxed">
              <LightBulb className="mt-0.5 size-4 shrink-0 text-carbs" />
              {m.tip}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, unit, tone }: { label: string; value: string; unit: string; tone?: string }) {
  return (
    <div className="card p-3.5 shadow-sm sm:p-4">
      <p className="text-xs text-muted sm:text-sm">{label}</p>
      <p className={`num mt-1 font-display text-xl font-semibold leading-tight sm:text-2xl ${tone ?? ""}`}>{value}</p>
      <p className="text-xs text-muted">{unit}</p>
    </div>
  );
}
