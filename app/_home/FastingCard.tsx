"use client";

import { useEffect, useState } from "react";
import { Timer } from "iconoir-react";
import { Spinner } from "@/components/ui";

export type Fast = { id: number; started_at: string; ended_at: string | null; goal_hours: number };

const hm = (ms: number) => {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
};

/**
 * The running fast, if any. The start time is stored on the server, so the timer survives restarts.
 * Fasting never changes nutrition totals.
 */
export function FastingCard({
  active,
  goalHours,
  onChange,
}: {
  active: Fast | null;
  goalHours: number;
  onChange: (active: Fast | null) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [active]);

  async function act(action: "start" | "end" | "cancel") {
    setBusy(action);
    setError(null);
    const res = await fetch("/api/fasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    setBusy(null);
    setConfirmCancel(false);
    if (!res?.ok) {
      setError((await res?.json().catch(() => null))?.error ?? "Couldn't update the fast. Try again.");
      return;
    }
    const data = await res.json();
    onChange(data.active);
    setNow(Date.now());
  }

  if (!active) {
    return (
      <section className="card flex items-center gap-3 p-4 shadow-sm">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-fat/15 text-fat">
          <Timer className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-bold tracking-tight">Fasting</span>
          <span className="block text-sm text-muted">Goal {goalHours} h · not running</span>
        </span>
        <button type="button" onClick={() => act("start")} disabled={busy !== null} className="h-10 shrink-0 rounded-full bg-fat px-4 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? <Spinner className="size-4" /> : "Start fast"}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </section>
    );
  }

  const elapsed = now - Date.parse(active.started_at);
  const goalMs = active.goal_hours * 3_600_000;
  const ratio = Math.min(1, elapsed / goalMs);
  const done = elapsed >= goalMs;

  return (
    <section aria-label="Fasting" className="card p-4 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="relative size-20 shrink-0">
          <svg viewBox="0 0 80 80" className="size-full -rotate-90" aria-hidden="true">
            <circle cx="40" cy="40" r="34" fill="none" stroke="var(--surface-2)" strokeWidth="8" />
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke={done ? "var(--leaf)" : "var(--fat)"}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${ratio * 213.6} 213.6`}
              className="transition-[stroke-dasharray] duration-700"
            />
          </svg>
          <Timer className={`absolute inset-0 m-auto size-6 ${done ? "text-leaf" : "text-fat"}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{done ? "Goal reached" : "Fasting"}</p>
          <p className="num font-display text-3xl font-bold tracking-tight">{hm(elapsed)}</p>
          <p className="num text-sm text-muted">
            {done ? `${hm(elapsed - goalMs)} past your ${active.goal_hours} h goal` : `${hm(goalMs - elapsed)} to your ${active.goal_hours} h goal`}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {confirmCancel ? (
          <>
            <span className="mr-auto self-center text-sm text-muted">Discard this fast?</span>
            <button type="button" onClick={() => setConfirmCancel(false)} className="h-10 rounded-full px-4 text-sm font-medium text-muted">
              Keep it
            </button>
            <button type="button" onClick={() => act("cancel")} disabled={busy !== null} className="h-10 rounded-full bg-danger px-4 text-sm font-semibold text-white">
              Discard
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setConfirmCancel(true)} className="h-10 rounded-full px-4 text-sm font-medium text-muted hover:text-ink">
              Cancel
            </button>
            <button type="button" onClick={() => act("end")} disabled={busy !== null} className="h-10 rounded-full bg-ink px-5 text-sm font-semibold text-paper">
              {busy === "end" ? <Spinner className="size-4" /> : "End fast"}
            </button>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}
