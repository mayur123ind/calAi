"use client";

import { useEffect, useState } from "react";
import { Sparks } from "iconoir-react";
import { Notice, Spinner } from "@/components/ui";
import { toSaved, type EditItem } from "@/lib/items";
import { fmt, sumItems, type MealType, type Targets, type Totals } from "@/lib/nutrition";

const ROWS = [
  { key: "calories", label: "Calories", unit: "kcal", color: "bg-leaf" },
  { key: "protein_g", label: "Protein", unit: "g", color: "bg-protein" },
  { key: "carbs_g", label: "Carbs", unit: "g", color: "bg-carbs" },
  { key: "fat_g", label: "Fat", unit: "g", color: "bg-fat" },
] as const;

/** Meal What if?: how today changes with this meal, before it's logged, plus an optional AI suggestion. */
export function WhatIf({ day, mealType, items, editingId }: { day: string; mealType: MealType; items: EditItem[]; editingId: number | null }) {
  const [today, setToday] = useState<{ totals: Totals; targets: Targets } | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/day?date=${day}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { totals: Totals; targets: Targets; meals: { id: number; items: Parameters<typeof sumItems>[0] }[] }) => {
        if (!alive) return;
        // When editing, today's totals shouldn't count this meal twice.
        const others = editingId ? d.meals.filter((m) => m.id !== editingId) : d.meals;
        setToday({ totals: sumItems(others.flatMap((m) => m.items)), targets: d.targets });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [day, editingId]);

  const valid = items.filter((i) => i.name.trim());
  const meal = sumItems(valid);

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/whatif", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, meal_type: mealType, items: valid.map(toSaved) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuggestion(data.suggestion);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't get a suggestion right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="group card p-4 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <span className="font-display text-lg font-semibold tracking-tight">What if I eat this?</span>
        <span className="text-sm text-muted group-open:hidden">See today with this meal</span>
      </summary>
      {!today ? (
        <div className="mt-3 h-28 animate-pulse rounded-2xl bg-surface-2" aria-hidden="true" />
      ) : (
        <div className="mt-3 space-y-3">
          {ROWS.map((r) => {
            const before = today.totals[r.key];
            const add = meal[r.key];
            const target = today.targets[r.key] || 1;
            const over = before + add > target;
            return (
              <div key={r.key}>
                <div className="num flex items-baseline justify-between text-sm">
                  <span className="font-medium">{r.label}</span>
                  <span className={over ? "font-semibold text-protein" : "text-muted"}>
                    {fmt(before)} → <b className="text-ink">{fmt(before + add)}</b> / {fmt(target)} {r.unit}
                  </span>
                </div>
                <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className={`${r.color} opacity-45`} style={{ width: `${Math.min(100, (before / target) * 100)}%` }} />
                  <div className={over ? "bg-protein" : r.color} style={{ width: `${Math.max(0, Math.min(100 - (before / target) * 100, (add / target) * 100))}%` }} />
                </div>
              </div>
            );
          })}
          <p className="num text-sm text-muted">
            {today.totals.calories + meal.calories <= today.targets.calories
              ? `${fmt(today.targets.calories - today.totals.calories - meal.calories)} kcal left after this meal.`
              : `${fmt(today.totals.calories + meal.calories - today.targets.calories)} kcal over today's target with this meal.`}
          </p>
          {suggestion ? (
            <Notice>{suggestion}</Notice>
          ) : (
            <button
              type="button"
              onClick={ask}
              disabled={busy || valid.length === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-leaf-soft px-4 text-sm font-semibold text-leaf disabled:opacity-50"
            >
              {busy ? <Spinner className="size-4" /> : <Sparks className="size-4" />} Ask AI for a suggestion
            </button>
          )}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      )}
    </details>
  );
}
