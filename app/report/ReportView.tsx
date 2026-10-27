"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, Printer } from "iconoir-react";
import { Logo } from "@/components/Logo";
import { Notice, PageHeader, Segmented, btn } from "@/components/ui";
import { dayKey, parseDay, shiftDay, shortDate } from "@/lib/dates";
import { fmt, type Targets, type Totals } from "@/lib/nutrition";

type Day = Totals & { day: string; meals: number };
type Data = { from: string; to: string; days: Day[]; targets: Targets };
type Weight = { day: string; kg: number };

const RANGES = [7, 30, 90] as const;

export function ReportView() {
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const [data, setData] = useState<Data | null>(null);
  const [weights, setWeights] = useState<Weight[]>([]);
  const [me, setMe] = useState<string>("");
  const [error, setError] = useState(false);
  const today = dayKey();
  const from = shiftDay(today, -(range - 1));

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(`/api/history?today=${today}&days=${range}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/api/weights", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { weights: [] })),
      fetch("/api/auth/me", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { username: "" })),
    ])
      .then(([h, w, u]) => {
        if (!alive) return;
        setData(h);
        setWeights(w.weights);
        setMe(u.username);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [range, today]);

  const ready = data && data.from === from ? data : null;

  return (
    <div className="stagger mx-auto max-w-4xl px-4 sm:px-6 lg:px-10 print:max-w-none print:px-0">
      <div className="print:hidden">
        <PageHeader
          title={
            <span className="flex items-center gap-1">
              <Link href="/history" aria-label="Back to history" className="-ml-2 inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink">
                <ArrowLeft className="size-6" />
              </Link>
              Reports & export
            </span>
          }
          sub="Print a summary or save it as PDF, or download your data as spreadsheets."
        />

        <div className="mb-6 flex flex-col gap-4 card p-4 shadow-md sm:p-5">
          <div className="max-w-sm">
            <p className="mb-2 text-sm font-medium">Period</p>
            <Segmented label="Period" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: `${r} days` }))} />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => window.print()} disabled={!ready} className={btn.primary}>
              <Printer className="size-5" /> Print or save as PDF
            </button>
            <a href={`/api/export?type=meals&from=${from}&to=${today}`} className={btn.secondary} download>
              <Download className="size-5" /> Meals (CSV)
            </a>
            <a href={`/api/export?type=weights&from=${from}&to=${today}`} className={btn.secondary} download>
              <Download className="size-5" /> Weights (CSV)
            </a>
          </div>
          <p className="text-xs text-muted">CSV files open in Excel or Google Sheets. In the print window, choose &ldquo;Save as PDF&rdquo; to keep a copy.</p>
        </div>
      </div>

      {error && <Notice tone="error">Couldn&apos;t load your report. Refresh to try again.</Notice>}
      {!ready && !error && <div className="h-96 animate-pulse rounded-3xl bg-surface-2" aria-hidden="true" />}
      {ready && <Report data={ready} weights={weights.filter((w) => w.day >= from)} username={me} />}
    </div>
  );
}

function Report({ data, weights, username }: { data: Data; weights: Weight[]; username: string }) {
  const logged = data.days.filter((d) => d.meals > 0);
  const n = logged.length || 1;
  const avg = (k: keyof Totals) => logged.reduce((s, d) => s + d[k], 0) / n;
  const t = data.targets;
  const onTarget = logged.filter((d) => d.calories <= t.calories * 1.05).length;
  const kgChange = weights.length > 1 ? weights.at(-1)!.kg - weights[0].kg : null;

  return (
    <article className="card p-5 shadow-md sm:p-8 print:rounded-none print:p-0 print:shadow-none">
      <header className="flex items-start justify-between gap-4 border-b border-line pb-5">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Nutrition report</h2>
          <p className="mt-1 text-[15px] text-muted">
            {username && <>{username} · </>}
            {parseDay(data.from).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} –{" "}
            {parseDay(data.to).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Logo className="size-7" /> CalAi
        </span>
      </header>

      <section className="grid grid-cols-2 gap-4 py-5 sm:grid-cols-4">
        <Fact label="Days logged" value={`${logged.length}`} sub={`of ${Math.round((parseDay(data.to).getTime() - parseDay(data.from).getTime()) / 86_400_000) + 1}`} />
        <Fact label="Within target" value={`${onTarget}`} sub={onTarget === 1 ? "day" : "days"} />
        <Fact label="Average intake" value={logged.length ? fmt(avg("calories")) : "–"} sub={`kcal · target ${fmt(t.calories)}`} />
        <Fact
          label="Weight change"
          value={kgChange === null ? "–" : `${kgChange > 0 ? "+" : kgChange < 0 ? "−" : ""}${Math.abs(kgChange).toFixed(1)}`}
          sub={kgChange === null ? "needs 2 weigh-ins" : `kg · now ${weights.at(-1)!.kg.toFixed(1)}`}
        />
      </section>

      <section className="border-t border-line py-5">
        <h3 className="mb-3 font-semibold">Daily averages vs target</h3>
        <table className="num w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1.5 font-medium">Nutrient</th>
              <th className="py-1.5 text-right font-medium">Average</th>
              <th className="py-1.5 text-right font-medium">Target</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Calories", "calories", "kcal"],
                ["Protein", "protein_g", "g"],
                ["Carbs", "carbs_g", "g"],
                ["Fat", "fat_g", "g"],
                ["Fiber", "fiber_g", "g (min)"],
                ["Sugar", "sugar_g", "g (max)"],
                ["Sodium", "sodium_mg", "mg (max)"],
              ] as const
            ).map(([label, k, unit]) => (
              <tr key={k} className="border-t border-line/70">
                <td className="py-2">{label}</td>
                <td className="py-2 text-right font-medium">{logged.length ? fmt(avg(k)) : "–"}</td>
                <td className="py-2 text-right text-muted">{fmt(t[k])} {unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="border-t border-line pt-5">
        <h3 className="mb-3 font-semibold">Day by day</h3>
        {logged.length === 0 ? (
          <p className="text-[15px] text-muted">No meals logged in this period.</p>
        ) : (
          <table className="num w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1.5 font-medium">Date</th>
                <th className="py-1.5 text-right font-medium">Meals</th>
                <th className="py-1.5 text-right font-medium">kcal</th>
                <th className="py-1.5 text-right font-medium">Protein</th>
                <th className="py-1.5 text-right font-medium">Carbs</th>
                <th className="py-1.5 text-right font-medium">Fat</th>
                <th className="hidden py-1.5 text-right font-medium sm:table-cell print:table-cell">Fiber</th>
              </tr>
            </thead>
            <tbody>
              {logged.map((d) => {
                const over = d.calories > t.calories * 1.05;
                return (
                  <tr key={d.day} className="break-inside-avoid border-t border-line/70">
                    <td className="py-2">
                      {shortDate(d.day)}{" "}
                      <span className="text-xs text-muted">{parseDay(d.day).toLocaleDateString("en-IN", { weekday: "short" })}</span>
                    </td>
                    <td className="py-2 text-right text-muted">{d.meals}</td>
                    <td className={`py-2 text-right font-medium ${over ? "text-protein" : ""}`}>{fmt(d.calories)}</td>
                    <td className="py-2 text-right">{fmt(d.protein_g)} g</td>
                    <td className="py-2 text-right">{fmt(d.carbs_g)} g</td>
                    <td className="py-2 text-right">{fmt(d.fat_g)} g</td>
                    <td className="hidden py-2 text-right sm:table-cell print:table-cell">{fmt(d.fiber_g)} g</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <p className="mt-6 text-xs text-muted">
        Calories and nutrients are estimates from photos, descriptions and product labels. Not medical advice.
      </p>
    </article>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="num mt-0.5 font-display text-2xl font-semibold leading-tight">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}
