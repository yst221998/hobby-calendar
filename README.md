# HobbyMap — Mumbai Events Calendar

Discover bookable events in Mumbai based on your hobbies. Events are sourced from **BookMyShow** and **District** via SerpAPI site search, with optional Supabase caching.

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
| `CRON_SECRET` | No | Bearer token for weekly Vercel Cron refresh endpoint |

Without Supabase, the app still works — it fetches live from SerpAPI every time.

## Supabase setup (caching + change log)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run the contents of [`supabase/schema.sql`](supabase/schema.sql).
3. Copy **Project URL** and **service_role** key from Project Settings → API.
4. Add both to `.env.local` and to **Vercel Environment Variables**.
5. Redeploy on Vercel.

### What gets cached

- Each search (hobbies + month + year + city) is stored for **7 days**.
- Repeat searches within 7 days load from Supabase instantly (no SerpAPI calls).
- Individual events are stored by URL with their performance dates.

### Date change log

When a weekly refresh finds different dates for an event, a row is added to `event_changelog` with `old_days` and `new_days`.

View in Supabase: **Table Editor → event_changelog**.

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

## Booking

Tap any event to open its BookMyShow or District booking page in a new tab.
