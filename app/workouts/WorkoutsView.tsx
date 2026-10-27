"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Copy, FireFlame, Gym, NavArrowLeft, NavArrowRight, Plus, Search, Trash, Xmark } from "iconoir-react";
import { IconButton, Notice, PageHeader, Segmented, Spinner, btn, input } from "@/components/ui";
import { dayKey, dayTitle, parseDay, shiftDay, shortDate } from "@/lib/dates";
import { fmt } from "@/lib/nutrition";

type SetRow = { reps: number | null; weight_kg: number | null; rpe: number | null; minutes: number | null; done: boolean };
type Entry = { id: number; day: string; exercise_id: string; note: string | null; sets: SetRow[]; name: string; category: string; timed: boolean; thumb: string | null };
type BurnDetails = { weightKg: number; lines: { exercise: string; sets: number; minutes: number; kcal: number }[] };
type Diary = { entries: Entry[]; burns: { day: string; kcal: number; details: BurnDetails }[] };
type ListItem = { id: string; name: string; level: string; equipment: string; category: string; primary: string[]; thumb: string | null };
type Detail = ListItem & { secondary: string[]; instructions: string[]; mechanic: string | null; force: string | null; timed: boolean; photos: string[] };

const VIEW_KEY = "calai-workouts-view";
const noSubscribe = () => () => {};
const readView = (): "diary" | "library" => {
  try {
    return localStorage.getItem(VIEW_KEY) === "library" ? "library" : "diary";
  } catch {
    return "diary";
  }
};

export function WorkoutsView() {
  const stored = useSyncExternalStore(noSubscribe, readView, () => "diary" as const);
  const [chosen, setView] = useState<"diary" | "library" | null>(null);
  const view = chosen ?? stored;
  const [day, setDay] = useState(dayKey());
  const [detail, setDetail] = useState<string | null>(null);

  // The last view (diary or library) is remembered on this device.
  const switchView = (v: "diary" | "library") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // storage blocked: fine, it just won't be remembered
    }
  };

  return (
    <div className="stagger mx-auto max-w-4xl px-4 sm:px-6 lg:px-10">
      <PageHeader title="Workouts" sub="Plan exercises by day, log sets, reps, weight and effort, and see what you burned." />
      <div className="mb-5 max-w-sm">
        <Segmented
          label="Workouts view"
          value={view}
          onChange={switchView}
          options={[
            { value: "diary", label: "Diary" },
            { value: "library", label: "Exercise library" },
          ]}
        />
      </div>
      {view === "diary" ? (
        <DiaryView day={day} setDay={setDay} onBrowse={() => switchView("library")} onDetail={setDetail} />
      ) : (
        <Library onOpen={setDetail} />
      )}
      {detail && (
        <ExerciseSheet
          id={detail}
          day={day}
          onClose={() => setDetail(null)}
          onAdded={() => {
            setDetail(null);
            switchView("diary");
          }}
        />
      )}
    </div>
  );
}

function weekOf(day: string) {
  const back = (parseDay(day).getDay() + 6) % 7; // weeks start Monday here
  const start = shiftDay(day, -back);
  return Array.from({ length: 7 }, (_, i) => shiftDay(start, i));
}

