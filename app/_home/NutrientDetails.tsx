"use client";

import Link from "next/link";
import { useState } from "react";
import { NavArrowDown } from "iconoir-react";
import { MICROS, type MicroKey, type Micros } from "@/lib/nutrients";
import { fmt, fmt1, type Targets, type Totals } from "@/lib/nutrition";

const EXTRAS = [
  { key: "fiber_g", label: "Fiber", unit: "g", kind: "goal" },
  { key: "sugar_g", label: "Sugar", unit: "g", kind: "limit" },
  { key: "sodium_mg", label: "Sodium", unit: "mg", kind: "limit" },
] as const;

function Bar({ label, value, goal, unit, kind }: { label: string; value: number; goal: number | null; unit: string; kind: string }) {
  const over = kind === "limit" && goal !== null && value > goal;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <dt className="font-medium">
          {label}{" "}
          {goal !== null && <span className="text-xs font-normal text-muted">{kind === "goal" ? "aim for" : "limit"}</span>}
        </dt>
        <dd className={`num ${over ? "font-semibold text-protein" : "text-muted"}`}>
          {fmt1(value)}
          {goal !== null ? ` / ${fmt1(goal)}` : ""} {unit}
        </dd>
      </div>
      {goal !== null && (
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full origin-left rounded-full transition-[width] duration-1000 ease-out-expo ${
              over ? "bg-protein" : kind === "goal" ? "bg-gradient-to-r from-leaf to-lime" : "bg-muted/60"
            }`}
            style={{ width: `${Math.min(100, goal ? (value / goal) * 100 : 0)}%` }}
          />
        </div>
      )}
    </div>
  );
}

/** Fiber, sugar and sodium, then every detailed nutrient behind "View more". */
export function NutrientDetails({
  totals,
  targets,
  micros,
  known,
  goals,
}: {
  totals: Totals;
  targets: Targets;
  micros: Micros;
  known: MicroKey[];
  goals: Record<string, number | null>;
}) {
  const [more, setMore] = useState(false);
  return (
    <div className="mt-6 border-t border-line/80 pt-5">
      <dl className="space-y-3">
        {EXTRAS.map((e) => (
          <Bar key={e.key} label={e.label} value={totals[e.key]} goal={targets[e.key]} unit={e.unit} kind={e.kind} />
        ))}
      </dl>
      <button
        type="button"
        onClick={() => setMore((m) => !m)}
        aria-expanded={more}
        className="mt-4 flex w-full items-center justify-center gap-1 rounded-full py-2 text-sm font-semibold text-leaf-strong hover:bg-surface-2/60"
      >
        {more ? "Show less" : "View more nutrients"}
        <NavArrowDown className={`size-4 transition-transform ${more ? "rotate-180" : ""}`} />
      </button>
      {more && (
        <div className="animate-rise">
          {known.length === 0 ? (
            <p className="py-2 text-sm text-muted">
              No detailed nutrients logged yet. Meals estimated by AI and many barcodes include them.
            </p>
          ) : (
            <dl className="mt-2 space-y-3">
              {MICROS.filter((m) => known.includes(m.key)).map((m) => (
                <Bar key={m.key} label={m.label} value={micros[m.key] ?? 0} goal={m.kind === "info" ? null : goals[m.key]} unit={m.unit} kind={m.kind} />
              ))}
            </dl>
          )}
          <p className="mt-3 text-xs text-muted">
            Totals count only foods with that nutrient known. {fmt(totals.calories)} kcal logged.{" "}
            <Link href="/goals#nutrients" className="font-medium text-leaf underline-offset-2 hover:underline">
              Nutrient goals
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
