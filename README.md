# HobbyMap — Mumbai Events Calendar

Discover bookable events in Mumbai based on your hobbies. Events are sourced from **BookMyShow** and **District** via SerpAPI site search.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment file and add your SerpAPI key:

   ```bash
   cp .env.example .env.local
   ```

   Get a key at [serpapi.com](https://serpapi.com/).

3. Run the dev server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SERPAPI_KEY` | Yes | Powers Google site searches for BookMyShow and District |

## How events work

- Pick hobbies and optionally your Mumbai neighbourhood.
- The app searches BookMyShow and District for matching **individual event pages** (not venue or category listings).
- Listing pages, generic titles, and non-Mumbai cities are filtered out automatically.
- Events with a confirmed date appear on the calendar grid.
- Events without a parseable date appear under **Dates TBD this month** (never on random days).
- Deep-link event pages may be fetched to extract dates from JSON-LD metadata.

## Booking

Tap any event to open its BookMyShow or District booking page in a new tab.
