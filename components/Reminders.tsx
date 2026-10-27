"use client";

import { useEffect } from "react";
import { dayKey } from "@/lib/dates";
import type { Meal, MealType, Prefs } from "@/lib/nutrition";

export const PREFS_EVENT = "calai:prefs";
const REMINDED = ["breakfast", "lunch", "dinner"] as const satisfies MealType[];
const WINDOW_MIN = 180; // don't nag about breakfast in the evening

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Meals whose reminder time has passed (within the last 3 hours) and that aren't logged yet. */
export function dueReminders(prefs: Prefs, meals: Meal[], now = new Date()): MealType[] {
  if (!prefs.reminders.enabled) return [];
  const mins = now.getHours() * 60 + now.getMinutes();
  return REMINDED.filter((t) => {
    const since = mins - minutesOf(prefs.reminders[t]);
    return since >= 0 && since <= WINDOW_MIN && !meals.some((m) => m.meal_type === t);
  });
}

/**
 * Shows a system notification when a meal reminder comes due while CalAi is open
 * (in a tab or installed as an app). Browsers only allow this on https or localhost.
 */
export function ReminderWatcher() {
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    let prefs: Prefs | null = null;
    let alive = true;

    const loadPrefs = () =>
      fetch("/api/prefs", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((p) => {
          if (alive) prefs = p;
        })
        .catch(() => {});

    /** Shows each alert at most once: the key is remembered in this browser. */
    function notifyOnce(key: string, body: string, href: string) {
      try {
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, "1");
      } catch {
        // storage blocked: still notify, it may repeat
      }
      const n = new Notification("CalAi", { body, icon: "/icon.svg", tag: key });
      n.onclick = () => {
        window.focus();
         
        window.location.href = href;
      };
    }

    async function check() {
      if (!prefs || Notification.permission !== "granted") return;
      const wantsWater = prefs.water.enabled && prefs.water.reminder;
      const wantsFast = prefs.fasting.enabled && prefs.fasting.alert;
      if (!prefs.reminders.enabled && !wantsWater && !wantsFast) return;
      const today = dayKey();
      const res = await fetch(`/api/day?date=${today}`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok || !alive) return;
      const day = (await res.json()) as {
        meals: Meal[];
        water: { ml: number; goal: number } | null;
        fasting: { active: { id: number; started_at: string; goal_hours: number } | null } | null;
      };
      const now = new Date();

      // Water: every N hours from 8 am to 9 pm, only while behind the pro-rata goal.
      const hour = now.getHours();
      if (wantsWater && day.water && hour >= 8 && hour < 21 && (hour - 8) % prefs.water.reminderEveryHours === 0) {
        const expected = (day.water.goal * (hour - 8 + 1)) / 13;
        if (day.water.ml < expected) notifyOnce(`calai-water-${today}-${hour}`, `Time for some water: ${day.water.ml} of ${day.water.goal} ml so far.`, "/");
      }

      // Fasting goal reached.
      const fast = day.fasting?.active;
      if (wantsFast && fast && now.getTime() - Date.parse(fast.started_at) >= fast.goal_hours * 3_600_000) {
        notifyOnce(`calai-fast-${fast.id}`, `You reached your ${fast.goal_hours} h fasting goal. End the fast from Home when you eat.`, "/");
      }

      if (!prefs.reminders.enabled) return;
      const meals = day.meals;
      for (const t of dueReminders(prefs, meals)) {
        notifyOnce(`calai-reminded-${today}-${t}`, `You haven't logged ${t} yet. Tap to add it.`, "/add");
      }
    }

    loadPrefs().then(check);
    const timer = setInterval(check, 60_000);
    const onPrefs = () => loadPrefs().then(check);
    window.addEventListener(PREFS_EVENT, onPrefs);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener(PREFS_EVENT, onPrefs);
    };
  }, []);

  return null;
}
