"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Bell, Camera, Copy, Cutlery, EditPencil, Fridge, NavArrowDown, NavArrowRight, Plus, Sparks, Star, Trash } from "iconoir-react";
import { dueReminders } from "@/components/Reminders";
import { Katoris, Thali } from "@/components/Thali";
import { Notice, PageHeader, Segmented, Spinner, btn } from "@/components/ui";
import { dayKey, dayTitle, isDayKey, parseDay, shiftDay } from "@/lib/dates";
import { cardInfo, type CardKey, type MicroKey, type Micros } from "@/lib/nutrients";
import {
  DEFAULT_PREFS,
  MEAL_TYPES,
  fmt,
  fmt1,
  sumItems,
  type Meal,
  type MealType,
  type Prefs,
  type Reminders,
  type Targets,
  type Totals,
} from "@/lib/nutrition";
import { FastingCard, type Fast } from "./_home/FastingCard";
import { NutrientDetails } from "./_home/NutrientDetails";
import { QuickMenu } from "./_home/QuickMenu";
import { WaterCard } from "./_home/WaterCard";
import { WeekStrip } from "./_home/WeekStrip";

type Copyable = { meal_type: MealType; calories: number; names: string[] };
type DayData = {
  day: string;
  meals: Meal[];
  totals: Totals;
  micros: Micros;
  microsKnown: MicroKey[];
  targets: Targets;
  goals: Record<string, number | null>;
  goalsSet: boolean;
  homeCards: CardKey[];
  logSort: Prefs["logSort"];
  week: { day: string; calories: number }[];
  water: { ml: number; goal: number; glassMl: number } | null;
  fasting: { goalHours: number; active: Fast | null } | null;
  adaptive: { kcal: number; note: string | null } | null;
  reminders: Reminders;
  copyable: Copyable[];
};

const mealLabel = (t: MealType) => MEAL_TYPES.find((m) => m.id === t)!.label;