function DiaryView({ day, setDay, onBrowse, onDetail }: { day: string; setDay: (d: string) => void; onBrowse: () => void; onDetail: (id: string) => void }) {
  const week = weekOf(day);
  const [data, setData] = useState<Diary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [burning, setBurning] = useState(false);
  const swipe = useRef<number | null>(null);

  const load = useCallback(() => {
    fetch(`/api/workouts?from=${week[0]}&to=${week[6]}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError("Couldn't load your workouts."));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the week changes, not every render
  }, [week[0]]);
  useEffect(load, [load]);

  const entries = data?.entries.filter((e) => e.day === day) ?? [];
  const burn = data?.burns.find((b) => b.day === day);
  const lastWeek = shiftDay(day, -7);

  async function copyLastWeek() {
    setError(null);
    const res = await fetch("/api/workouts/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromDay: lastWeek, toDay: day }),
    }).catch(() => null);
    if (res?.ok) load();
    else setError((await res?.json().catch(() => null))?.error ?? "Couldn't copy last week.");
  }

  async function calculate() {
    setBurning(true);
    setError(null);
    const res = await fetch("/api/workouts/burn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day }),
    }).catch(() => null);
    setBurning(false);
    if (res?.ok) load();
    else setError((await res?.json().catch(() => null))?.error ?? "Couldn't calculate the burn.");
  }

  return (
    <div className="space-y-4">
      <div
        className="flex touch-pan-y items-center gap-1"
        onPointerDown={(e) => (swipe.current = e.clientX)}
        onPointerUp={(e) => {
          if (swipe.current === null) return;
          const dx = e.clientX - swipe.current;
          swipe.current = null;
          if (Math.abs(dx) > 50) setDay(shiftDay(day, dx > 0 ? -7 : 7));
        }}
      >
        <IconButton label="Previous week" onClick={() => setDay(shiftDay(day, -7))} className="size-9">
          <NavArrowLeft className="size-5" />
        </IconButton>
        <ol className="grid flex-1 grid-cols-7 gap-1">
          {week.map((d) => {
            const has = data?.entries.some((e) => e.day === d);
            const selected = d === day;
            return (
              <li key={d}>
                <button
                  type="button"
                  onClick={() => setDay(d)}
                  aria-current={selected ? "date" : undefined}
                  className={`flex w-full flex-col items-center gap-0.5 rounded-2xl py-2 ${selected ? "bg-ink text-paper" : "hover:bg-surface-2"}`}
                >
                  <span className={`text-[11px] ${selected ? "text-paper/70" : "text-muted"}`}>{parseDay(d).toLocaleDateString("en-IN", { weekday: "narrow" })}</span>
                  <span className="num text-sm font-semibold">{parseDay(d).getDate()}</span>
                  <span className={`size-1.5 rounded-full ${has ? (selected ? "bg-lime" : "bg-protein") : "bg-transparent"}`} />
                </button>
              </li>
            );
          })}
        </ol>
        <IconButton label="Next week" onClick={() => setDay(shiftDay(day, 7))} className="size-9">
          <NavArrowRight className="size-5" />
        </IconButton>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-bold tracking-tight">{dayTitle(day)}</h2>
        <div className="flex gap-2">
          <button type="button" onClick={copyLastWeek} className={`${btn.ghost}`} title={`Copy ${shortDate(lastWeek)}`}>
            <Copy className="size-4" /> Same as last week
          </button>
          <button type="button" onClick={onBrowse} className={`${btn.secondary} h-10 px-4 text-sm`}>
            <Plus className="size-4" /> Add exercise
          </button>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {!data ? (
        <div className="h-40 animate-pulse rounded-3xl bg-surface-2" aria-hidden="true" />
      ) : entries.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <span className="flex size-16 items-center justify-center rounded-3xl bg-protein/15 text-protein">
            <Gym className="size-8" />
          </span>
          <p className="mt-4 font-display text-xl font-bold">Nothing planned</p>
          <p className="mt-1 max-w-xs text-[15px] text-muted">Add exercises from the library. You can log sets any time, no timer needed.</p>
          <button type="button" onClick={onBrowse} className={`${btn.primary} mt-5`}>
            <Search className="size-5" /> Browse exercises
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <EntryCard key={e.id} entry={e} onDetail={() => onDetail(e.exercise_id)} onDeleted={load} />
          ))}
        </ul>
      )}

      {entries.length > 0 && (
        <section className="card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <FireFlame className="size-6 shrink-0 text-protein" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold">{burn ? `${fmt(burn.kcal)} kcal burned` : "Workout burn"}</p>
              <p className="text-sm text-muted">
                {burn
                  ? `Extra calories above resting, at ${burn.details.weightKg} kg. Saved to Progress.`
                  : "Tick the sets you finished, then calculate. Estimated from effort and time."}
              </p>
            </div>
            <button type="button" onClick={calculate} disabled={burning} className="h-10 shrink-0 rounded-full bg-protein px-4 text-sm font-semibold text-white disabled:opacity-60">
              {burning ? <Spinner className="size-4" /> : burn ? "Recalculate" : "Calculate"}
            </button>
          </div>
          {burn && (
            <ul className="num mt-3 space-y-1 border-t border-line pt-3 text-sm">
              {burn.details.lines.map((l) => (
                <li key={l.exercise} className="flex justify-between gap-3 text-muted">
                  <span className="truncate">
                    {l.exercise} · {l.sets} sets · {l.minutes} min
                  </span>
                  <span className="font-medium text-ink">{fmt(l.kcal)} kcal</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** One exercise on the day: its sets, editable inline; saved a moment after each change. */
function EntryCard({ entry, onDetail, onDeleted }: { entry: Entry; onDetail: () => void; onDeleted: () => void }) {
  const [sets, setSets] = useState<SetRow[]>(entry.sets);
  const [note, setNote] = useState(entry.note ?? "");
  const [state, setState] = useState<"saved" | "saving" | "error">("saved");
  const [confirm, setConfirm] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function persist(nextSets: SetRow[], nextNote: string) {
    if (timer.current) clearTimeout(timer.current);
    setState("saving");
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/workouts/${entry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: nextNote.trim() || null, sets: nextSets }),
      }).catch(() => null);
      setState(res?.ok ? "saved" : "error");
    }, 600);
  }

  const update = (i: number, patch: Partial<SetRow>) => {
    const next = sets.map((s, j) => (j === i ? { ...s, ...patch } : s));
    setSets(next);
    persist(next, note);
  };
  const num = (v: string, max: number) => {
    const n = Number(v.replace(",", "."));
    return v === "" || !Number.isFinite(n) ? null : Math.min(max, Math.max(0, n));
  };

  return (
    <li className="card p-3 shadow-sm sm:p-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onDetail} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          {entry.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.thumb} alt="" loading="lazy" className="size-12 shrink-0 rounded-xl bg-white object-cover" />
          ) : (
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-2"><Gym className="size-6" /></span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-medium">{entry.name}</span>
            <span className="block text-xs capitalize text-muted">{entry.category}</span>
          </span>
        </button>
        <span className="text-xs text-muted" aria-live="polite">
          {state === "saving" ? "Saving…" : state === "error" ? <span className="text-danger">Not saved</span> : ""}
        </span>
        {confirm ? (
          <button
            type="button"
            onClick={async () => {
              const res = await fetch(`/api/workouts/${entry.id}`, { method: "DELETE" }).catch(() => null);
              if (res?.ok) onDeleted();
            }}
            className="h-9 rounded-full bg-danger px-3 text-sm font-semibold text-white"
          >
            Remove
          </button>
        ) : (
          <IconButton label={`Remove ${entry.name}`} onClick={() => setConfirm(true)} className="size-9 hover:text-danger">
            <Trash className="size-[18px]" />
          </IconButton>
        )}
      </div>

      <table className="num mt-3 w-full text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="w-8 py-1 font-medium">Set</th>
            {entry.timed ? (
              <th className="py-1 font-medium">Minutes</th>
            ) : (
              <>
                <th className="py-1 font-medium">Reps</th>
                <th className="py-1 font-medium">kg</th>
              </>
            )}
            <th className="py-1 font-medium">RPE</th>
            <th className="w-10 py-1 text-center font-medium">Done</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {sets.map((s, i) => (
            <tr key={i}>
              <td className="py-1 text-muted">{i + 1}</td>
              {entry.timed ? (
                <td className="py-1 pr-2">
                  <CellInput label={`Set ${i + 1} minutes`} value={s.minutes} onChange={(v) => update(i, { minutes: num(v, 600) })} />
                </td>
              ) : (
                <>
                  <td className="py-1 pr-2">
                    <CellInput label={`Set ${i + 1} reps`} value={s.reps} onChange={(v) => update(i, { reps: num(v, 1000) === null ? null : Math.round(num(v, 1000)!) })} />
                  </td>
                  <td className="py-1 pr-2">
                    <CellInput label={`Set ${i + 1} weight`} value={s.weight_kg} onChange={(v) => update(i, { weight_kg: num(v, 1000) })} />
                  </td>
                </>
              )}
              <td className="py-1 pr-2">
                <select
                  aria-label={`Set ${i + 1} effort (RPE)`}
                  value={s.rpe ?? ""}
                  onChange={(e) => update(i, { rpe: e.target.value ? Number(e.target.value) : null })}
                  className="h-9 w-full rounded-lg border border-line bg-surface px-1"
                >
                  <option value="">–</option>
                  {[5, 6, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-1 text-center">
                <button
                  type="button"
                  aria-pressed={s.done}
                  aria-label={`Set ${i + 1} done`}
                  onClick={() => update(i, { done: !s.done })}
                  className={`inline-flex size-8 items-center justify-center rounded-full border-2 ${s.done ? "border-leaf bg-leaf text-on-leaf" : "border-line"}`}
                >
                  {s.done && <Check className="size-4" strokeWidth={3} />}
                </button>
              </td>
              <td className="py-1 text-right">
                <IconButton
                  label={`Delete set ${i + 1}`}
                  onClick={() => {
                    const next = sets.filter((_, j) => j !== i);
                    setSets(next);
                    persist(next, note);
                  }}
                  disabled={sets.length <= 1}
                  className="size-8"
                >
                  <Xmark className="size-4" />
                </IconButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            // A new set copies the last one, which is usually what you do next.
            const last = sets.at(-1);
            const next = [...sets, { reps: last?.reps ?? null, weight_kg: last?.weight_kg ?? null, rpe: null, minutes: last?.minutes ?? null, done: false }];
            setSets(next);
            persist(next, note);
          }}
          disabled={sets.length >= 30}
          className={`${btn.ghost} text-leaf`}
        >
          <Plus className="size-4" /> Add set
        </button>
        <input
          aria-label="Note"
          value={note}
          maxLength={300}
          onChange={(e) => {
            setNote(e.target.value);
            persist(sets, e.target.value);
          }}
          placeholder="Note"
          className="h-9 min-w-0 flex-1 rounded-full border border-line bg-surface px-3 text-sm focus:border-leaf focus:outline-none"
        />
      </div>
    </li>
  );
}

function CellInput({ label, value, onChange }: { label: string; value: number | null; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={draft ?? (value === null ? "" : String(value))}
      onFocus={() => setDraft(value === null ? "" : String(value))}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        if (!/^\d{0,4}([.,]\d{0,2})?$/.test(e.target.value)) return;
        setDraft(e.target.value);
        onChange(e.target.value);
      }}
      className="h-9 w-full rounded-lg border border-line bg-surface px-2 focus:border-leaf focus:outline-none"
    />
  );
}

const label = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Search and filter the 876-exercise library; tap one for its photos and instructions. */
function Library({ onOpen }: { onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");
  const [equipment, setEquipment] = useState("");
  const [sort, setSort] = useState<"name" | "level">("name");
  const [result, setResult] = useState<{ total: number; filters: { muscles: string[]; equipment: string[] }; exercises: ListItem[] } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const params = useCallback(
    (offset: number) => new URLSearchParams({ q, primary, secondary, equipment, sort, offset: String(offset) }).toString(),
    [q, primary, secondary, equipment, sort],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/exercises?${params(0)}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setResult(d));
    }, 200);
    return () => clearTimeout(t);
  }, [params]);

  async function more() {
    if (!result) return;
    setLoadingMore(true);
    const d = await fetch(`/api/exercises?${params(result.exercises.length)}`).then((r) => (r.ok ? r.json() : null));
    setLoadingMore(false);
    if (d) setResult({ ...result, exercises: [...result.exercises, ...d.exercises] });
  }

  const select = (value: string, set: (v: string) => void, options: string[], placeholder: string) => (
    <select aria-label={placeholder} value={value} onChange={(e) => set(e.target.value)} className={`${input} h-11 px-3 text-sm`}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {label(o)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-3">
      <label className="flex h-12 items-center gap-2 rounded-2xl border border-line bg-surface/90 px-3 focus-within:border-leaf">
        <Search className="size-5 text-muted" />
        <span className="sr-only">Search exercises</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 876 exercises" className="h-full min-w-0 flex-1 bg-transparent text-base focus:outline-none" />
      </label>
      {result && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {select(primary, setPrimary, result.filters.muscles, "Primary muscle")}
          {select(secondary, setSecondary, result.filters.muscles, "Secondary muscle")}
          {select(equipment, setEquipment, result.filters.equipment, "Any equipment")}
          <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as "name" | "level")} className={`${input} h-11 px-3 text-sm`}>
            <option value="name">Sort: A–Z</option>
            <option value="level">Sort: easiest first</option>
          </select>
        </div>
      )}
      {!result ? (
        <div className="h-64 animate-pulse rounded-3xl bg-surface-2" aria-hidden="true" />
      ) : (
        <>
          <p className="text-sm text-muted">{result.total} exercises</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {result.exercises.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => onOpen(e.id)} className="flex w-full items-center gap-3 card p-2.5 text-left shadow-sm transition-transform hover:-translate-y-0.5">
                  {e.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.thumb} alt="" loading="lazy" className="size-16 shrink-0 rounded-xl bg-white object-cover" />
                  ) : (
                    <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-surface-2"><Gym className="size-7" /></span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{e.name}</span>
                    <span className="block truncate text-sm capitalize text-muted">
                      {e.primary.join(", ")} · {e.equipment}
                    </span>
                    <span className="block text-xs capitalize text-muted">{e.level}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {result.exercises.length < result.total && (
            <button type="button" onClick={more} disabled={loadingMore} className={`${btn.secondary} w-full`}>
              {loadingMore ? <Spinner /> : `Show more (${result.total - result.exercises.length} left)`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Exercise detail: start and end photos alternating, muscles, how-to, and "add to day". */
function ExerciseSheet({ id, day, onClose, onAdded }: { id: string; day: string; onClose: () => void; onAdded: () => void }) {
  const [ex, setEx] = useState<Detail | null>(null);
  const [phase, setPhase] = useState(0);
  const [sets, setSets] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/exercises/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setEx)
      .catch(() => setError("Couldn't load this exercise."));
    const t = setInterval(() => setPhase((p) => 1 - p), 1100);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => {
      clearInterval(t);
      window.removeEventListener("keydown", esc);
    };
  }, [id, onClose]);

  async function add() {
    setBusy(true);
    const res = await fetch("/api/workouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day, exerciseId: id, sets }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) onAdded();
    else setError("Couldn't add it. Try again.");
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={ex?.name ?? "Exercise"} className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-paper p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="font-display text-2xl font-bold tracking-tight">{ex?.name ?? "…"}</h2>
          <IconButton label="Close" onClick={onClose} className="size-10 shrink-0">
            <Xmark className="size-5" />
          </IconButton>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {ex && (
          <>
            {ex.photos.length === 2 && (
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-white">
                {ex.photos.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt={i ? "End position" : "Start position"} className={`absolute inset-0 size-full object-contain transition-opacity duration-500 ${phase === i ? "opacity-100" : "opacity-0"}`} />
                ))}
                <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-xs text-white">{phase ? "End" : "Start"}</span>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs capitalize">
              {[ex.level, ex.equipment, ex.category, ex.mechanic].filter(Boolean).map((t) => (
                <span key={t} className="rounded-full bg-surface-2 px-2.5 py-1">{t}</span>
              ))}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div><dt className="text-muted">Primary</dt><dd className="capitalize">{ex.primary.join(", ")}</dd></div>
              <div><dt className="text-muted">Secondary</dt><dd className="capitalize">{ex.secondary.join(", ") || "—"}</dd></div>
            </dl>
            <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed">
              {ex.instructions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <div className="mt-5 flex items-center gap-2">
              <select aria-label="Number of sets" value={sets} onChange={(e) => setSets(Number(e.target.value))} className={`${input} h-12 w-28`}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n} {n === 1 ? "set" : "sets"}</option>
                ))}
              </select>
              <button type="button" onClick={add} disabled={busy} className={`${btn.primary} flex-1`}>
                {busy ? <Spinner /> : <><Plus className="size-5" /> Add to {dayTitle(day).toLowerCase() === "today" ? "today" : shortDate(day)}</>}
              </button>
            </div>
            <p className="mt-3 text-xs text-muted">Photos and instructions: free-exercise-db (public domain).</p>
          </>
        )}
      </div>
    </div>
  );
}
