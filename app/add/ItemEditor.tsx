"use client";

import { useId, useState } from "react";
import { Lock, LockSlash, Minus, Plus, WarningCircle, Xmark } from "iconoir-react";
import { IconButton } from "@/components/ui";
import { scaleTo, servings, setNutrient, type EditItem } from "@/lib/items";
import { MICROS, type MicroKey } from "@/lib/nutrients";
import { fmt, fmt1, type Nutrient } from "@/lib/nutrition";

const DETAIL: { key: Nutrient; label: string }[] = [
  { key: "fiber_g", label: "Fiber g" },
  { key: "sugar_g", label: "Sugar g" },
  { key: "sodium_mg", label: "Sodium mg" },
];

export function ItemEditor({
  item,
  onChange,
  onRemove,
}: {
  item: EditItem;
  onChange: (next: EditItem) => void;
  onRemove: () => void;
}) {
  const count = servings(item);
  const step = count !== null && count < 2 ? 0.25 : 0.5;
  const setCount = (n: number) => onChange(scaleTo(item, Math.max(0, n) * item.unit_grams!));
  const nutrient = (field: Nutrient | MicroKey) => (v: number) => onChange(setNutrient(item, field, v));
  const knownMicros = MICROS.filter((m) => typeof item.micros?.[m.key] === "number");

  return (
    <li className="card p-3 shadow-sm sm:p-4">
      <div className="flex items-center gap-2">
        <input
          aria-label="Food name"
          value={item.name}
          onChange={(e) => onChange({ ...item, name: e.target.value })}
          placeholder="Food name"
          maxLength={120}
          className="h-10 min-w-0 flex-1 rounded-lg bg-transparent px-1 text-base font-medium placeholder:text-muted/70 focus:bg-surface-2 focus:outline-none"
        />
        {item.confidence === "low" && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-carbs/15 px-2 py-1 text-xs font-medium text-carbs">
            <WarningCircle className="size-3.5" /> Check
          </span>
        )}
        <IconButton label={`Remove ${item.name || "item"}`} onClick={onRemove} className="size-9 shrink-0">
          <Xmark className="size-5" />
        </IconButton>
      </div>

      {/* Serving: a unit stepper when the food has a natural unit, grams always. Locked while nutrients are unlocked. */}
      <div className={`mt-2 flex flex-wrap items-stretch gap-2 ${item.locked ? "" : "opacity-60"}`}>
        {count !== null && (
          <div className="flex items-center gap-1 rounded-xl bg-surface-2 px-1.5 py-1">
            <IconButton label={`One ${item.unit} less`} disabled={!item.locked || count <= step} onClick={() => setCount(count - step)} className="size-9">
              <Minus className="size-4" />
            </IconButton>
            <span className="num min-w-16 text-center text-base font-semibold">
              {fmt1(count)} <span className="text-sm font-normal text-muted">{item.unit}</span>
            </span>
            <IconButton label={`One ${item.unit} more`} disabled={!item.locked} onClick={() => setCount(count + step)} className="size-9">
              <Plus className="size-4" />
            </IconButton>
          </div>
        )}
        <div className="w-28">
          <NumField label="Grams" value={item.grams} onValue={(g) => onChange(scaleTo(item, g))} strong disabled={!item.locked} />
        </div>
        {count !== null && (
          <p className="num self-center text-xs text-muted">
            1 {item.unit} ≈ {fmt1(item.unit_grams!)} g
          </p>
        )}
      </div>

      {item.locked ? (
        <div className="mt-2 flex items-center gap-2">
          <p className="num flex flex-1 flex-wrap gap-x-3 gap-y-1 rounded-xl bg-surface-2/60 px-3 py-2 text-sm">
            <b className="font-semibold">{fmt(item.calories)} kcal</b>
            <span><b className="font-semibold text-protein">P</b> {fmt1(item.protein_g)}g</span>
            <span><b className="font-semibold text-carbs">C</b> {fmt1(item.carbs_g)}g</span>
            <span><b className="font-semibold text-fat">F</b> {fmt1(item.fat_g)}g</span>
          </p>
          <button
            type="button"
            onClick={() => onChange({ ...item, locked: false })}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-line px-3 text-sm font-medium text-muted hover:text-ink"
          >
            <LockSlash className="size-4" /> Unlock
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <NumField label="kcal" value={item.calories} onValue={nutrient("calories")} strong />
            <NumField label="Protein g" value={item.protein_g} onValue={nutrient("protein_g")} dot="bg-protein" />
            <NumField label="Carbs g" value={item.carbs_g} onValue={nutrient("carbs_g")} dot="bg-carbs" />
            <NumField label="Fat g" value={item.fat_g} onValue={nutrient("fat_g")} dot="bg-fat" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {DETAIL.map((d) => (
              <NumField key={d.key} label={d.label} value={item[d.key]} onValue={nutrient(d.key)} />
            ))}
          </div>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1 px-1 py-1 text-xs font-medium text-muted hover:text-ink">
              <Plus className="size-3.5 transition-transform group-open:rotate-45" /> Detailed nutrients
            </summary>
            <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MICROS.map((m) => (
                <NumField
                  key={m.key}
                  label={`${m.label} ${m.unit}`}
                  value={item.micros?.[m.key] ?? 0}
                  onValue={nutrient(m.key)}
                  decimals={2}
                />
              ))}
            </div>
          </details>
          <button
            type="button"
            onClick={() => onChange({ ...item, locked: true })}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold text-paper"
          >
            <Lock className="size-4" /> Lock nutrition
          </button>
          <p className="text-xs text-muted">Lock again to change the serving; it will scale from your numbers.</p>
        </div>
      )}

      {item.locked && (
        <details className="group mt-1">
          <summary className="num flex cursor-pointer list-none items-center gap-1 rounded-lg px-1 py-1 text-xs text-muted hover:text-ink">
            <Plus className="size-3.5 transition-transform group-open:rotate-45" />
            Fiber {fmt1(item.fiber_g)} g · Sugar {fmt1(item.sugar_g)} g · Sodium {fmt(item.sodium_mg)} mg
            {knownMicros.length > 0 && ` · ${knownMicros.length} more`}
          </summary>
          {knownMicros.length > 0 && (
            <dl className="num mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 px-1 text-xs text-muted sm:grid-cols-3">
              {knownMicros.map((m) => (
                <div key={m.key} className="flex justify-between gap-2">
                  <dt>{m.label}</dt>
                  <dd className="text-ink">
                    {fmt1(item.micros![m.key]!)} {m.unit}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </details>
      )}
    </li>
  );
}

const show = (v: number, decimals: number) => String(Math.round(v * 10 ** decimals) / 10 ** decimals);

/** Text input for numbers: keeps what you type while focused, shows the rounded value otherwise. */
export function NumField({
  label,
  value,
  onValue,
  strong,
  dot,
  disabled,
  decimals = 1,
}: {
  label: string;
  value: number;
  onValue: (v: number) => void;
  strong?: boolean;
  dot?: string;
  disabled?: boolean;
  decimals?: number;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const pattern = new RegExp(`^\\d{0,6}(\\.\\d{0,${decimals}})?$`);
  return (
    <div className="rounded-xl bg-surface-2 px-2.5 pb-1.5 pt-1 focus-within:ring-2 focus-within:ring-leaf/30">
      <label htmlFor={id} className="flex items-center gap-1.5 truncate text-[11px] font-medium text-muted">
        {dot && <span className={`size-1.5 shrink-0 rounded-full ${dot}`} />}
        {label}
      </label>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        value={draft ?? show(value, decimals)}
        onFocus={(e) => {
          setDraft(show(value, decimals));
          e.target.select();
        }}
        onBlur={() => setDraft(null)}
        onChange={(e) => {
          const t = e.target.value.replace(",", ".");
          if (!pattern.test(t)) return;
          setDraft(t);
          onValue(t === "" || t === "." ? 0 : Number(t));
        }}
        className={`num w-full bg-transparent text-base focus:outline-none disabled:cursor-not-allowed ${strong ? "font-semibold" : ""}`}
      />
    </div>
  );
}
