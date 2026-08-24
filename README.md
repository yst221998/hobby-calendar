# HobbyMap — Mumbai Metro Events Calendar

Discover bookable events in **Mumbai, Navi Mumbai, and Thane** based on your hobbies. Events are sourced from **BookMyShow** and **District** via SerpAPI site search, with optional Supabase caching. Every listed event is classified into one of those three cities; unknown or out-of-metro listings are excluded.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment file and add your keys:

   ```bash
   cp .env.example .env.local
   ```

   Required: `SERPAPI_KEY` from [serpapi.com](https://serpapi.com/).

3. Run the dev server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SERPAPI_KEY` | Yes | Powers Google site searches for BookMyShow and District |
| `SUPABASE_URL` | No | Supabase project URL for event caching |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Server-only key for cache read/write (never expose to browser) |
| `NEXT_PUBLIC_SUPABASE_URL` | No | Same project URL, exposed to browser for optional magic-link auth |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No | Supabase anon key for browser auth (safe for frontend) |
| `CRON_SECRET` | No | Bearer token for weekly Vercel Cron refresh endpoint |

Without Supabase, the app still works — it fetches live from SerpAPI every time. Without the `NEXT_PUBLIC_*` auth variables, guest search still works; sign-in and saved events are disabled.

## Supabase setup (caching + change log)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run the contents of [`supabase/schema.sql`](supabase/schema.sql) for a new project.
3. For an existing project, also run [`supabase/migrations/20260824_add_event_city.sql`](supabase/migrations/20260824_add_event_city.sql) **before** deploying code that writes `normalized_city`. This migration:
   - adds `events.normalized_city` and `saved_events.normalized_city` / `venue`
   - truncates `search_cache` (derived search results only)
   - deletes `events` rows that have no verified city
   - does **not** truncate `saved_events` or `user_preferences`
4. Copy **Project URL** and **service_role** key from Project Settings → API.
5. Add both to `.env.local` and to **Vercel Environment Variables**.
6. Redeploy on Vercel.

### What gets cached

- Each search (hobbies + month + year + optional preferred area) is stored for **7 days**.
- Repeat searches within 7 days load from Supabase instantly (no SerpAPI calls).
- Individual events are stored by URL with their performance dates and a verified `normalized_city` of `mumbai`, `navi_mumbai`, or `thane`.
- Events discovered by one user can be reused for another user searching the same hobbies and month, **only if those events are already classified into the Mumbai metro**.
- `search_cache.city` is a legacy column that stores the optional preferred area, not the event city.
- Empty searches and unclassified events are not cached.

### Supported hobbies

The app expands user-facing hobby labels into search aliases so broader interests still find events. Supported presets include:

- Fitness, Movies/Cinema, Wellness, Yoga, Art & Craft, Theatre, Food & Dining, Wine & Cocktails, Dance, Dating, Hiking, Books & Literature, Tech & Gaming, Music, Comedy, Photography

Users can select as many hobbies as they want. The backend caps search terms to avoid excessive SerpAPI usage while still covering all selected interests.

### Date change log

When a weekly refresh finds different dates for an event, a row is added to `event_changelog` with `old_days` and `new_days`.

View in Supabase: **Table Editor → event_changelog**.

## Optional accounts (magic-link sign-in)

Accounts are optional. Guests can search and build a calendar without signing in.

Signed-in users can:

- Save hobbies and an optional preferred area automatically
- Reload their saved calendar on return visits
- Mark events as **Interested** and view them in a saved events panel

### Supabase Auth setup

1. In Supabase **Authentication → Providers**, enable **Email** (magic link).
2. Set **Site URL** to your production URL (e.g. `https://your-app.vercel.app`).
3. Add `http://localhost:3000` under **Redirect URLs** for local development.
4. Run the user-account section of [`supabase/schema.sql`](supabase/schema.sql) if you already ran an older version (tables: `profiles`, `user_preferences`, `saved_events`).
5. Add to `.env.local` and Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL` — same as `SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from Project Settings → API (**anon public** key)
6. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Never put it in frontend code.

### Security notes

- Browser code uses only `NEXT_PUBLIC_SUPABASE_ANON_KEY` for auth.
- `/api/user/*` routes validate the user's bearer token on every request.
- User preferences and saved events use Row Level Security in Supabase.
- The shared `events` table stays global; saved events store URL references only.

## Weekly cron (Vercel)

[`vercel.json`](vercel.json) schedules `/api/cron/refresh-events` every **Sunday at 04:00 UTC**.

1. Set `CRON_SECRET` in Vercel env vars (any long random string).
2. Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` to cron routes.
3. The job re-fetches all cached searches, updates events, and logs date changes.

Manual test (replace values):

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-app.vercel.app/api/cron/refresh-events
```

## How events work

- Pick hobbies and optionally your Mumbai neighbourhood.
- The app searches BookMyShow and District for **individual event pages**.
- Listing pages, generic titles, and non-Mumbai cities are filtered out.
- Event pages are fetched when possible; if blocked, SerpAPI titles are kept as fallback (Dates TBD).
- Confirmed events with dates appear on the calendar; undated ones appear under **Dates TBD**.
- Shows with multiple dates in a month appear on multiple calendar days.

## Debugging empty results

To inspect the search pipeline, POST to `/api/events` with `"debug": true` in the body. The response includes counts such as searches run, organic results seen, candidates accepted, and final scheduled/TBD totals.

Empty searches are not written to Supabase cache, so a bad zero-result fetch will not be preserved for seven days.

## Booking

Tap any event to open its BookMyShow or District booking page in a new tab.
