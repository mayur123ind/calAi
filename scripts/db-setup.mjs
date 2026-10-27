// One-time / repeatable database setup for Supabase. Run with: npm run db:setup
//
// 1. Creates (or re-passwords) the app's runtime role from the user/password in DATABASE_URL.
// 2. Applies db/schema.sql, which is safe to re-run.
// 3. If the Postgres database has no users yet, copies everything from the old ./data/calai.db,
//    or creates an admin account with a random password when there is nothing to copy.
//
// Connects with DATABASE_ADMIN_URL (the "postgres" user); the app itself never uses that.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";

const ROOT = process.cwd();
const APP_ROLE = "calai_app";
const SQLITE_FILE = path.join(ROOT, "data", "calai.db");
const PHOTO_DIR = path.join(ROOT, "data", "photos");
const PHOTO_TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

for (const name of ["DATABASE_ADMIN_URL", "DATABASE_URL"]) {
  if (!process.env[name]) throw new Error(`${name} is not set in .env.local`);
}
const appUrl = new URL(process.env.DATABASE_URL);
// Supabase's pooler wants "<role>.<project ref>" as the user name.
if (appUrl.username.split(".")[0] !== APP_ROLE) {
  throw new Error(`DATABASE_URL must sign in as ${APP_ROLE}, not the admin user`);
}
const appPassword = decodeURIComponent(appUrl.password);
if (appPassword.length < 20) throw new Error("The calai_app password must be at least 20 characters");

const admin = new pg.Client({
  connectionString: process.env.DATABASE_ADMIN_URL,
  ssl: { ca: fs.readFileSync(path.join(ROOT, "certs", "prod-ca-2021.crt"), "utf8") },
});
await admin.connect();

try {
  // ---------- Role ----------
  const { rowCount } = await admin.query("select 1 from pg_roles where rolname = $1", [APP_ROLE]);
  const password = admin.escapeLiteral(appPassword);
  await admin.query(
    rowCount
      ? `alter role ${APP_ROLE} with login password ${password}`
      : `create role ${APP_ROLE} with login password ${password} nosuperuser nocreatedb nocreaterole noinherit`,
  );
  console.log(rowCount ? `Role ${APP_ROLE}: password updated` : `Role ${APP_ROLE}: created`);

  // ---------- Schema ----------
  await admin.query(fs.readFileSync(path.join(ROOT, "db", "schema.sql"), "utf8"));
  console.log("Schema applied");

  // ---------- Data ----------
  const { rows } = await admin.query("select count(*)::int as n from calai.users");
  if (rows[0].n > 0) {
    console.log(`Database already has ${rows[0].n} user(s); nothing copied`);
  } else if (fs.existsSync(SQLITE_FILE)) {
    await copyFromSqlite();
  } else {
    const pw = crypto.randomBytes(12).toString("base64url");
    await admin.query(
      "insert into calai.users (username, password_hash, role, created_at) values ('admin', $1, 'admin', $2)",
      [hashPassword(pw), new Date().toISOString()],
    );
    console.log(`Created user "admin" with password: ${pw}  (change it after signing in)`);
  }
} finally {
  await admin.end();
}

async function copyFromSqlite() {
  const lite = new DatabaseSync(SQLITE_FILE, { readOnly: true });
  const all = (sql) => lite.prepare(sql).all();
  const counts = {};

  async function insert(table, cols, records, { identity = false, casts = {} } = {}) {
    const placeholders = cols.map((c, i) => `$${i + 1}${casts[c] ?? ""}`).join(", ");
    const sql = `insert into calai.${table} (${cols.join(", ")}) ${identity ? "overriding system value " : ""}values (${placeholders})`;
    for (const r of records) await admin.query(sql, cols.map((c) => r[c]));
    counts[table] = records.length;
  }

  await admin.query("begin");
  try {
    await insert(
      "users",
      ["id", "username", "password_hash", "role", "disabled", "created_at", "last_seen_at"],
      all("select * from users").map((u) => ({ ...u, disabled: u.disabled === 1 })),
      { identity: true },
    );
    await insert("sessions", ["id", "user_id", "expires_at"], all("select * from sessions"));

    // Photo files referenced by meals move into the photos table; missing files are dropped.
    const meals = all("select * from meals");
    const photos = new Map();
    for (const m of meals) {
      if (!m.photo || photos.has(m.photo)) continue;
      const file = path.join(PHOTO_DIR, m.photo);
      if (!fs.existsSync(file)) continue;
      photos.set(m.photo, {
        name: m.photo,
        user_id: m.user_id,
        content_type: PHOTO_TYPES[m.photo.split(".").pop()],
        data: fs.readFileSync(file),
        created_at: new Date().toISOString(),
      });
    }
    await insert("photos", ["name", "user_id", "content_type", "data", "created_at"], [...photos.values()]);
    await insert(
      "meals",
      ["id", "user_id", "day", "eaten_at", "meal_type", "note", "photo"],
      meals.map((m) => ({ ...m, photo: photos.has(m.photo) ? m.photo : null })),
      { identity: true },
    );
    await insert(
      "meal_items",
      ["id", "meal_id", "name", "grams", "calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "sodium_mg"],
      all("select * from meal_items"),
      { identity: true },
    );
    await insert("weights", ["user_id", "day", "kg"], all("select * from weights"));
    await insert("user_settings", ["user_id", "profile", "prefs", "pantry"], all("select * from user_settings"), {
      casts: { profile: "::jsonb", prefs: "::jsonb", pantry: "::jsonb" },
    });
    await insert("water", ["user_id", "day", "ml"], all("select * from water"));
    await insert("favorites", ["id", "user_id", "name", "meal_type", "items", "created_at"], all("select * from favorites"), {
      identity: true,
      casts: { items: "::jsonb" },
    });
    await insert("insights", ["user_id", "day", "body"], all("select * from insights"), { casts: { body: "::jsonb" } });
    await insert("meal_plans", ["id", "user_id", "day", "created_at", "plan"], all("select * from meal_plans"), {
      identity: true,
      casts: { plan: "::jsonb" },
    });

    // Copied rows kept their ids, so move each id counter past them.
    for (const t of ["users", "meals", "meal_items", "favorites", "meal_plans"]) {
      await admin.query(
        `select setval(pg_get_serial_sequence('calai.${t}', 'id'), coalesce((select max(id) from calai.${t}), 0) + 1, false)`,
      );
    }
    await admin.query("commit");
  } catch (e) {
    await admin.query("rollback");
    throw e;
  } finally {
    lite.close();
  }
  console.log("Copied from data/calai.db:", counts);
}

// Same format as lib/password.ts: "scrypt:<salt hex>:<hash hex>".
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return `scrypt:${salt.toString("hex")}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}
