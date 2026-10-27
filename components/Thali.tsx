"use client";

import { useEffect, useState } from "react";
import { fmt, fmt1, type Targets, type Totals } from "@/lib/nutrition";
import { CountUp } from "./motion";

/** Animate from 0 on first paint so the rings fill once when the day loads. */
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setM(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return m;
}

function Arc({
  r,
  width,
  value,
  color,
  mounted,
  glow = 0,
}: {
  r: number;
  width: number;
  value: number;
  color: string;
  mounted: boolean;
  glow?: number;
}) {
  const c = 2 * Math.PI * r;
  const v = Math.min(Math.max(value, 0), 1);
  return (
    <circle
      r={r}
      cx="0"
      cy="0"
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={c}
      strokeDashoffset={mounted ? c * (1 - v) : c}
      transform="rotate(-90)"
      className="ring-progress"
      opacity={v === 0 ? 0 : 1}
      style={glow ? { filter: `drop-shadow(0 0 ${glow}px ${color})` } : undefined}
    />
  );
}

/** The day as a steel thali: the plate ring is calories eaten against the target. */
export function Thali({ totals, targets }: { totals: Totals; targets: Targets }) {
  const mounted = useMounted();
  const eaten = totals.calories;
  const left = targets.calories - eaten;
  const over = left < 0;
  const ratio = targets.calories > 0 ? eaten / targets.calories : 0;
  const color = over ? "var(--protein)" : "var(--leaf)";

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[300px]">
      {/* Halo behind the plate, breathing slowly so the hold never feels dead. */}
      <div
        aria-hidden="true"
        className="absolute inset-[8%] rounded-full opacity-60 blur-2xl [animation:float_8s_ease-in-out_infinite]"
        style={{ background: `radial-gradient(circle, ${color} 0%, transparent 70%)` }}
      />
      <svg
        viewBox="-120 -120 240 240"
        className="relative size-full"
        role="img"
        aria-label={`${fmt(eaten)} of ${fmt(targets.calories)} calories eaten, ${fmt(Math.abs(left))} ${over ? "over" : "left"}`}
      >
        <defs>
          <radialGradient id="steel" cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="var(--steel-hi)" />
            <stop offset="100%" stopColor="var(--steel-lo)" />
          </radialGradient>
        </defs>
        {/* Plate rim and well */}
        <circle r="118" fill="url(#steel)" />
        <circle r="104" fill="var(--surface)" />
        <circle r="104" fill="none" stroke="var(--line)" strokeWidth="1" />
        {/* Tick marks around the rim, like a dial */}
        {Array.from({ length: 60 }, (_, i) => (
          <line
            key={i}
            x1="0"
            y1={-111}
            x2="0"
            y2={i % 5 === 0 ? -106 : -108}
            stroke="var(--muted)"
            strokeOpacity={i % 5 === 0 ? 0.6 : 0.25}
            strokeWidth="1"
            transform={`rotate(${i * 6})`}
          />
        ))}
        {/* Calorie track and progress */}
        <circle r="90" fill="none" stroke="var(--surface-2)" strokeWidth="14" />
        <Arc r={90} width={14} value={over ? 1 : ratio} color={color} mounted={mounted} glow={6} />
      </svg>
      <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="eyebrow">{over ? "Over by" : "Left today"}</span>
        <span className="num mt-1 font-display text-[64px] font-extrabold leading-none tracking-[-0.05em] [font-stretch:80%] sm:text-[72px]">
          <CountUp value={Math.abs(left)} />
        </span>
        <span className={`mt-1 text-sm font-semibold ${over ? "text-protein" : "text-leaf-strong"}`}>kcal</span>
        <span className="num mt-3 rounded-full bg-surface-2 px-3 py-1 text-xs text-muted">
          {fmt(eaten)} / {fmt(targets.calories)} eaten
        </span>
      </div>
    </div>
  );
}

const CARD_COLORS: Record<string, string> = {
  protein_g: "var(--protein)",
  carbs_g: "var(--carbs)",
  fat_g: "var(--fat)",
  fiber_g: "var(--leaf)",
  sugar_g: "var(--carbs)",
  sodium_mg: "var(--water)",
};
const OTHER_COLORS = ["var(--leaf)", "var(--water)", "var(--fat)", "var(--protein)"];

export type NutrientCard = { key: string; label: string; unit: string; value: number; goal: number | null; kind: string };

/** Three katoris beside the thali: one small bowl per chosen nutrient (protein, carbs and fat by default). */
export function Katoris({ cards }: { cards: NutrientCard[] }) {
  const mounted = useMounted();
  return (
    <div className="stagger grid grid-cols-3 gap-3">
      {cards.map(({ key, label, unit, value, goal, kind }, i) => {
        const color = CARD_COLORS[key] ?? OTHER_COLORS[i % OTHER_COLORS.length];
        const over = kind === "limit" && goal !== null && value > goal;
        return (
          <div key={key} className="flex flex-col items-center text-center">
            <div className="relative size-[80px] transition-transform duration-500 ease-spring hover:scale-110">
              <svg viewBox="-40 -40 80 80" className="size-full" aria-hidden="true">
                <defs>
                  <radialGradient id={`steel-${key}`} cx="35%" cy="30%" r="80%">
                    <stop offset="0%" stopColor="var(--steel-hi)" />
                    <stop offset="100%" stopColor="var(--steel-lo)" />
                  </radialGradient>
                </defs>
                <circle r="38" fill={`url(#steel-${key})`} />
                <circle r="31" fill="var(--surface)" />
                <circle r="25" fill="none" stroke="var(--surface-2)" strokeWidth="7" />
                <Arc r={25} width={7} value={goal ? value / goal : 0} color={over ? "var(--protein)" : color} mounted={mounted} glow={3} />
              </svg>
              <span aria-hidden="true" className="num absolute inset-0 flex items-center justify-center font-display text-lg font-bold tracking-tight">
                <CountUp value={value} decimals={value < 10 && value % 1 ? 1 : 0} />
              </span>
            </div>
            <span className="mt-2 flex max-w-full items-center gap-1.5 truncate text-sm font-semibold">
              <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
              {label}
            </span>
            <span className="num text-xs text-muted">
              <span className="sr-only">{fmt1(value)} </span>
              {goal === null ? unit : `${kind === "limit" ? "max" : "of"} ${fmt1(goal)} ${unit}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
