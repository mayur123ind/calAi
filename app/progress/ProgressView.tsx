"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { FireFlame, GraphUp, Trash, Trophy, Weight, WarningTriangle } from "iconoir-react";
import { IconButton, Notice, PageHeader, Segmented, Spinner, btn, input } from "@/components/ui";
import { dayKey, parseDay, shiftDay, shortDate } from "@/lib/dates";
import type { Forecast } from "@/lib/forecast";
import { fmt, fmt1, type Targets } from "@/lib/nutrition";

type Point = { day: string; value: number };
type DaySummary = { day: string; meals: number; calories: number; protein_g: number; carbs_g: number; fat_g: number };
type Data = {
  today: string;
  goalsSet: boolean;
  goal: "lose" | "maintain" | "gain";
  targetWeightKg: number | null;
  targets: Targets;
  bodyFatEnabled: boolean;
  weights: { day: string; kg: number }[];
  bodyFat: { day: string; pct: number }[];
  burns: { day: string; kcal: number }[];
  days: DaySummary[];
  forecast: Forecast;
};

type Metric = "weight" | "bodyFat" | "burn";
const RANGES = [
  { value: "1W", label: "1W", days: 7 },
  { value: "1M", label: "1M", days: 30 },
  { value: "3M", label: "3M", days: 91 },
  { value: "6M", label: "6M", days: 182 },
  { value: "1Y", label: "1Y", days: 365 },
  { value: "All", label: "All", days: 0 },
] as const;
type Range = (typeof RANGES)[number]["value"];

