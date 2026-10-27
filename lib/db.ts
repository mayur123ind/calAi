import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import {
  withDefaultPrefs,
  DEFAULT_PROFILE,
  NUTRIENTS,
  type FoodItem,
  type Meal,
  type MealType,
  type Prefs,
  type Profile,
} from "./nutrition";
import { photoUrl, type PhotoData } from "./photos";

// Supabase Postgres, signed in as the least-privilege calai_app role (rows only, no schema changes).
// Tables are created by `npm run db:setup` from db/schema.sql. The role's search_path is "calai".
// Every query on people's data filters by user_id here — route handlers never write SQL.
// The pool is kept on globalThis so dev hot-reload reuses it, until an .env reload changes the URL.
const g = globalThis as unknown as { __calaiDbPool?: { url: string; pool: Pool } };

function pool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  if (g.__calaiDbPool?.url === url) return g.__calaiDbPool.pool;
  void g.__calaiDbPool?.pool.end();
  const created = new Pool({
    connectionString: url,
    // Supabase signs its database certificate with its own CA, so trust exactly that one.
    ssl: { ca: fs.readFileSync(path.join(process.cwd(), "certs", "prod-ca-2021.crt"), "utf8") },
    max: 5,
    // The database is a long way off (each round trip ~140 ms, a new TLS connection ~1 s),
    // so keep connections open between requests instead of closing them after 10 s idle.
    idleTimeoutMillis: 10 * 60_000,
    keepAlive: true,
  });
  // Open one connection now, so the first request doesn't pay for the handshake.
  created.connect().then((c) => c.release(), () => {});
  g.__calaiDbPool = { url, pool: created };
  return created;
}

type Conn = Pool | PoolClient;

async function all<T>(sql: string, params: unknown[] = [], conn: Conn = pool()): Promise<T[]> {
  return (await conn.query(sql, params)).rows as T[];
}

async function one<T>(sql: string, params: unknown[] = [], conn: Conn = pool()): Promise<T | undefined> {
  return (await all<T>(sql, params, conn))[0];
}

/** Runs a write and returns how many rows it touched. */
async function run(sql: string, params: unknown[] = [], conn: Conn = pool()): Promise<number> {
  return (await conn.query(sql, params)).rowCount ?? 0;
}

async function transaction<T>(fn: (conn: PoolClient) => Promise<T>): Promise<T> {
  const conn = await pool().connect();
  try {
    await conn.query("BEGIN");
    const result = await fn(conn);
    await conn.query("COMMIT");
    return result;
  } catch (e) {
    await conn.query("ROLLBACK");
    throw e;
  } finally {
    conn.release();
  }
}

const now = () => new Date().toISOString();

// ---------- Users and sessions ----------

export type Role = "user" | "admin";
export type SessionUser = { id: number; username: string; role: Role };
type UserRow = SessionUser & { password_hash: string; disabled: boolean };

export function findUserByUsername(username: string): Promise<UserRow | undefined> {
  return one("SELECT id, username, role, password_hash, disabled FROM users WHERE lower(username) = lower($1)", [username]);
}

export function getUserById(id: number): Promise<UserRow | undefined> {
  return one("SELECT id, username, role, password_hash, disabled FROM users WHERE id = $1", [id]);
}

export async function createUser(username: string, passwordHash: string, role: Role = "user"): Promise<number> {
  const row = await one<{ id: number }>(
    "INSERT INTO users (username, password_hash, role, created_at) VALUES ($1, $2, $3, $4) RETURNING id",
    [username, passwordHash, role, now()],
  );
  return row!.id;
}

export type UserListing = SessionUser & {
  disabled: boolean;
  created_at: string;
  last_seen_at: string | null;
  meals: number;
  last_meal_day: string | null;
};

export function listUsers(): Promise<UserListing[]> {
  return all(
    `SELECT u.id, u.username, u.role, u.disabled, u.created_at, u.last_seen_at,
            COUNT(m.id)::int AS meals, MAX(m.day) AS last_meal_day
     FROM users u LEFT JOIN meals m ON m.user_id = u.id
     GROUP BY u.id ORDER BY u.created_at`,
  );
}

