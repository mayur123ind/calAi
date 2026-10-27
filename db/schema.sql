-- CalAI schema for Supabase Postgres. Safe to re-run; applied by `npm run db:setup`.
--
-- Tables live in their own "calai" schema, which Supabase's Data API does not expose.
-- RLS is on as a second lock: only the app's own role (calai_app) has a policy, so the
-- public anon/authenticated keys see nothing even if the schema is exposed later.
-- Per-person filtering (user_id = ...) is done in lib/db.ts, the only module that queries these tables.

create schema if not exists calai;

create table if not exists calai.users (
  id integer generated always as identity primary key,
  username text not null,
  password_hash text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  disabled boolean not null default false,
  created_at text not null,
  last_seen_at text
);
create unique index if not exists users_username on calai.users (lower(username));

create table if not exists calai.sessions (
  id text primary key,
  user_id integer not null references calai.users (id) on delete cascade,
  expires_at text not null
);
create index if not exists sessions_user on calai.sessions (user_id);

-- Meal photo thumbnails (240px JPEG, ~15 KB each). meals.photo holds the name.
create table if not exists calai.photos (
  name text primary key,
  user_id integer not null references calai.users (id) on delete cascade,
  content_type text not null,
  data bytea not null,
  created_at text not null
);
create index if not exists photos_user on calai.photos (user_id);

create table if not exists calai.meals (
  id integer generated always as identity primary key,
  user_id integer not null references calai.users (id) on delete cascade,
  day text not null,
  eaten_at text not null,
  meal_type text not null,
  note text,
  photo text references calai.photos (name)
);
create index if not exists meals_user_day on calai.meals (user_id, day);
create index if not exists meals_photo on calai.meals (photo);

create table if not exists calai.meal_items (
  id integer generated always as identity primary key,
  meal_id integer not null references calai.meals (id) on delete cascade,
  name text not null,
  grams double precision not null,
  calories double precision not null,
  protein_g double precision not null,
  carbs_g double precision not null,
  fat_g double precision not null,
  fiber_g double precision not null default 0,
  sugar_g double precision not null default 0,
  sodium_mg double precision not null default 0
);
create index if not exists meal_items_meal on calai.meal_items (meal_id);

create table if not exists calai.weights (
  user_id integer not null references calai.users (id) on delete cascade,
  day text not null,
  kg double precision not null,
  primary key (user_id, day)
);

create table if not exists calai.user_settings (
  user_id integer primary key references calai.users (id) on delete cascade,
  profile jsonb,
  prefs jsonb,
  pantry jsonb
);

create table if not exists calai.water (
  user_id integer not null references calai.users (id) on delete cascade,
  day text not null,
  ml integer not null,
  primary key (user_id, day)
);

create table if not exists calai.favorites (
  id integer generated always as identity primary key,
  user_id integer not null references calai.users (id) on delete cascade,
  name text not null,
  meal_type text not null,
  items jsonb not null,
  created_at text not null
);
create index if not exists favorites_user on calai.favorites (user_id);

create table if not exists calai.insights (
  user_id integer not null references calai.users (id) on delete cascade,
  day text not null,
  body jsonb not null,
  primary key (user_id, day)
);

create table if not exists calai.meal_plans (
  id integer generated always as identity primary key,
  user_id integer not null references calai.users (id) on delete cascade,
  day text not null,
  created_at text not null,
  plan jsonb not null
);
create index if not exists meal_plans_user on calai.meal_plans (user_id, created_at);

-- ---------- Version 2: detailed nutrients, serving units, tracking, workouts, coach ----------

-- Detailed nutrients (sparse JSON, see lib/nutrients.ts) and a visible serving unit per item.
alter table calai.meal_items add column if not exists micros jsonb;
alter table calai.meal_items add column if not exists unit text;
alter table calai.meal_items add column if not exists unit_grams double precision;

-- Favourites can be dragged into the order people want.
alter table calai.favorites add column if not exists position integer not null default 0;

create table if not exists calai.body_fat (
  user_id integer not null references calai.users (id) on delete cascade,
  day text not null,
  pct double precision not null,
  primary key (user_id, day)
);

-- Fasting sessions. Only explicitly logged fasts count as fasting; a day without meals does not.
create table if not exists calai.fasts (
  id integer generated always as identity primary key,
  user_id integer not null references calai.users (id) on delete cascade,
  started_at text not null,
  ended_at text,
  goal_hours double precision not null
);
create index if not exists fasts_user on calai.fasts (user_id, started_at);
create unique index if not exists fasts_one_active on calai.fasts (user_id) where ended_at is null;

-- Workout diary: exercises planned for a day, and the sets logged against each.
create table if not exists calai.workout_entries (
  id integer generated always as identity primary key,
  user_id integer not null references calai.users (id) on delete cascade,
  day text not null,
  exercise_id text not null,
  position integer not null default 0,
  note text,
  created_at text not null
);
create index if not exists workout_entries_user_day on calai.workout_entries (user_id, day);

create table if not exists calai.workout_sets (
  id integer generated always as identity primary key,
  entry_id integer not null references calai.workout_entries (id) on delete cascade,
  position integer not null default 0,
  reps integer,
  weight_kg double precision,
  rpe double precision,
  minutes double precision,
  done boolean not null default false
);
create index if not exists workout_sets_entry on calai.workout_sets (entry_id);

-- Calculated workout burn per day, kept so it can be reviewed or deleted in Progress.
create table if not exists calai.burns (
  user_id integer not null references calai.users (id) on delete cascade,
  day text not null,
  kcal double precision not null,
  details jsonb not null,
  created_at text not null,
  primary key (user_id, day)
);

create table if not exists calai.coach_messages (
  id integer generated always as identity primary key,
  user_id integer not null references calai.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  photo text references calai.photos (name) on delete set null,
  created_at text not null
);
create index if not exists coach_messages_user on calai.coach_messages (user_id, id);

-- AI provider choices, plus API keys encrypted by the app (AES-256-GCM, key in DATA_ENCRYPTION_KEY).
create table if not exists calai.ai_settings (
  user_id integer primary key references calai.users (id) on delete cascade,
  settings jsonb not null,
  keys jsonb not null default '{}'::jsonb
);

-- ---------- Access ----------

revoke all on schema calai from public, anon, authenticated;
revoke all on all tables in schema calai from public, anon, authenticated;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'calai' loop
    execute format('alter table calai.%I enable row level security', t);
    execute format('alter table calai.%I force row level security', t);
    execute format('drop policy if exists "calai_app: all" on calai.%I', t);
    execute format('create policy "calai_app: all" on calai.%I for all to calai_app using (true) with check (true)', t);
  end loop;
end $$;

grant usage on schema calai to calai_app;
grant select, insert, update, delete on all tables in schema calai to calai_app;
grant usage on all sequences in schema calai to calai_app;
alter role calai_app set search_path = calai;
