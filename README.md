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
- Event pages are fetched to read JSON-LD metadata for the **real show name** and **all performance dates** in the selected month.
- Shows with multiple dates appear on multiple calendar days.
- Events with a valid page but no date in the selected month appear under **Dates TBD this month**.
- Up to **4 hobbies × 2 platforms = 8 SerpAPI calls** per month load (10 results each).

## Booking

Tap any event to open its BookMyShow or District booking page in a new tab.