export async function updateUser(id: number, patch: { disabled?: boolean; role?: Role; password_hash?: string }) {
  if (patch.disabled !== undefined) await run("UPDATE users SET disabled = $1 WHERE id = $2", [patch.disabled, id]);
  if (patch.role) await run("UPDATE users SET role = $1 WHERE id = $2", [patch.role, id]);
  if (patch.password_hash) await run("UPDATE users SET password_hash = $1 WHERE id = $2", [patch.password_hash, id]);
}

/** Their meals, photos, sessions and settings go with them (ON DELETE CASCADE). */
export async function deleteUser(id: number) {
  await run("DELETE FROM users WHERE id = $1", [id]);
}

export async function countActiveAdmins(): Promise<number> {
  return (await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND NOT disabled"))!.n;
}

export async function insertSession(idHash: string, userId: number, expiresAt: string) {
  await run("DELETE FROM sessions WHERE expires_at < $1", [now()]);
  await run("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)", [idHash, userId, expiresAt]);
}

export async function getSessionUser(idHash: string): Promise<SessionUser | null> {
  const row = await one<SessionUser & { stale: boolean }>(
    `SELECT u.id, u.username, u.role, (u.last_seen_at IS NULL OR u.last_seen_at < $3) AS stale
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > $2 AND NOT u.disabled`,
    [idHash, now(), new Date(Date.now() - 5 * 60_000).toISOString()],
  );
  if (!row) return null;
  // "Last seen" only needs minute-level accuracy: refresh it every 5 minutes, without making the request wait.
  if (row.stale) run("UPDATE users SET last_seen_at = $1 WHERE id = $2", [now(), row.id]).catch(() => {});
  return { id: row.id, username: row.username, role: row.role };
}

export async function deleteSession(idHash: string) {
  await run("DELETE FROM sessions WHERE id = $1", [idHash]);
}

export async function deleteUserSessions(userId: number, exceptIdHash?: string) {
  await run("DELETE FROM sessions WHERE user_id = $1 AND id != $2", [userId, exceptIdHash ?? ""]);
}

// ---------- Meals ----------

const ITEM_COLS = `name, grams, ${NUTRIENTS.join(", ")}`;
// micros is jsonb; unit/unit_grams describe a visible serving ("slice", 30 g).
const ITEM_EXTRA = "micros, unit, unit_grams";

type MealRow = Omit<Meal, "items">;
type ItemRow = FoodItem & { meal_id: number };

function toFoodItem(i: ItemRow): FoodItem {
  const item = Object.fromEntries((["name", "grams", ...NUTRIENTS] as const).map((k) => [k, i[k]])) as unknown as FoodItem;
  if (i.micros) item.micros = i.micros;
  if (i.unit && i.unit_grams) {
    item.unit = i.unit;
    item.unit_grams = i.unit_grams;
  }
  return item;
}

async function attachItems(meals: MealRow[]): Promise<Meal[]> {
  if (meals.length === 0) return [];
  const items = await all<ItemRow>(
    `SELECT meal_id, ${ITEM_COLS}, ${ITEM_EXTRA} FROM meal_items WHERE meal_id = ANY($1::int[]) ORDER BY id`,
    [meals.map((m) => m.id)],
  );
  return meals.map((m) => ({
    ...m,
    photo: photoUrl(m.photo),
    items: items.filter((i) => i.meal_id === m.id).map(toFoodItem),
  }));
}

const MEAL_COLS = "id, day, eaten_at, meal_type, note, photo";

export async function getMealsForDay(userId: number, day: string): Promise<Meal[]> {
  return attachItems(
    await all(`SELECT ${MEAL_COLS} FROM meals WHERE user_id = $1 AND day = $2 ORDER BY eaten_at`, [userId, day]),
  );
}

export async function getMeal(userId: number, id: number): Promise<Meal | null> {
  const row = await one<MealRow>(`SELECT ${MEAL_COLS} FROM meals WHERE user_id = $1 AND id = $2`, [userId, id]);
  return row ? (await attachItems([row]))[0] : null;
}

async function insertItems(conn: PoolClient, mealId: number, items: FoodItem[]) {
  const cols = ["meal_id", "name", "grams", ...NUTRIENTS, "micros", "unit", "unit_grams"];
  const sql = `INSERT INTO meal_items (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`;
  for (const i of items) {
    const micros = i.micros && Object.keys(i.micros).length ? JSON.stringify(i.micros) : null;
    const unit = i.unit && i.unit_grams ? [i.unit, i.unit_grams] : [null, null];
    await conn.query(sql, [mealId, i.name, i.grams, ...NUTRIENTS.map((n) => i[n]), micros, ...unit]);
  }
}

/** `photo` is either a new upload or the name of a photo this person already has (when copying). */
export function addMeal(
  userId: number,
  input: {
    day: string;
    eaten_at: string;
    meal_type: MealType;
    note: string | null;
    photo: PhotoData | string | null;
    items: FoodItem[];
  },
): Promise<number> {
  return transaction(async (conn) => {
    let photo = input.photo;
    if (photo && typeof photo !== "string") {
      await conn.query(
        "INSERT INTO photos (name, user_id, content_type, data, created_at) VALUES ($1, $2, $3, $4, $5)",
        [photo.name, userId, photo.contentType, photo.data, now()],
      );
      photo = photo.name;
    }
    const { id } = (await one<{ id: number }>(
      "INSERT INTO meals (user_id, day, eaten_at, meal_type, note, photo) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [userId, input.day, input.eaten_at, input.meal_type, input.note, photo],
      conn,
    ))!;
    await insertItems(conn, id, input.items);
    return id;
  });
}

export function updateMeal(
  userId: number,
  id: number,
  input: { meal_type: MealType; note: string | null; items: FoodItem[] },
): Promise<boolean> {
  return transaction(async (conn) => {
    const changed = await run(
      "UPDATE meals SET meal_type = $1, note = $2 WHERE id = $3 AND user_id = $4",
      [input.meal_type, input.note, id, userId],
      conn,
    );
    if (changed === 0) return false;
    await run("DELETE FROM meal_items WHERE meal_id = $1", [id], conn);
    await insertItems(conn, id, input.items);
    return true;
  });
}

export async function deleteMeal(userId: number, id: number): Promise<boolean> {
  const row = await one<{ photo: string | null }>("SELECT photo FROM meals WHERE id = $1 AND user_id = $2", [id, userId]);
  if (!row) return false;
  await run("DELETE FROM meals WHERE id = $1", [id]);
  // Copied meals share a photo, so it goes only when no meal uses it any more.
  if (row.photo) {
    await run("DELETE FROM photos WHERE name = $1 AND NOT EXISTS (SELECT 1 FROM meals WHERE photo = $1)", [row.photo]);
  }
  return true;
}

/** Copies every meal of one type from one day to another. Photos are shared, not duplicated. */
export async function copyMeals(userId: number, fromDay: string, toDay: string, mealType: MealType): Promise<number> {
  const source = (await getMealsForDay(userId, fromDay)).filter((m) => m.meal_type === mealType);
  const photos = await all<{ id: number; photo: string | null }>(
    "SELECT id, photo FROM meals WHERE user_id = $1 AND day = $2 AND meal_type = $3",
    [userId, fromDay, mealType],
  );
  const photoOf = new Map(photos.map((p) => [p.id, p.photo]));
  for (const m of source) {
    await addMeal(userId, {
      day: toDay,
      eaten_at: now(),
      meal_type: mealType,
      note: m.note,
      photo: photoOf.get(m.id) ?? null,
      items: m.items,
    });
  }
  return source.length;
}

/** The photo, only if it belongs to this person. */
export function getPhoto(userId: number, name: string): Promise<{ content_type: string; data: Buffer } | undefined> {
  return one("SELECT content_type, data FROM photos WHERE name = $1 AND user_id = $2", [name, userId]);
}

export type RecentMeal = { meal_type: MealType; items: FoodItem[]; photo: string | null; last_day: string; times: number };

/**
 * Distinct meals from the last 300 logs (same foods count once): newest first for Recents,
 * and those eaten at least twice, most often first, for Frequent.
 */
export async function getRecentMeals(userId: number, limit = 20): Promise<{ recent: RecentMeal[]; frequent: RecentMeal[] }> {
  const rows = await all<MealRow>(
    `SELECT ${MEAL_COLS} FROM meals WHERE user_id = $1 ORDER BY eaten_at DESC LIMIT 300`,
    [userId],
  );
  const byKey = new Map<string, RecentMeal>();
  for (const m of await attachItems(rows)) {
    const key = m.items
      .map((i) => i.name.trim().toLowerCase())
      .sort()
      .join("|");
    if (!key) continue;
    const seen = byKey.get(key);
    if (seen) seen.times++;
    else byKey.set(key, { meal_type: m.meal_type, items: m.items, photo: m.photo, last_day: m.day, times: 1 });
  }
  const list = [...byKey.values()];
  return {
    recent: list.slice(0, limit),
    frequent: list
      .filter((m) => m.times >= 2)
      .sort((a, b) => b.times - a.times)
      .slice(0, limit),
  };
}

export type DaySummary = { day: string; meals: number } & Record<(typeof NUTRIENTS)[number], number>;

export function getDaySummaries(userId: number, fromDay: string, toDay: string): Promise<DaySummary[]> {
  return all(
    `SELECT m.day AS day,
            ${NUTRIENTS.map((n) => `COALESCE(SUM(i.${n}), 0) AS ${n}`).join(",\n            ")},
            COUNT(DISTINCT m.id)::int AS meals
     FROM meals m LEFT JOIN meal_items i ON i.meal_id = m.id
     WHERE m.user_id = $1 AND m.day BETWEEN $2 AND $3
     GROUP BY m.day ORDER BY m.day`,
    [userId, fromDay, toDay],
  );
}

export async function getLoggedDays(userId: number): Promise<string[]> {
  const rows = await all<{ day: string }>("SELECT DISTINCT day FROM meals WHERE user_id = $1 ORDER BY day", [userId]);
  return rows.map((r) => r.day);
}

export type ExportRow = FoodItem & { day: string; eaten_at: string; meal_type: MealType; note: string | null };

export function getItemsInRange(userId: number, fromDay: string, toDay: string): Promise<ExportRow[]> {
  return all(
    `SELECT m.day, m.eaten_at, m.meal_type, m.note, ${ITEM_COLS.split(", ").map((c) => `i.${c}`).join(", ")}
     FROM meals m JOIN meal_items i ON i.meal_id = m.id
     WHERE m.user_id = $1 AND m.day BETWEEN $2 AND $3
     ORDER BY m.day, m.eaten_at, i.id`,
    [userId, fromDay, toDay],
  );
}

// ---------- Weights ----------

export function getWeights(userId: number): Promise<{ day: string; kg: number }[]> {
  return all("SELECT day, kg FROM weights WHERE user_id = $1 ORDER BY day", [userId]);
}

// ---------- Body fat ----------

export function getBodyFat(userId: number): Promise<{ day: string; pct: number }[]> {
  return all("SELECT day, pct FROM body_fat WHERE user_id = $1 ORDER BY day", [userId]);
}

export async function upsertBodyFat(userId: number, day: string, pct: number) {
  await run(
    "INSERT INTO body_fat (user_id, day, pct) VALUES ($1, $2, $3) ON CONFLICT (user_id, day) DO UPDATE SET pct = excluded.pct",
    [userId, day, pct],
  );
}

export async function deleteBodyFat(userId: number, day: string) {
  await run("DELETE FROM body_fat WHERE user_id = $1 AND day = $2", [userId, day]);
}

export async function upsertWeight(userId: number, day: string, kg: number) {
  await run(
    "INSERT INTO weights (user_id, day, kg) VALUES ($1, $2, $3) ON CONFLICT (user_id, day) DO UPDATE SET kg = excluded.kg",
    [userId, day, kg],
  );
}

export async function deleteWeight(userId: number, day: string) {
  await run("DELETE FROM weights WHERE user_id = $1 AND day = $2", [userId, day]);
}

// ---------- Settings ----------

// profile, prefs and pantry are jsonb: written as JSON text, read back already parsed.
type SettingsRow = { profile: Profile | null; prefs: Partial<Prefs> | null; pantry: unknown[] | null };

function settingsRow(userId: number) {
  return one<SettingsRow>("SELECT profile, prefs, pantry FROM user_settings WHERE user_id = $1", [userId]);
}

async function saveSetting(userId: number, column: keyof SettingsRow, value: unknown) {
  await run(
    `INSERT INTO user_settings (user_id, ${column}) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET ${column} = excluded.${column}`,
    [userId, JSON.stringify(value)],
  );
}

export async function getProfile(userId: number): Promise<{ profile: Profile; saved: boolean }> {
  const saved = (await settingsRow(userId))?.profile;
  if (!saved) return { profile: DEFAULT_PROFILE, saved: false };
  return { profile: { ...DEFAULT_PROFILE, ...saved }, saved: true };
}

export function saveProfile(userId: number, p: Profile) {
  return saveSetting(userId, "profile", p);
}

export async function getPrefs(userId: number): Promise<Prefs> {
  const saved = (await settingsRow(userId))?.prefs;
  return withDefaultPrefs(saved);
}

export function savePrefs(userId: number, p: Prefs) {
  return saveSetting(userId, "prefs", p);
}

// ---------- Water ----------

export async function getWater(userId: number, day: string): Promise<number> {
  return (await one<{ ml: number }>("SELECT ml FROM water WHERE user_id = $1 AND day = $2", [userId, day]))?.ml ?? 0;
}

export async function setWater(userId: number, day: string, ml: number) {
  await run(
    "INSERT INTO water (user_id, day, ml) VALUES ($1, $2, $3) ON CONFLICT (user_id, day) DO UPDATE SET ml = excluded.ml",
    [userId, day, ml],
  );
}

// ---------- Favourites ----------

export type Favorite = { id: number; name: string; meal_type: MealType; items: FoodItem[] };

export function getFavorites(userId: number): Promise<Favorite[]> {
  return all("SELECT id, name, meal_type, items FROM favorites WHERE user_id = $1 ORDER BY position, id", [userId]);
}

export async function addFavorite(userId: number, f: Omit<Favorite, "id">): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO favorites (user_id, name, meal_type, items, created_at, position)
     VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(position), 0) + 1 FROM favorites WHERE user_id = $1)) RETURNING id`,
    [userId, f.name, f.meal_type, JSON.stringify(f.items), now()],
  );
  return row!.id;
}

export async function deleteFavorite(userId: number, id: number): Promise<boolean> {
  return (await run("DELETE FROM favorites WHERE id = $1 AND user_id = $2", [id, userId])) > 0;
}

/** Saves the dragged order. Ids that aren't this person's are ignored. */
export async function reorderFavorites(userId: number, ids: number[]) {
  await transaction(async (conn) => {
    for (const [i, id] of ids.entries()) {
      await run("UPDATE favorites SET position = $1 WHERE id = $2 AND user_id = $3", [i + 1, id, userId], conn);
    }
  });
}

export async function renameFavorite(userId: number, id: number, name: string): Promise<boolean> {
  return (await run("UPDATE favorites SET name = $1 WHERE id = $2 AND user_id = $3", [name, id, userId])) > 0;
}

// ---------- Meal prep ----------

export async function getPantry(userId: number): Promise<unknown[]> {
  return (await settingsRow(userId))?.pantry ?? [];
}

export function savePantry(userId: number, pantry: unknown[]) {
  return saveSetting(userId, "pantry", pantry);
}

export async function addPlan(userId: number, day: string, plan: unknown): Promise<number> {
  const row = await one<{ id: number }>(
    "INSERT INTO meal_plans (user_id, day, created_at, plan) VALUES ($1, $2, $3, $4) RETURNING id",
    [userId, day, now(), JSON.stringify(plan)],
  );
  return row!.id;
}

export type PlanListing = { id: number; day: string; created_at: string; dishes: string[] };

export async function listPlans(userId: number, limit = 10): Promise<PlanListing[]> {
  const rows = await all<{ id: number; day: string; created_at: string; plan: { meals?: { dish: string }[] } }>(
    "SELECT id, day, created_at, plan FROM meal_plans WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
    [userId, limit],
  );
  return rows.map(({ plan, ...r }) => ({ ...r, dishes: (plan.meals ?? []).map((m) => m.dish) }));
}

export async function getPlan(userId: number, id: number): Promise<unknown | null> {
  return (await one<{ plan: unknown }>("SELECT plan FROM meal_plans WHERE id = $1 AND user_id = $2", [id, userId]))?.plan ?? null;
}

export async function deletePlan(userId: number, id: number): Promise<boolean> {
  return (await run("DELETE FROM meal_plans WHERE id = $1 AND user_id = $2", [id, userId])) > 0;
}

// ---------- Insights ----------

export async function getInsight(userId: number, day: string): Promise<unknown | null> {
  return (await one<{ body: unknown }>("SELECT body FROM insights WHERE user_id = $1 AND day = $2", [userId, day]))?.body ?? null;
}

export async function saveInsight(userId: number, day: string, body: unknown) {
  await run(
    "INSERT INTO insights (user_id, day, body) VALUES ($1, $2, $3) ON CONFLICT (user_id, day) DO UPDATE SET body = excluded.body",
    [userId, day, JSON.stringify(body)],
  );
}

// ---------- Fasting ----------

export type Fast = { id: number; started_at: string; ended_at: string | null; goal_hours: number };
const FAST_COLS = "id, started_at, ended_at, goal_hours";

export function getActiveFast(userId: number): Promise<Fast | undefined> {
  return one(`SELECT ${FAST_COLS} FROM fasts WHERE user_id = $1 AND ended_at IS NULL`, [userId]);
}

export function listFasts(userId: number, limit = 30): Promise<Fast[]> {
  return all(
    `SELECT ${FAST_COLS} FROM fasts WHERE user_id = $1 AND ended_at IS NOT NULL ORDER BY started_at DESC LIMIT $2`,
    [userId, limit],
  );
}

/** Starts a fast unless one is already running (the unique index allows one active fast). */
export async function startFast(userId: number, startedAt: string, goalHours: number): Promise<Fast | null> {
  return (
    (await one<Fast>(
      `INSERT INTO fasts (user_id, started_at, goal_hours) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) WHERE ended_at IS NULL DO NOTHING RETURNING ${FAST_COLS}`,
      [userId, startedAt, goalHours],
    )) ?? null
  );
}

export async function endFast(userId: number, endedAt: string): Promise<boolean> {
  return (await run("UPDATE fasts SET ended_at = $1 WHERE user_id = $2 AND ended_at IS NULL", [endedAt, userId])) > 0;
}

export async function cancelFast(userId: number): Promise<boolean> {
  return (await run("DELETE FROM fasts WHERE user_id = $1 AND ended_at IS NULL", [userId])) > 0;
}

/** Edits a completed fast. */
export async function updateFast(
  userId: number,
  id: number,
  f: { started_at: string; ended_at: string; goal_hours: number },
): Promise<boolean> {
  const changed = await run(
    "UPDATE fasts SET started_at = $1, ended_at = $2, goal_hours = $3 WHERE id = $4 AND user_id = $5 AND ended_at IS NOT NULL",
    [f.started_at, f.ended_at, f.goal_hours, id, userId],
  );
  return changed > 0;
}

export async function deleteFast(userId: number, id: number): Promise<boolean> {
  return (await run("DELETE FROM fasts WHERE id = $1 AND user_id = $2", [id, userId])) > 0;
}

// ---------- Workouts ----------

export type WorkoutSet = {
  id: number;
  reps: number | null;
  weight_kg: number | null;
  rpe: number | null;
  minutes: number | null;
  done: boolean;
};
export type WorkoutEntry = { id: number; day: string; exercise_id: string; note: string | null; sets: WorkoutSet[] };

/** Every entry with its sets for the days in [fromDay, toDay]. */
export async function getWorkouts(userId: number, fromDay: string, toDay: string): Promise<WorkoutEntry[]> {
  const entries = await all<Omit<WorkoutEntry, "sets">>(
    `SELECT id, day, exercise_id, note FROM workout_entries
     WHERE user_id = $1 AND day BETWEEN $2 AND $3 ORDER BY day, position, id`,
    [userId, fromDay, toDay],
  );
  if (entries.length === 0) return [];
  const sets = await all<WorkoutSet & { entry_id: number }>(
    `SELECT id, entry_id, reps, weight_kg, rpe, minutes, done FROM workout_sets
     WHERE entry_id = ANY($1::int[]) ORDER BY position, id`,
    [entries.map((e) => e.id)],
  );
  return entries.map((e) => ({
    ...e,
    sets: sets.filter((s) => s.entry_id === e.id).map(({ id, reps, weight_kg, rpe, minutes, done }) => ({ id, reps, weight_kg, rpe, minutes, done })),
  }));
}

export async function addWorkoutEntry(userId: number, day: string, exerciseId: string, sets: number): Promise<number> {
  return transaction(async (conn) => {
    const { id } = (await one<{ id: number }>(
      `INSERT INTO workout_entries (user_id, day, exercise_id, position, created_at)
       VALUES ($1, $2, $3, (SELECT COALESCE(MAX(position), 0) + 1 FROM workout_entries WHERE user_id = $1 AND day = $2), $4)
       RETURNING id`,
      [userId, day, exerciseId, now()],
      conn,
    ))!;
    for (let i = 0; i < sets; i++) {
      await run("INSERT INTO workout_sets (entry_id, position) VALUES ($1, $2)", [id, i + 1], conn);
    }
    return id;
  });
}

/** Replaces an entry's note and sets in one go, as the logger sends the whole card. */
export async function saveWorkoutEntry(
  userId: number,
  entryId: number,
  input: { note: string | null; sets: Omit<WorkoutSet, "id">[] },
): Promise<boolean> {
  return transaction(async (conn) => {
    const owned = await run("UPDATE workout_entries SET note = $1 WHERE id = $2 AND user_id = $3", [input.note, entryId, userId], conn);
    if (owned === 0) return false;
    await run("DELETE FROM workout_sets WHERE entry_id = $1", [entryId], conn);
    for (const [i, s] of input.sets.entries()) {
      await run(
        "INSERT INTO workout_sets (entry_id, position, reps, weight_kg, rpe, minutes, done) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [entryId, i + 1, s.reps, s.weight_kg, s.rpe, s.minutes, s.done],
        conn,
      );
    }
    return true;
  });
}

export async function deleteWorkoutEntry(userId: number, entryId: number): Promise<boolean> {
  return (await run("DELETE FROM workout_entries WHERE id = $1 AND user_id = $2", [entryId, userId])) > 0;
}

/** Copies a day's exercises (not the logged numbers) to another day, e.g. repeating last week's plan. */
export async function copyWorkoutDay(userId: number, fromDay: string, toDay: string): Promise<number> {
  const source = await getWorkouts(userId, fromDay, fromDay);
  for (const e of source) await addWorkoutEntry(userId, toDay, e.exercise_id, Math.max(1, e.sets.length));
  return source.length;
}

// ---------- Workout burn ----------

export type Burn = { day: string; kcal: number; details: unknown; created_at: string };

export function getBurns(userId: number, fromDay = "0000-00-00", toDay = "9999-12-31"): Promise<Burn[]> {
  return all("SELECT day, kcal, details, created_at FROM burns WHERE user_id = $1 AND day BETWEEN $2 AND $3 ORDER BY day", [
    userId,
    fromDay,
    toDay,
  ]);
}

export async function saveBurn(userId: number, day: string, kcal: number, details: unknown) {
  await run(
    `INSERT INTO burns (user_id, day, kcal, details, created_at) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, day) DO UPDATE SET kcal = excluded.kcal, details = excluded.details, created_at = excluded.created_at`,
    [userId, day, kcal, JSON.stringify(details), now()],
  );
}

export async function deleteBurn(userId: number, day: string): Promise<boolean> {
  return (await run("DELETE FROM burns WHERE user_id = $1 AND day = $2", [userId, day])) > 0;
}

// ---------- Coach ----------

export type CoachMessage = { id: number; role: "user" | "assistant"; content: string; photo: string | null; created_at: string };

export async function getCoachMessages(userId: number, limit = 200): Promise<CoachMessage[]> {
  const rows = await all<CoachMessage>(
    `SELECT * FROM (SELECT id, role, content, photo, created_at FROM coach_messages WHERE user_id = $1 ORDER BY id DESC LIMIT $2) t
     ORDER BY id`,
    [userId, limit],
  );
  return rows.map((r) => ({ ...r, photo: photoUrl(r.photo) }));
}

/** Saves a chat message; a photo attachment is stored like a meal photo and owned by the same person. */
export async function addCoachMessage(
  userId: number,
  role: CoachMessage["role"],
  content: string,
  photo: PhotoData | null = null,
): Promise<number> {
  return transaction(async (conn) => {
    if (photo) {
      await conn.query("INSERT INTO photos (name, user_id, content_type, data, created_at) VALUES ($1, $2, $3, $4, $5)", [
        photo.name,
        userId,
        photo.contentType,
        photo.data,
        now(),
      ]);
    }
    const row = await one<{ id: number }>(
      "INSERT INTO coach_messages (user_id, role, content, photo, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [userId, role, content, photo?.name ?? null, now()],
      conn,
    );
    return row!.id;
  });
}

/** Reset: forgets the conversation and its photos. */
export async function clearCoach(userId: number) {
  await transaction(async (conn) => {
    const photos = await all<{ photo: string }>(
      "SELECT photo FROM coach_messages WHERE user_id = $1 AND photo IS NOT NULL",
      [userId],
      conn,
    );
    await run("DELETE FROM coach_messages WHERE user_id = $1", [userId], conn);
    if (photos.length) {
      await run(
        "DELETE FROM photos WHERE user_id = $1 AND name = ANY($2::text[]) AND NOT EXISTS (SELECT 1 FROM meals WHERE photo = photos.name)",
        [userId, photos.map((p) => p.photo)],
        conn,
      );
    }
  });
}

// ---------- AI settings ----------

/** keys maps a provider id to its encrypted API key (see lib/secrets.ts). */
export function getAiSettingsRow(userId: number): Promise<{ settings: unknown; keys: Record<string, string> } | undefined> {
  return one("SELECT settings, keys FROM ai_settings WHERE user_id = $1", [userId]);
}

export async function saveAiSettingsRow(userId: number, settings: unknown, keys: Record<string, string>) {
  await run(
    `INSERT INTO ai_settings (user_id, settings, keys) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET settings = excluded.settings, keys = excluded.keys`,
    [userId, JSON.stringify(settings), JSON.stringify(keys)],
  );
}

// ---------- Ranges for Progress and Coach ----------

export function getWaterRange(userId: number, fromDay: string, toDay: string): Promise<{ day: string; ml: number }[]> {
  return all("SELECT day, ml FROM water WHERE user_id = $1 AND day BETWEEN $2 AND $3 ORDER BY day", [userId, fromDay, toDay]);
}

export function getFastsSince(userId: number, fromIso: string): Promise<Fast[]> {
  return all(`SELECT ${FAST_COLS} FROM fasts WHERE user_id = $1 AND started_at >= $2 ORDER BY started_at`, [userId, fromIso]);
}

/** Detailed-nutrient totals per day, summed from each item's micros JSON. */
export async function getMicroTotals(
  userId: number,
  fromDay: string,
  toDay: string,
): Promise<Record<string, Record<string, number>>> {
  const rows = await all<{ day: string; key: string; total: number }>(
    `SELECT m.day, kv.key, SUM((kv.value)::text::double precision) AS total
     FROM meals m JOIN meal_items i ON i.meal_id = m.id, jsonb_each(i.micros) kv
     WHERE m.user_id = $1 AND m.day BETWEEN $2 AND $3 AND jsonb_typeof(kv.value) = 'number'
     GROUP BY m.day, kv.key`,
    [userId, fromDay, toDay],
  );
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) (out[r.day] ??= {})[r.key] = r.total;
  return out;
}
