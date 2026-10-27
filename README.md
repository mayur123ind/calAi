# CalAi

A calorie and fitness tracker for you, your family or your team. Photograph your plate (up to 10 photos), describe it, say it, or scan a barcode. AI estimates calories, macros and detailed nutrients, and you review everything before logging.

- **Accounts**: sign up with a username and password; everyone's data is private to them
- **Today**: calories left on a thali ring, three nutrient cards you choose (protein, fiber, vitamin D…), fiber / sugar / sodium plus "View more" for 19 detailed nutrients, a swipeable week calendar, meals grouped or latest-first, one-tap "same as yesterday", optional water and fasting cards, and a + menu
- **Log a meal**: Photo & Scan (multi-photo camera, photo library, barcode), Describe, Voice (on-device or five speech services, each with its own language), Manual entry, and Saved meals (Recents, Frequent, Favourites with search, swipe actions and drag-to-reorder). Review nutrition with serving units (rotis, slices, cups; grams stay the source of truth), unlock to correct any number, and "What if?" to preview the day and ask AI for a suggestion. Failed analysis can be retried or cancelled
- **Coach**: a chat that remembers the conversation and sees your profile, food, weight, body fat, forecast, workouts and logged fasts (a missing log is never treated as a fast). Photo attachments, goal-aware suggested questions, long-press to copy, Reset to start over
- **Workouts**: a diary by day and week, sets / reps / weight / RPE without a timer, "same as last week", 876 exercises with photos and filters (free-exercise-db, public domain), and calculated workout burn
- **Progress**: weight, optional body fat and workout burn over 1W to All, with average and net change, calories and macro averages, a 30/60/90-day weight forecast, predicted vs observed weekly change, days to goal and under-logging detection
- **Goals**: six activity levels, target weight with a goal-reached alert, pinned macros (the rest auto-balance), Adaptive Goals (a weekly correction from your real weight trend), and optional detailed-nutrient goals you can set or AI-estimate
- **Meal prep**: plan the day's meals from what's in your kitchen, with grams, recipes and a shopping list
- **History & reports**: streaks, calendar, weekly AI insights, printable summary and CSV export
- **Account**: light / dark / system theme, week start, meal start times, Home cards, water, fasting, body fat, training preferences, reminders, **AI access** (bring your own key for Gemini, OpenAI, Claude, OpenRouter or Groq, with model, fallback model and custom instructions) and password
- **Admin**: see every account, reset passwords, turn accounts off, make admins, delete accounts

AI requests that hit an overload (429 / 503 / 529) are retried after 1 s, 2 s and 4 s, then handed to the fallback model. API keys people add are encrypted (AES-256-GCM) with `DATA_ENCRYPTION_KEY`, never sent back to the browser.

Data lives in a Supabase Postgres database, in its own `calai` schema (meal photos included). The app signs in as `calai_app`, a role that can read and write rows but not change tables. Every table has row-level security on, and Supabase's public API roles have no access to the schema.

## Signing in

`npm run db:setup` creates an admin account on an empty database and prints its random password once (or copies the accounts from an old `data/calai.db`, if one is there).

Sign in and change this password straight away under **Account → Change password**. Anyone who can reach the app can create their own account from the sign-in page. Admins manage accounts under **Admin**.

Passwords are stored as salted scrypt hashes. Sessions last 30 days. After 5 wrong passwords a username is locked for 15 minutes.

## Setup

1. Get a free key at [aistudio.google.com](https://aistudio.google.com) → **Get API key**.
2. Put it in `.env.local`:

   ```env
   GEMINI_API_KEY=your-key
   ```

   If `GEMINI_API_KEY` is already set in your Windows environment variables, that value is used instead of the file.

3. Connect the database. In Supabase, open **Connect → Direct → Session pooler** and copy the URI. Download the database certificate from **Database → Settings → SSL Configuration** into `certs/prod-ca-2021.crt`. Then add to `.env.local`:

   ```env
   # The app: a calai_app login with a long random password (setup creates the role from this)
   DATABASE_URL=postgresql://calai_app.<project-ref>:<random password>@<pooler host>:5432/postgres
   # Admin login, used only by npm run db:setup
   DATABASE_ADMIN_URL=postgresql://postgres.<project-ref>:<db password>@<pooler host>:5432/postgres
   ```

4. Add an encryption key for people's own AI keys: `DATA_ENCRYPTION_KEY=` followed by 32 random bytes in base64 (see `.env.example`).

5. Create the role and tables (safe to re-run, and re-run it after pulling schema changes):

   ```bash
   npm run db:setup
   ```

6. Start the app:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000 (or the port Next.js prints if 3000 is busy).

## Models

`GEMINI_MODEL` defaults to `gemini-flash-latest`, which always points at Google's current Flash model. When it is busy or out of free quota, the app switches to `GEMINI_FALLBACK_MODEL` (`gemini-flash-lite-latest`). Free-tier limits are shown in AI Studio under rate limits. On the free tier Google may use your requests to improve its products.

## Using it from your phone

Your phone must be on the same Wi-Fi as this PC.

1. Make sure the admin password has been changed (see [Signing in](#signing-in)).
2. Run the production server, listening on your network:

   ```bash
   npm run start:phone
   ```

3. On the PC, run `ipconfig` and note the IPv4 address (e.g. `192.168.1.20`).
4. On the phone open `http://192.168.1.20:3000`, sign in or create an account, then use **Add to Home Screen**.

Windows may ask to allow Node.js through the firewall; allow it on private networks only.

Browsers only allow the live barcode camera and pop-up reminder notifications on `https` or `localhost`. Over plain `http` on your Wi-Fi, use **Photo of barcode** instead (it works everywhere), and reminders show as a banner on the Today screen.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run start:phone` | Build, then serve on your local network |
| `npm run db:setup` | Create the `calai_app` role, apply `db/schema.sql`, and copy data from `data/calai.db` into an empty database |
| `npm run lint` / `npm run typecheck` | Checks |

## Backup

Paid Supabase plans keep daily backups (**Database → Backups**). On the free plan, take your own with `pg_dump "<DATABASE_ADMIN_URL>" --schema=calai -f calai-backup.sql` and keep the file outside this folder. The old SQLite file in `data/` is no longer used once its data has been copied.
