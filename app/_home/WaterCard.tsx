"use client";

import { useState, type FormEvent } from "react";
import { Droplet, Minus } from "iconoir-react";
import { IconButton } from "@/components/ui";
import { fmt } from "@/lib/nutrition";

/** Optional water tracking: quick-log one to three glasses, or any amount. */
export function WaterCard({ day, initial, goal, glassMl }: { day: string; initial: number; goal: number; glassMl: number }) {
  const [ml, setMl] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [custom, setCustom] = useState("");

  async function set(next: number) {
    const prev = ml;
    const value = Math.max(0, Math.min(10_000, Math.round(next)));
    setMl(value);
    setFailed(false);
    const res = await fetch("/api/water", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day, ml: value }),
    }).catch(() => null);
    if (!res?.ok) {
      setMl(prev);
      setFailed(true);
    }
  }

  function addCustom(e: FormEvent) {
    e.preventDefault();
    const n = Number(custom.replace(",", "."));
    if (n > 0 && n <= 3000) {
      void set(ml + n);
      setCustom("");
    }
  }

  const level = goal > 0 ? Math.min(1, ml / goal) : 0;

  return (
    <section aria-labelledby="water-heading" className="card flex gap-4 p-4 shadow-sm sm:p-5">
      {/* The tank: two waves keep rolling on top of the water level. */}
      <div aria-hidden="true" className="relative w-[64px] shrink-0 overflow-hidden rounded-[20px] border border-line/80 bg-surface-2">
        <div className="absolute inset-x-0 bottom-0 transition-[height] duration-1000 ease-spring" style={{ height: `${Math.max(level * 100, 6)}%` }}>
          <svg viewBox="0 0 200 20" preserveAspectRatio="none" className="wave-slow absolute -top-3 left-0 h-4 w-[200%] fill-water/40">
            <path d="M0 10 Q 25 0 50 10 T 100 10 T 150 10 T 200 10 V20 H0Z" />
          </svg>
          <svg viewBox="0 0 200 20" preserveAspectRatio="none" className="wave absolute -top-2.5 left-0 h-3.5 w-[200%] fill-water/80">
            <path d="M0 10 Q 25 2 50 10 T 100 10 T 150 10 T 200 10 V20 H0Z" />
          </svg>
          <div className="size-full bg-gradient-to-b from-water/80 to-water" />
        </div>
        <span className={`absolute inset-x-0 top-2 text-center font-display text-sm font-bold ${level > 0.8 ? "text-white" : "text-ink"}`}>
          {Math.round(level * 100)}%
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h2 id="water-heading" className="flex items-center gap-1.5 font-display text-lg font-bold tracking-tight">
            <Droplet className="size-5 text-water" /> Water
          </h2>
          <p className="num text-sm text-muted">
            <b className="font-display text-base font-bold text-ink">{fmt(ml)}</b> / {fmt(goal)} ml
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => set(ml + n * glassMl)}
              className="h-9 rounded-full bg-water/15 px-3 text-sm font-semibold text-water transition-transform active:scale-95"
            >
              +{n} {n === 1 ? "glass" : "glasses"}
            </button>
          ))}
          <IconButton label={`Remove a glass (${glassMl} ml)`} onClick={() => set(ml - glassMl)} disabled={ml <= 0} className="size-9 border border-line">
            <Minus className="size-4" />
          </IconButton>
        </div>
        <form onSubmit={addCustom} className="mt-2 flex items-center gap-2">
          <label className="sr-only" htmlFor={`water-${day}`}>Custom amount in ml</label>
          <input
            id={`water-${day}`}
            inputMode="numeric"
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
            placeholder="Custom ml"
            className="h-9 w-28 rounded-full border border-line bg-surface px-3 text-sm focus:border-water focus:outline-none"
          />
          <button type="submit" disabled={!custom} className="h-9 rounded-full px-3 text-sm font-semibold text-water disabled:opacity-40">
            Add
          </button>
          <span className="text-xs text-muted">1 glass = {glassMl} ml</span>
        </form>
        {failed && <p className="mt-2 text-sm text-danger">Couldn&apos;t save. Try again.</p>}
      </div>
    </section>
  );
}
