"use client";

import { useRef } from "react";
import { NavArrowLeft, NavArrowRight } from "iconoir-react";
import { IconButton } from "@/components/ui";
import { dayKey, parseDay, shiftDay } from "@/lib/dates";

/**
 * A week of days to jump between; swipe (or use the arrows) for the week before or after.
 * Days with food logged get a ring that fills toward the calorie target.
 */
export function WeekStrip({
  day,
  week,
  target,
  onPick,
}: {
  day: string;
  week: { day: string; calories: number }[];
  target: number;
  onPick: (d: string) => void;
}) {
  const today = dayKey();
  const start = useRef<number | null>(null);
  const first = week[0]?.day ?? day;
  const canNext = shiftDay(first, 7) <= today;
  const go = (weeks: number) => {
    const next = shiftDay(day, weeks * 7);
    onPick(next > today ? today : next);
  };

  return (
    <div className="flex items-center gap-1">
      <IconButton label="Previous week" onClick={() => go(-1)} className="size-9 shrink-0">
        <NavArrowLeft className="size-5" />
      </IconButton>
      <ol
        className="grid flex-1 touch-pan-y grid-cols-7 gap-1"
        onPointerDown={(e) => (start.current = e.clientX)}
        onPointerUp={(e) => {
          if (start.current === null) return;
          const dx = e.clientX - start.current;
          start.current = null;
          if (dx > 50) go(-1);
          else if (dx < -50 && canNext) go(1);
        }}
      >
        {week.map((d) => {
          const date = parseDay(d.day);
          const selected = d.day === day;
          const future = d.day > today;
          const fill = target ? Math.min(1, d.calories / target) : 0;
          return (
            <li key={d.day}>
              <button
                type="button"
                disabled={future}
                onClick={() => onPick(d.day)}
                aria-current={selected ? "date" : undefined}
                aria-label={date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
                className={`flex w-full flex-col items-center gap-1 rounded-2xl py-1.5 transition-colors disabled:opacity-35 ${
                  selected ? "bg-ink text-paper" : "hover:bg-surface-2"
                }`}
              >
                <span className={`text-[11px] font-medium ${selected ? "text-paper/70" : "text-muted"}`}>
                  {date.toLocaleDateString("en-IN", { weekday: "narrow" })}
                </span>
                <span className="relative flex size-8 items-center justify-center">
                  <svg viewBox="0 0 32 32" className="absolute inset-0 -rotate-90" aria-hidden="true">
                    <circle cx="16" cy="16" r="14" fill="none" strokeWidth="2.5" className={selected ? "stroke-paper/20" : "stroke-line"} />
                    {fill > 0 && (
                      <circle
                        cx="16"
                        cy="16"
                        r="14"
                        fill="none"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeDasharray={`${fill * 88} 88`}
                        className={d.calories > target * 1.05 ? "stroke-protein" : "stroke-leaf"}
                      />
                    )}
                  </svg>
                  <span className="num text-sm font-semibold">{date.getDate()}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <IconButton label="Next week" onClick={() => go(1)} disabled={!canNext} className="size-9 shrink-0">
        <NavArrowRight className="size-5" />
      </IconButton>
    </div>
  );
}
