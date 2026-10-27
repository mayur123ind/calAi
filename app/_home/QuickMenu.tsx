"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Camera, Gym, Plus, Timer, Weight } from "iconoir-react";
import type { Fast } from "./FastingCard";

/** The Home "+" menu: log a meal, weight or workout, and start or end a fast. */
export function QuickMenu({
  addHref,
  fasting,
  onFast,
}: {
  addHref: string;
  fasting: { active: Fast | null } | null;
  onFast: (action: "start" | "end") => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const item = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium hover:bg-surface-2";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add"
        onClick={() => setOpen((o) => !o)}
        className={`flex size-11 items-center justify-center rounded-full bg-ink text-paper shadow-md transition-transform duration-300 ease-spring ${open ? "rotate-45" : ""}`}
      >
        <Plus className="size-6" strokeWidth={2.2} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-56 animate-rise card p-1.5 shadow-md [animation-duration:300ms]">
          <Link role="menuitem" href={addHref} className={item}>
            <Camera className="size-5 text-leaf" /> Log a meal
          </Link>
          <Link role="menuitem" href="/progress?log=weight" className={item}>
            <Weight className="size-5 text-water" /> Log weight
          </Link>
          <Link role="menuitem" href="/workouts" className={item}>
            <Gym className="size-5 text-protein" /> Log a workout
          </Link>
          {fasting && (
            <button
              role="menuitem"
              type="button"
              className={item}
              onClick={() => {
                setOpen(false);
                onFast(fasting.active ? "end" : "start");
              }}
            >
              <Timer className="size-5 text-fat" /> {fasting.active ? "End fast" : "Start a fast"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
