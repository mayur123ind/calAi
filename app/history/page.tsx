"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Flash, LightBulb, NavArrowRight, Page, Refresh, Sparks, ThumbsUp, TriangleFlag } from "iconoir-react";
import { Notice, PageHeader, Segmented, Spinner, btn } from "@/components/ui";
import { dayKey, parseDay, shiftDay, shortDate } from "@/lib/dates";
import { fmt, type Targets } from "@/lib/nutrition";

type Summary = { day: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; meals: number };
type History = {
  from: string;
  to: string;
  days: Summary[];
  targets: Targets;
  streak: { current: number; best: number };
  calendar: { from: string; days: { day: string; calories: number }[] };
};

export default function HistoryPage() {
  const [range, setRange] = useState<7 | 30>(7);
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/history?today=${dayKey()}&days=${range}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [range]);

  // Ignore the previous range's data while the new one loads.
  const ready = data && shiftDay(data.to, -(range - 1)) === data.from ? data : null;

  return (
    <div className="stagger mx-auto max-w-3xl px-4 sm:px-6 lg:px-10">
      <PageHeader
        title="History"
        sub="How your days compare with your target."
        action={
          <Link href="/report" className={`${btn.ghost} text-leaf`}>
            <Page className="size-[18px]" />
            <span className="hidden sm:inline">Reports & export</span>
            <span className="sm:hidden">Export</span>
          </Link>
        }
      />

      <div className="mb-5 max-w-xs">
        <Segmented
          label="Range"
          value={range}
          onChange={setRange}
          options={[
            { value: 7, label: "7 days" },
            { value: 30, label: "30 days" },
          ]}
        />
      </div>

      {error && <Notice tone="error">Couldn&apos;t load your history. Refresh to try again.</Notice>}
      {!ready && !error && <div className="h-72 animate-pulse rounded-3xl bg-surface-2" aria-hidden="true" />}
      {ready && <HistoryBody data={ready} range={range} />}
    </div>
  );
}