export function TodayView() {
  const router = useRouter();
  const params = useSearchParams();
  const today = dayKey();
  const requested = params.get("date");
  const day = isDayKey(requested) && requested <= today ? requested : today;

  const [data, setData] = useState<DayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/day?date=${day}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((d: DayData) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch(() => alive && setError("Couldn't load this day. Make sure the app is still running, then refresh."));
    return () => {
      alive = false;
    };
  }, [day, version]);

  const go = (d: string) => router.replace(d === today ? "/" : `/?date=${d}`, { scroll: false });
  const subtitle = parseDay(day).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const ready = data?.day === day ? data : null;
  const addHref = day === today ? "/add" : `/add?date=${day}`;
  const due =
    ready && day === today ? dueReminders({ ...DEFAULT_PREFS, reminders: ready.reminders }, ready.meals) : [];

  const setFast = (active: Fast | null) => setData((d) => (d && d.fasting ? { ...d, fasting: { ...d.fasting, active } } : d));
  async function quickFast(action: "start" | "end") {
    const res = await fetch("/api/fasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    if (res?.ok) setFast((await res.json()).active);
  }

  async function setSort(logSort: Prefs["logSort"]) {
    setData((d) => (d ? { ...d, logSort } : d));
    await fetch("/api/prefs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logSort }) }).catch(() => {});
  }

  return (
    <div className="stagger mx-auto max-w-5xl px-4 sm:px-6 lg:px-10">
      <PageHeader
        key={day}
        title={dayTitle(day)}
        eyebrow={day === today || day === shiftDay(today, -1) ? subtitle : "Looking back"}
        action={<QuickMenu addHref={addHref} fasting={ready?.fasting ?? null} onFast={quickFast} />}
      />

      {ready && (
        <div className="-mt-2 mb-5">
          <WeekStrip day={day} week={ready.week} target={ready.targets.calories} onPick={go} />
        </div>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      {ready && !ready.goalsSet && (
        <div className="mb-5">
          <Notice>
            Using a 2,000 kcal starter target.{" "}
            <Link href="/goals" className="font-semibold underline underline-offset-2">
              Set your goals
            </Link>{" "}
            to get one that fits you.
          </Notice>
        </div>
      )}
      {ready?.adaptive?.note && day === today && (
        <div className="mb-5">
          <Notice>
            <Sparks className="mr-1 inline size-4 align-[-3px]" /> Adaptive Goals: {ready.adaptive.note}
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div className="stagger space-y-4 lg:sticky lg:top-6">
          <section
            aria-label="Daily progress"
            className="night relative overflow-hidden rounded-[32px] p-5 shadow-[0_30px_60px_-20px_rgb(6_21_14/0.55)] sm:p-6"
          >
            {/* Lime orb drifting in the corner of the hero card. */}
            <div
              aria-hidden="true"
              className="float pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-[radial-gradient(circle,rgb(163_230_53/0.45),transparent_65%)]"
            />
            {ready ? (
              <div className="relative">
                <Thali totals={ready.totals} targets={ready.targets} />
                {ready.water && (
                  // Water progress sits right under the calories.
                  <p className="num -mt-1 mb-1 text-center text-xs text-muted">
                    Water {fmt(ready.water.ml)} / {fmt(ready.water.goal)} ml
                  </p>
                )}
                <div className="mt-5">
                  <Katoris
                    cards={ready.homeCards.map((key) => {
                      const info = cardInfo(key);
                      const value = key in ready.totals ? ready.totals[key as keyof Totals] : (ready.micros[key as MicroKey] ?? 0);
                      return { key, label: info.label, unit: info.unit, kind: info.kind, value, goal: info.kind === "info" ? null : ready.goals[key] };
                    })}
                  />
                </div>
                <NutrientDetails totals={ready.totals} targets={ready.targets} micros={ready.micros} known={ready.microsKnown} goals={ready.goals} />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-6" aria-hidden="true">
                <div className="aspect-square w-full max-w-[300px] animate-pulse rounded-full bg-surface-2" />
                <div className="grid w-full grid-cols-3 gap-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="mx-auto size-[80px] animate-pulse rounded-full bg-surface-2" />
                  ))}
                </div>
              </div>
            )}
          </section>
          {ready?.water && <WaterCard key={day} day={day} initial={ready.water.ml} goal={ready.water.goal} glassMl={ready.water.glassMl} />}
          {ready?.fasting && day === today && <FastingCard active={ready.fasting.active} goalHours={ready.fasting.goalHours} onChange={setFast} />}
          {day === today && (
            <Link
              href="/plan"
              className="group card relative flex items-center gap-4 overflow-hidden p-4 shadow-sm transition-[transform,box-shadow] duration-500 ease-out-expo hover:-translate-y-1 hover:shadow-md"
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 bg-[linear-gradient(120deg,rgb(251_191_36/0.18),transparent_45%,rgb(124_58_237/0.12))] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              />
              <span className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-carbs to-protein text-white shadow-sm transition-transform duration-500 ease-spring group-hover:-rotate-6 group-hover:scale-110">
                <Fridge className="size-6" />
              </span>
              <span className="relative min-w-0 flex-1">
                <span className="block font-display text-lg font-bold tracking-tight">What should I cook?</span>
                <span className="block text-sm text-muted">Plan meals, grams and recipes from what&apos;s in your kitchen</span>
              </span>
              <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink transition-transform duration-500 ease-spring group-hover:translate-x-1 group-hover:bg-ink group-hover:text-paper">
                <NavArrowRight className="size-4" />
              </span>
            </Link>
          )}
        </div>

        <section aria-labelledby="meals-heading">
          {due.length > 0 && (
            <div className="mb-4 flex animate-rise items-center gap-3 rounded-2xl border border-carbs/25 bg-carbs/12 px-4 py-3 text-[15px]">
              <Bell className="size-5 shrink-0 text-carbs [animation:float_2.4s_ease-in-out_infinite]" />
              <span className="flex-1">
                You haven&apos;t logged {due.map((t) => mealLabel(t).toLowerCase()).join(" or ")} yet.
              </span>
              <Link href="/add" className="shrink-0 font-semibold text-leaf underline-offset-2 hover:underline">
                Log it
              </Link>
            </div>
          )}

          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 id="meals-heading" className="font-display text-3xl font-bold tracking-[-0.04em]">
              Meals
              {ready && ready.meals.length > 0 && (
                <sup className="num ml-1 align-super font-sans text-sm font-semibold text-leaf">{ready.meals.length}</sup>
              )}
            </h2>
            <Link href={addHref} className={`${btn.secondary} h-10 px-4 text-sm`}>
              <Camera className="size-[18px]" />
              Log a meal
            </Link>
          </div>

          {ready && ready.meals.length > 1 && (
            <div className="mb-4 max-w-xs">
              <Segmented
                label="Sort meals"
                value={ready.logSort}
                onChange={setSort}
                options={[
                  { value: "grouped", label: "By meal" },
                  { value: "latest", label: "Latest first" },
                ]}
              />
            </div>
          )}

          {ready && ready.copyable.length > 0 && (
            <CopySuggestions day={day} isToday={day === today} items={ready.copyable} onDone={reload} />
          )}

          {!ready ? (
            <div className="space-y-3" aria-hidden="true">
              {[0, 1].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-3xl bg-surface-2" />
              ))}
            </div>
          ) : ready.meals.length === 0 ? (
            <EmptyDay href={addHref} isToday={day === today} />
          ) : (
            <MealList meals={ready.meals} sort={ready.logSort} onChange={reload} />
          )}
        </section>
      </div>
    </div>
  );
}

