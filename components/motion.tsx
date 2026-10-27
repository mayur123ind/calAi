"use client";

import { useEffect, useRef, useState } from "react";
import { fmt, fmt1 } from "@/lib/nutrition";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Eases a number from its last value to the new one, decelerating as it lands. */
export function useCountUp(value: number, duration = 1400) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (reducedMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(2, -10 * t); // expo out
      const next = origin + (value - origin) * (t === 1 ? 1 : eased);
      from.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return shown;
}

export function CountUp({ value, duration, decimals = 0 }: { value: number; duration?: number; decimals?: 0 | 1 }) {
  const shown = useCountUp(value, duration);
  return <>{decimals ? fmt1(shown) : fmt(shown)}</>;
}