function HistoryBody({ data, range }: { data: History; range: number }) {
  const byDay = new Map(data.days.map((d) => [d.day, d]));
  const series = Array.from({ length: range }, (_, i) => {
    const day = shiftDay(data.from, i);
    return { day, kcal: byDay.get(day)?.calories ?? 0 };
  });
  const target = data.targets.calories;
  const logged = data.days.filter((d) => d.calories > 0);
  const avg = logged.length ? logged.reduce((s, d) => s + d.calories, 0) / logged.length : 0;
  const onTarget = logged.filter((d) => d.calories <= target * 1.05).length;
  const max = Math.max(target * 1.25, ...series.map((s) => s.kcal));
  const today = dayKey();

  return (
    <div className="space-y-6">
      <StreakCard streak={data.streak} />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Daily average" value={logged.length ? fmt(avg) : "–"} unit={logged.length ? "kcal" : ""} />
        <Stat label="Days logged" value={`${logged.length}`} unit={`of ${range}`} />
        <Stat label="Within target" value={`${onTarget}`} unit={onTarget === 1 ? "day" : "days"} />
      </div>

      <Insights />

      <section aria-label="Calories per day" className="card p-4 shadow-md sm:p-6">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="font-medium">Calories per day</span>
          <span className="flex items-center gap-2 text-muted">
            <span className="h-0 w-5 border-t-2 border-dashed border-muted" /> Target {fmt(target)}
          </span>
        </div>
        <div className="relative h-48 sm:h-56">
          <div
            className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-muted/50"
            style={{ bottom: `${(target / max) * 100}%` }}
            aria-hidden="true"
          />
          <div className={`flex h-full items-end ${range > 7 ? "gap-[3px] sm:gap-1" : "gap-2 sm:gap-4"}`}>
            {series.map((s) => {
              const over = s.kcal > target * 1.05;
              return (
                <Link
                  key={s.day}
                  href={s.day === today ? "/" : `/?date=${s.day}`}
                  aria-label={`${shortDate(s.day)}: ${fmt(s.kcal)} kcal`}
                  title={`${shortDate(s.day)}: ${fmt(s.kcal)} kcal`}
                  className="group flex h-full flex-1 items-end"
                >
                  <span
                    className={`block w-full rounded-t-md transition-opacity group-hover:opacity-80 ${
                      s.kcal === 0 ? "bg-surface-2" : over ? "bg-protein" : "bg-leaf"
                    }`}
                    style={{ height: s.kcal === 0 ? "4px" : `${Math.max(2, (s.kcal / max) * 100)}%` }}
                  />
                </Link>
              );
            })}
          </div>
        </div>
        <div className="mt-2 flex text-xs text-muted">
          {range === 7 ? (
            series.map((s) => (
              <span key={s.day} className="flex-1 text-center">
                {parseDay(s.day).toLocaleDateString("en-IN", { weekday: "short" })}
              </span>
            ))
          ) : (
            <>
              <span className="flex-1">{shortDate(series[0].day)}</span>
              <span className="flex-1 text-center">{shortDate(series[15].day)}</span>
              <span className="flex-1 text-right">Today</span>
            </>
          )}
        </div>
      </section>

      <Calendar from={data.calendar.from} days={data.calendar.days} target={target} />

      <section aria-labelledby="days-heading">
        <h2 id="days-heading" className="mb-3 font-display text-xl font-semibold tracking-tight">
          Logged days
        </h2>
        {logged.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-[15px] text-muted">
            No meals in this range yet. Days you log will show up here.
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden card shadow-sm">
            {[...logged].reverse().map((d) => {
              const pct = Math.min(d.calories / target, 1.25) / 1.25;
              const over = d.calories > target * 1.05;
              return (
                <li key={d.day}>
                  <Link
                    href={d.day === today ? "/" : `/?date=${d.day}`}
                    className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface-2/60"
                  >
                    <span className="w-24 shrink-0">
                      <span className="block text-[15px] font-medium">{shortDate(d.day)}</span>
                      <span className="block text-xs text-muted">
                        {parseDay(d.day).toLocaleDateString("en-IN", { weekday: "long" })}
                      </span>
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <span
                        className={`block h-full rounded-full ${over ? "bg-protein" : "bg-leaf"}`}
                        style={{ width: `${pct * 100}%` }}
                      />
                    </span>
                    <span className="num w-20 shrink-0 text-right">
                      <span className="block font-semibold">{fmt(d.calories)}</span>
                      <span className="block text-xs text-muted">
                        {d.meals} {d.meals === 1 ? "meal" : "meals"}
                      </span>
                    </span>
                    <NavArrowRight className="size-4 shrink-0 text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function StreakCard({ streak }: { streak: { current: number; best: number } }) {
  const { current, best } = streak;
  return (
    <section aria-label="Logging streak" className="flex items-center gap-4 card p-4 shadow-sm sm:p-5">
      <span className={`flex size-14 shrink-0 items-center justify-center rounded-2xl ${current ? "bg-carbs/15 text-carbs" : "bg-surface-2 text-muted"}`}>
        <Flash className="size-7" fill={current ? "currentColor" : "none"} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="num font-display text-2xl font-semibold leading-tight">
          {current} {current === 1 ? "day" : "days"} <span className="text-base font-medium text-muted">in a row</span>
        </p>
        <p className="mt-0.5 text-sm text-muted">
          {current === 0
            ? "Log a meal today to start a streak."
            : current >= best
              ? "Your best streak yet. Keep it going!"
              : `Best so far: ${best} days.`}
        </p>
      </div>
    </section>
  );
}

type Insight = { headline: string; wins: string[]; improve: string[]; tip: string };

function Insights() {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [state, setState] = useState<"loading" | "idle" | "busy">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/insights?today=${dayKey()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setInsight(d.insight))
      .catch(() => {})
      .finally(() => setState("idle"));
  }, []);

  async function generate() {
    setState("busy");
    setError(null);
    try {
      const res = await fetch(`/api/insights?today=${dayKey()}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't make insights right now.");
      setInsight(data.insight);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make insights right now.");
    } finally {
      setState("idle");
    }
  }

  return (
    <section aria-labelledby="insights-heading" className="card p-4 shadow-md sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="insights-heading" className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
            <Sparks className="size-5 text-leaf" /> Your week, by your AI coach
          </h2>
          <p className="mt-0.5 text-sm text-muted">Patterns from your last 7 days of meals.</p>
        </div>
        {insight && (
          <button type="button" onClick={generate} disabled={state !== "idle"} className={btn.ghost}>
            {state === "busy" ? <Spinner className="size-4" /> : <Refresh className="size-4" />} Refresh
          </button>
        )}
      </div>

      {state === "loading" ? (
        <div className="mt-4 h-20 animate-pulse rounded-2xl bg-surface-2" aria-hidden="true" />
      ) : insight ? (
        <div className={`mt-4 space-y-4 ${state === "busy" ? "opacity-50" : ""}`}>
          <p className="text-[17px] font-medium leading-snug">{insight.headline}</p>
          <InsightList icon={<ThumbsUp className="size-4" />} tone="text-leaf" title="Going well" items={insight.wins} />
          <InsightList icon={<TriangleFlag className="size-4" />} tone="text-protein" title="Work on" items={insight.improve} />
          <div className="flex gap-3 rounded-2xl bg-leaf-soft p-3.5 text-[15px] text-leaf-strong">
            <LightBulb className="mt-0.5 size-5 shrink-0" />
            <p><b className="font-semibold">Tomorrow:</b> {insight.tip}</p>
          </div>
        </div>
      ) : (
        <button type="button" onClick={generate} disabled={state !== "idle"} className={`${btn.secondary} mt-4 w-full sm:w-auto`}>
          {state === "busy" ? <><Spinner /> Reading your week…</> : <><Sparks className="size-5" /> Get this week&apos;s insights</>}
        </button>
      )}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </section>
  );
}

function InsightList({ icon, tone, title, items }: { icon: React.ReactNode; tone: string; title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className={`mb-1.5 flex items-center gap-1.5 text-sm font-semibold ${tone}`}>
        {icon} {title}
      </p>
      <ul className="space-y-1.5 text-[15px] leading-relaxed">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-line" />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

const WEEKDAYS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

/** 15 weeks of logging at a glance, one square per day, Monday at the top. */
function Calendar({ from, days, target }: { from: string; days: { day: string; calories: number }[]; target: number }) {
  const today = dayKey();
  const kcal = new Map(days.map((d) => [d.day, d.calories]));
  const lead = (parseDay(from).getDay() + 6) % 7; // blanks before the first day so columns start on Monday
  const total = lead + Math.round((parseDay(today).getTime() - parseDay(from).getTime()) / 86_400_000) + 1;
  const cells = Array.from({ length: Math.ceil(total / 7) * 7 }, (_, i) => (i < lead ? null : shiftDay(from, i - lead)));

  return (
    <section aria-labelledby="calendar-heading" className="card p-4 shadow-md sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="calendar-heading" className="font-medium">Logging calendar</h2>
        <div className="flex items-center gap-3 text-xs text-muted">
          <Legend className="bg-surface-2" label="Not logged" />
          <Legend className="bg-leaf" label="On target" />
          <Legend className="bg-protein" label="Over" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="grid grid-rows-7 gap-1 text-[10px] leading-none text-muted">
          {WEEKDAYS.map((w, i) => (
            <span key={i} className="flex h-3.5 items-center sm:h-4">{w}</span>
          ))}
        </div>
        <div className="grid flex-1 grid-flow-col grid-rows-7 justify-start gap-1 overflow-x-auto">
          {cells.map((d, i) => {
            if (!d || d > today) return <span key={i} className="size-3.5 sm:size-4" />;
            const k = kcal.get(d) ?? 0;
            const tone = k === 0 ? "bg-surface-2" : k > target * 1.05 ? "bg-protein" : "bg-leaf";
            const label = `${shortDate(d)}: ${k ? `${fmt(k)} kcal` : "not logged"}`;
            return (
              <Link
                key={d}
                href={d === today ? "/" : `/?date=${d}`}
                title={label}
                aria-label={label}
                className={`size-3.5 rounded-[4px] sm:size-4 ${tone} ${d === today ? "ring-2 ring-ink/40 ring-offset-1 ring-offset-surface" : ""} hover:opacity-75`}
              />
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex justify-between pl-8 text-xs text-muted">
        <span>{shortDate(from)}</span>
        <span>Today</span>
      </div>
    </section>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-3 rounded-[3px] ${className}`} /> {label}
    </span>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="card p-3.5 shadow-sm sm:p-4">
      <p className="text-xs text-muted sm:text-sm">{label}</p>
      <p className="num mt-1 font-display text-xl font-semibold leading-tight sm:text-2xl">
        {value} <span className="text-xs font-medium text-muted sm:text-sm">{unit}</span>
      </p>
    </div>
  );
}