const signed = (n: number, digits = 1) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`;

export function ProgressView() {
  const params = useSearchParams();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("weight");
  const [range, setRange] = useState<Range>("1M");
  const [celebrate, setCelebrate] = useState<number | null>(null);

  const load = useCallback(() => {
    fetch("/api/progress", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError("Couldn't load your progress. Refresh to try again."));
  }, []);
  useEffect(load, [load]);

  const from = (() => {
    const r = RANGES.find((x) => x.value === range)!;
    return r.days ? shiftDay(dayKey(), -(r.days - 1)) : "0000-00-00";
  })();

  const series: Point[] = !data
    ? []
    : metric === "weight"
      ? data.weights.map((w) => ({ day: w.day, value: w.kg }))
      : metric === "bodyFat"
        ? data.bodyFat.map((b) => ({ day: b.day, value: b.pct }))
        : data.burns.map((b) => ({ day: b.day, value: b.kcal }));
  const inRange = series.filter((p) => p.day >= from);
  const unit = metric === "weight" ? "kg" : metric === "bodyFat" ? "%" : "kcal";

  return (
    <div className="stagger mx-auto max-w-4xl px-4 sm:px-6 lg:px-10">
      <PageHeader title="Progress" sub="Weight, body fat and workout burn, with your calories and the trend ahead." />

      {celebrate !== null && (
        <div className="mb-6 flex animate-rise items-center gap-3 rounded-3xl border border-leaf/30 bg-leaf-soft p-4">
          <Trophy className="size-8 shrink-0 text-leaf" />
          <div>
            <p className="font-display text-lg font-bold">Goal reached: {fmt1(celebrate)} kg!</p>
            <p className="text-sm text-muted">
              Great work. Set a new target or switch to maintaining on{" "}
              <Link href="/goals" className="font-semibold text-leaf underline-offset-2 hover:underline">Goals</Link>.
            </p>
          </div>
        </div>
      )}

      <LogForm
        bodyFat={!!data?.bodyFatEnabled}
        focus={params.get("log") === "weight"}
        onSaved={(goalReached, kg) => {
          if (goalReached) setCelebrate(kg);
          load();
        }}
      />

      {error && <Notice tone="error">{error}</Notice>}
      {!data ? (
        <div className="h-72 animate-pulse rounded-3xl bg-surface-2" aria-hidden="true" />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="sm:w-80">
              <Segmented
                label="Chart"
                value={metric}
                onChange={setMetric}
                options={[
                  { value: "weight", label: <><Weight className="size-4" /> Weight</> },
                  ...(data.bodyFatEnabled || data.bodyFat.length ? [{ value: "bodyFat" as const, label: "Body fat" }] : []),
                  { value: "burn", label: <><FireFlame className="size-4" /> Burn</> },
                ]}
              />
            </div>
            <div className="sm:w-80">
              <Segmented label="Range" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />
            </div>
          </div>

          <Summary points={inRange} unit={unit} metric={metric} />

          {inRange.length > 1 ? (
            metric === "burn" ? (
              <Bars points={inRange} unit={unit} color="var(--protein)" />
            ) : (
              <Line points={inRange} target={metric === "weight" ? data.targetWeightKg : null} />
            )
          ) : (
            <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-[15px] text-muted">
              {metric === "burn"
                ? "Workout burn shows up after you calculate it on the Workouts tab."
                : "Log at least two entries in this range to see a trend."}
            </p>
          )}

          {metric === "weight" && <ForecastCard f={data.forecast} goal={data.goal} />}

          <Calories days={data.days.filter((d) => d.day >= from && d.day < data.today)} targets={data.targets} />

          <Entries
            metric={metric}
            points={[...inRange].reverse()}
            unit={unit}
            onDelete={async (day) => {
              const url = metric === "weight" ? `/api/weights?day=${day}` : metric === "bodyFat" ? `/api/body-fat?day=${day}` : `/api/burns?day=${day}`;
              const res = await fetch(url, { method: "DELETE" }).catch(() => null);
              if (res?.ok) load();
              else setError("Couldn't delete that entry.");
            }}
          />
        </div>
      )}
    </div>
  );
}

function LogForm({ bodyFat, focus, onSaved }: { bodyFat: boolean; focus: boolean; onSaved: (goalReached: boolean, kg: number) => void }) {
  const [kg, setKg] = useState("");
  const [pct, setPct] = useState("");
  const [day, setDay] = useState(dayKey());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kgId = useId();
  const pctId = useId();
  const dayId = useId();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      let reached = false;
      const w = Number(kg.replace(",", "."));
      if (kg) {
        const res = await fetch("/api/weights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day, kg: w }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        reached = data.goalReached;
      }
      if (pct) {
        const res = await fetch("/api/body-fat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ day, pct: Number(pct.replace(",", ".")) }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
      }
      setKg("");
      setPct("");
      onSaved(reached, w);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mb-6 card p-4 shadow-md sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor={kgId} className="mb-1.5 block text-sm font-medium">Weight</label>
          <div className="relative">
            <input id={kgId} autoFocus={focus} inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="70.5" className={`${input} num pr-10`} />
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">kg</span>
          </div>
        </div>
        {bodyFat && (
          <div className="sm:w-32">
            <label htmlFor={pctId} className="mb-1.5 block text-sm font-medium">Body fat</label>
            <div className="relative">
              <input id={pctId} inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="22" className={`${input} num pr-8`} />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">%</span>
            </div>
          </div>
        )}
        <div className="sm:w-44">
          <label htmlFor={dayId} className="mb-1.5 block text-sm font-medium">Date</label>
          <input id={dayId} type="date" required value={day} max={dayKey()} onChange={(e) => setDay(e.target.value)} className={input} />
        </div>
        <button type="submit" disabled={saving || (!kg && !pct)} className={btn.primary}>
          {saving ? <><Spinner /> Saving…</> : "Save"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <p className="mt-2 text-xs text-muted">Weigh in at the same time of day for a fair trend.</p>
    </form>
  );
}

/** Average and net change for the range on screen. */
function Summary({ points, unit, metric }: { points: Point[]; unit: string; metric: Metric }) {
  if (points.length === 0) return null;
  const avg = points.reduce((a, p) => a + p.value, 0) / points.length;
  const net = points.at(-1)!.value - points[0].value;
  const digits = metric === "burn" ? 0 : 1;
  return (
    <div className="grid grid-cols-3 gap-3">
      <Stat label={metric === "burn" ? "Average day" : "Average"} value={avg.toFixed(digits)} unit={unit} />
      {metric === "burn" ? (
        <Stat label="Total" value={fmt(points.reduce((a, p) => a + p.value, 0))} unit={unit} />
      ) : (
        <Stat label="Net change" value={signed(net, digits)} unit={unit} tone={net < 0 ? "text-leaf" : net > 0 ? "text-protein" : undefined} />
      )}
      <Stat label="Latest" value={points.at(-1)!.value.toFixed(digits)} unit={unit} />
    </div>
  );
}

function ForecastCard({ f, goal }: { f: Forecast; goal: string }) {
  const hasTrend = f.expected.length > 0;
  return (
    <section aria-labelledby="forecast-heading" className="card p-4 shadow-sm sm:p-6">
      <h2 id="forecast-heading" className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
        <GraphUp className="size-5 text-leaf" /> Where you&apos;re heading
      </h2>
      {!hasTrend ? (
        <p className="mt-2 text-[15px] text-muted">
          Log your meals on at least 5 days and two weigh-ins a week apart to see your forecast.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {f.expected.map((e) => (
              <div key={e.days} className="rounded-2xl bg-surface-2/70 p-3 text-center">
                <p className="text-xs text-muted">In {e.days} days</p>
                <p className="num font-display text-xl font-bold">{fmt1(e.kg)} <span className="text-xs font-medium text-muted">kg</span></p>
              </div>
            ))}
          </div>
          <dl className="num mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <Row label="From your food log" value={f.predictedWeeklyKg === null ? "Not enough logs" : `${signed(f.predictedWeeklyKg, 2)} kg / week`} />
            <Row label="From your weigh-ins" value={f.observedWeeklyKg === null ? "Need 1+ week of weigh-ins" : `${signed(f.observedWeeklyKg, 2)} kg / week`} />
            <Row label="Average eaten" value={f.avgIntake === null ? "—" : `${fmt(f.avgIntake)} kcal (${f.loggedDays} days)`} />
            <Row label="Maintenance" value={f.observedTdee ? `${fmt(f.observedTdee)} kcal measured` : `${fmt(f.formulaTdee)} kcal estimated`} />
            {f.targetKg !== null && (
              <Row label={`To ${fmt1(f.targetKg)} kg`} value={f.daysToGoal ? `about ${f.daysToGoal} days (${shortDate(shiftDay(dayKey(), f.daysToGoal))})` : goal === "maintain" ? "holding" : "not on current trend"} />
            )}
          </dl>
          {f.underLogging && (
            <div className="mt-4 flex gap-2 rounded-2xl border border-carbs/30 bg-carbs/10 p-3 text-sm">
              <WarningTriangle className="size-5 shrink-0 text-carbs" />
              <span>
                Your weight is moving {f.observedWeeklyKg! > f.predictedWeeklyKg! ? "up faster" : "differently"} than your food log explains. Some meals, oil or drinks may be
                missing from your logs{f.sparseDays ? ` (${f.sparseDays} days looked incomplete)` : ""}.
              </span>
            </div>
          )}
          <p className="mt-3 text-xs text-muted">Forecasts assume about 7,700 kcal per kg and that your logging stays as it is.</p>
        </>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 rounded-xl bg-surface-2/50 px-3 py-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

/** Calorie bars against the target, with macro averages for logged days. */
function Calories({ days, targets }: { days: DaySummary[]; targets: Targets }) {
  const logged = days.filter((d) => d.calories > 0);
  if (logged.length === 0) return null;
  const avg = (k: keyof DaySummary) => logged.reduce((a, d) => a + (d[k] as number), 0) / logged.length;
  return (
    <section aria-labelledby="cal-heading" className="space-y-3">
      <h2 id="cal-heading" className="font-display text-xl font-semibold tracking-tight">Calories & macros</h2>
      <Bars points={logged.map((d) => ({ day: d.day, value: d.calories }))} unit="kcal" color="var(--leaf)" target={targets.calories} />
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Avg kcal" value={fmt(avg("calories"))} unit="" />
        <Stat label="Protein" value={fmt1(avg("protein_g"))} unit="g" />
        <Stat label="Carbs" value={fmt1(avg("carbs_g"))} unit="g" />
        <Stat label="Fat" value={fmt1(avg("fat_g"))} unit="g" />
      </div>
      <p className="text-xs text-muted">Averages over {logged.length} logged {logged.length === 1 ? "day" : "days"}; today isn&apos;t counted until it&apos;s over.</p>
    </section>
  );
}

function Line({ points, target }: { points: Point[]; target: number | null }) {
  const W = 600;
  const H = 200;
  const values = points.map((p) => p.value).concat(target !== null ? [target] : []);
  const lo = Math.floor(Math.min(...values) - 0.5);
  const hi = Math.ceil(Math.max(...values) + 0.5);
  const t0 = parseDay(points[0].day).getTime();
  const span = Math.max(parseDay(points.at(-1)!.day).getTime() - t0, 1);
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const pts = points.map((p) => [((parseDay(p.day).getTime() - t0) / span) * W, y(p.value)]);
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  return (
    <section aria-label="Trend" className="card p-4 shadow-md sm:p-6">
      <div className="flex gap-3">
        <div className="num flex flex-col justify-between py-1 text-xs text-muted">
          <span>{hi}</span>
          <span>{lo}</span>
        </div>
        <div className="flex-1">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-44 w-full overflow-visible sm:h-52" aria-hidden="true">
            <defs>
              <linearGradient id="pfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--leaf)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--leaf)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {target !== null && (
              <path d={`M0,${y(target)} L${W},${y(target)}`} stroke="var(--carbs)" strokeWidth="1.5" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
            )}
            <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#pfill)" />
            <path d={line} fill="none" stroke="var(--leaf)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {pts.map(([px, py], i) => (
              <path key={i} d={`M${px},${py} l0,0`} stroke="var(--leaf)" strokeWidth="8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          <div className="mt-2 flex justify-between text-xs text-muted">
            <span>{shortDate(points[0].day)}</span>
            {target !== null && <span className="text-carbs">Target {fmt1(target)} kg</span>}
            <span>{shortDate(points.at(-1)!.day)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Bars({ points, unit, color, target }: { points: Point[]; unit: string; color: string; target?: number }) {
  const max = Math.max(...points.map((p) => p.value), target ?? 0) || 1;
  return (
    <section aria-label={`${unit} by day`} className="card p-4 shadow-sm sm:p-5">
      <div className="relative flex h-40 items-end gap-[2px]">
        {target !== undefined && (
          <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-carbs/70" style={{ bottom: `${(target / max) * 100}%` }} />
        )}
        {points.map((p) => (
          <div
            key={p.day}
            title={`${shortDate(p.day)}: ${fmt(p.value)} ${unit}`}
            className="min-w-[3px] flex-1 rounded-t-md"
            style={{ height: `${Math.max(2, (p.value / max) * 100)}%`, background: target !== undefined && p.value > target * 1.05 ? "var(--protein)" : color }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>{shortDate(points[0].day)}</span>
        {target !== undefined && <span className="text-carbs">Target {fmt(target)} {unit}</span>}
        <span>{shortDate(points.at(-1)!.day)}</span>
      </div>
    </section>
  );
}

function Entries({ metric, points, unit, onDelete }: { metric: Metric; points: Point[]; unit: string; onDelete: (day: string) => void }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  if (points.length === 0) return null;
  const title = metric === "weight" ? "Weight history" : metric === "bodyFat" ? "Body fat history" : "Burn history";
  return (
    <section aria-label={title}>
      <h2 className="mb-2 font-display text-xl font-semibold tracking-tight">{title}</h2>
      <ul className="divide-y divide-line overflow-hidden card shadow-sm">
        {points.slice(0, 60).map((p) => (
          <li key={p.day} className="flex items-center gap-3 px-4 py-2.5">
            <span className="flex-1">
              <span className="block text-[15px] font-medium">{shortDate(p.day)}</span>
              <span className="block text-xs text-muted">{parseDay(p.day).toLocaleDateString("en-IN", { weekday: "long", year: "numeric" })}</span>
            </span>
            <span className="num font-semibold">
              {metric === "burn" ? fmt(p.value) : p.value.toFixed(1)} {unit}
            </span>
            {confirm === p.day ? (
              <button type="button" onClick={() => onDelete(p.day)} className="h-9 rounded-full bg-danger px-3 text-sm font-semibold text-white">
                Delete
              </button>
            ) : (
              <IconButton label={`Delete entry for ${shortDate(p.day)}`} onClick={() => setConfirm(p.day)} className="hover:text-danger">
                <Trash className="size-[18px]" />
              </IconButton>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ label, value, unit, tone }: { label: string; value: string; unit: string; tone?: string }) {
  return (
    <div className="card p-3 shadow-sm sm:p-4">
      <p className="text-xs text-muted sm:text-sm">{label}</p>
      <p className={`num mt-1 font-display text-lg font-semibold leading-tight sm:text-2xl ${tone ?? ""}`}>
        {value} {unit && <span className="text-xs font-medium text-muted sm:text-sm">{unit}</span>}
      </p>
    </div>
  );
}
