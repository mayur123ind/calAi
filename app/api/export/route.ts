import type { NextRequest } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import { getItemsInRange, getWeights } from "@/lib/db";
import { isDayKey } from "@/lib/dates";
import { NUTRIENTS } from "@/lib/nutrition";

// Quote every cell; a leading = + - @ would run as a formula in Excel, so neutralise it.
function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const csv = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
const round = (n: number) => Math.round(n * 10) / 10;

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const p = request.nextUrl.searchParams;
  const type = p.get("type");
  const from = p.get("from");
  const to = p.get("to");
  if (!isDayKey(from) || !isDayKey(to) || from > to) return Response.json({ error: "Pick a valid date range." }, { status: 400 });

  let body: string;
  if (type === "meals") {
    const rows = await getItemsInRange(user.id, from, to);
    body = csv([
      ["date", "time", "meal", "item", "grams", ...NUTRIENTS, "note"],
      ...rows.map((r) => [
        r.day,
        new Date(r.eaten_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
        r.meal_type,
        r.name,
        round(r.grams),
        ...NUTRIENTS.map((n) => round(r[n])),
        r.note,
      ]),
    ]);
  } else if (type === "weights") {
    const rows = (await getWeights(user.id)).filter((w) => w.day >= from && w.day <= to);
    body = csv([["date", "kg"], ...rows.map((w) => [w.day, w.kg])]);
  } else {
    return Response.json({ error: "Unknown export type" }, { status: 400 });
  }

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="calai-${type}-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