function CopySuggestions({
  day,
  isToday,
  items,
  onDone,
}: {
  day: string;
  isToday: boolean;
  items: Copyable[];
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<MealType | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function copy(meal_type: MealType) {
    setBusy(meal_type);
    setError(null);
    const res = await fetch("/api/meals/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromDay: shiftDay(day, -1), toDay: day, meal_type }),
    }).catch(() => null);
    setBusy(null);
    if (res?.ok) onDone();
    else setError("Couldn't copy that meal. Try again.");
  }

  return (
    <div className="mb-5 animate-rise rounded-3xl border border-dashed border-leaf/40 bg-leaf-soft/40 p-3 sm:p-4">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted">
        <Copy className="size-4" /> Same as {isToday ? "yesterday" : "the day before"}?
      </p>
      <ul className="space-y-1.5">
        {items.map((c) => (
          <li key={c.meal_type} className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">{mealLabel(c.meal_type)}</span>
              <span className="num block truncate text-sm text-muted">
                {c.names.join(", ")} · {fmt(c.calories)} kcal
              </span>
            </span>
            <button
              type="button"
              onClick={() => copy(c.meal_type)}
              disabled={busy !== null}
              className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-leaf px-3.5 text-sm font-semibold text-on-leaf transition-transform duration-300 ease-spring hover:scale-105 active:scale-95 disabled:opacity-60"
            >
              {busy === c.meal_type ? <Spinner className="size-4" /> : <Plus className="size-4" />} Add
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

function EmptyDay({ href, isToday }: { href: string; isToday: boolean }) {
  return (
    <div className="card relative flex animate-rise flex-col items-center overflow-hidden px-6 py-14 text-center">
      <div
        aria-hidden="true"
        className="absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--aurora-2),transparent_65%)]"
      />
      <span className="float relative flex size-20 items-center justify-center rounded-[26px] bg-gradient-to-br from-leaf to-lime text-on-leaf shadow-glow">
        <Cutlery className="size-9" />
      </span>
      <p className="relative mt-6 font-display text-2xl font-bold tracking-[-0.03em]">
        {isToday ? "Your plate is empty" : "Nothing logged this day"}
      </p>
      <p className="relative mt-2 max-w-xs text-[15px] text-muted">
        Take a photo of your plate, scan a barcode or pick a favourite, and CalAi will work out the calories.
      </p>
      <Link href={href} className={`${btn.primary} relative mt-7`}>
        <Camera className="size-5" />
        Log a meal
      </Link>
    </div>
  );
}

function MealList({ meals, sort, onChange }: { meals: Meal[]; sort: Prefs["logSort"]; onChange: () => void }) {
  // "Latest first" lists every meal by when it was logged; the default groups them by meal.
  if (sort === "latest") {
    const latest = [...meals].sort((a, b) => b.eaten_at.localeCompare(a.eaten_at));
    return (
      <ul className="card divide-y divide-line/70 overflow-hidden shadow-sm">
        {latest.map((m) => (
          <MealRow key={m.id} meal={m} onChange={onChange} showType />
        ))}
      </ul>
    );
  }
  const groups = MEAL_TYPES.map((t) => ({ ...t, meals: meals.filter((m) => m.meal_type === t.id) })).filter(
    (g) => g.meals.length > 0,
  );

  return (
    <div className="stagger space-y-6">
      {groups.map((g) => {
        const kcal = sumItems(g.meals.flatMap((m) => m.items)).calories;
        return (
          <div key={g.id}>
            <div className="mb-2 flex items-center justify-between px-1">
              <h3 className="eyebrow text-ink">{g.label}</h3>
              <span className="num rounded-full bg-surface/80 px-2.5 py-0.5 text-xs font-semibold text-muted ring-1 ring-line">
                {fmt(kcal)} kcal
              </span>
            </div>
            <ul className="card divide-y divide-line/70 overflow-hidden shadow-sm">
              {g.meals.map((m) => (
                <MealRow key={m.id} meal={m} onChange={onChange} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function MealRow({ meal, onChange, showType }: { meal: Meal; onChange: () => void; showType?: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fav, setFav] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const totals = sumItems(meal.items);
  const time = new Date(meal.eaten_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

  async function remove() {
    setDeleting(true);
    const res = await fetch(`/api/meals/${meal.id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) onChange();
  }

  async function favourite() {
    setFav("saving");
    const res = await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mealId: meal.id }),
    }).catch(() => null);
    setFav(res?.ok ? "saved" : "error");
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setConfirming(false);
        }}
        aria-expanded={open}
        className="group flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-left transition-colors duration-300 hover:bg-surface-2/50 sm:px-4"
      >
        {meal.photo ? (
          <span className="size-16 shrink-0 overflow-hidden rounded-2xl ring-1 ring-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={meal.photo}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-700 ease-out-expo group-hover:scale-110"
            />
          </span>
        ) : (
          <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-leaf-soft to-surface-2 text-leaf">
            <Cutlery className="size-6" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{meal.items.map((i) => i.name).join(", ")}</span>
          <span className="num mt-0.5 block text-sm text-muted">
            {showType ? `${mealLabel(meal.meal_type)} · ` : ""}
            {time} · P {fmt1(totals.protein_g)} · C {fmt1(totals.carbs_g)} · F {fmt1(totals.fat_g)}
          </span>
        </span>
        <span className="num shrink-0 text-right">
          <span className="block font-display text-2xl font-bold leading-tight tracking-tight">{fmt(totals.calories)}</span>
          <span className="block text-xs text-muted">kcal</span>
        </span>
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-full transition-[transform,background-color] duration-500 ease-spring ${
            open ? "rotate-180 bg-ink text-paper" : "bg-surface-2 text-muted"
          }`}
        >
          <NavArrowDown className="size-4" />
        </span>
      </button>

      {open && (
        <div className="animate-rise border-t border-line/70 bg-surface-2/40 px-3 pb-3 pt-2 [animation-duration:450ms] sm:px-4">
          <table className="num w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1.5 font-medium">Item</th>
                <th className="py-1.5 text-right font-medium">g</th>
                <th className="py-1.5 text-right font-medium">kcal</th>
                <th className="hidden py-1.5 text-right font-medium sm:table-cell">P / C / F</th>
                <th className="hidden py-1.5 text-right font-medium md:table-cell">Fiber</th>
              </tr>
            </thead>
            <tbody>
              {meal.items.map((i, idx) => (
                <tr key={idx} className="border-t border-line/70">
                  <td className="py-2 pr-2">{i.name}</td>
                  <td className="py-2 text-right text-muted">
                    {fmt1(i.grams)}
                    {i.unit && i.unit_grams ? <span className="block text-xs">{fmt1(i.grams / i.unit_grams)} {i.unit}</span> : null}
                  </td>
                  <td className="py-2 text-right font-medium">{fmt(i.calories)}</td>
                  <td className="hidden py-2 text-right text-muted sm:table-cell">
                    {fmt1(i.protein_g)} / {fmt1(i.carbs_g)} / {fmt1(i.fat_g)}
                  </td>
                  <td className="hidden py-2 text-right text-muted md:table-cell">{fmt1(i.fiber_g)} g</td>
                </tr>
              ))}
            </tbody>
          </table>
          {meal.note && <p className="mt-2 text-sm text-muted">Note: {meal.note}</p>}
          <div className="mt-3 flex flex-wrap items-center justify-end gap-1">
            {confirming ? (
              <>
                <button type="button" className={btn.ghost} onClick={() => setConfirming(false)}>
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={deleting}
                  className="inline-flex animate-pop cursor-pointer items-center gap-1.5 rounded-full bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:text-paper"
                >
                  <Trash className="size-4" />
                  {deleting ? "Deleting…" : "Delete meal"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`${btn.ghost} ${fav === "saved" ? "text-carbs" : ""}`}
                  onClick={favourite}
                  disabled={fav === "saving" || fav === "saved"}
                >
                  <Star className="size-4" fill={fav === "saved" ? "currentColor" : "none"} />
                  {fav === "saved" ? "In favourites" : fav === "error" ? "Couldn't save" : "Favourite"}
                </button>
                <Link href={`/add?edit=${meal.id}`} className={btn.ghost}>
                  <EditPencil className="size-4" />
                  Edit
                </Link>
                <button type="button" className={`${btn.ghost} hover:text-danger`} onClick={() => setConfirming(true)}>
                  <Trash className="size-4" />
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
