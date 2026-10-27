// Day keys are local calendar dates in YYYY-MM-DD form.

export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function shiftDay(key: string, days: number): string {
  const d = parseDay(key);
  d.setDate(d.getDate() + days);
  return dayKey(d);
}

export const isDayKey = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function dayTitle(key: string): string {
  const today = dayKey();
  if (key === today) return "Today";
  if (key === shiftDay(today, -1)) return "Yesterday";
  return parseDay(key).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
}

export function shortDate(key: string): string {
  return parseDay(key).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
