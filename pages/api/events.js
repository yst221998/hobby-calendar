import { getEventsWithCache } from "../../lib/cache";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { hobbies, city = "Mumbai", month, year, debug: includeDebug = false } = req.body;

  if (!hobbies || hobbies.length === 0) {
    return res.status(400).json({ error: "Please provide at least one hobby" });
  }

  if (!process.env.SERPAPI_KEY) {
    return res.status(400).json({ error: "SERPAPI_KEY is not set. Add it to .env.local" });
  }

  try {
    const { events, scheduled, unscheduled, fromCache, cacheAgeMs, debug } =
      await getEventsWithCache(hobbies, city, month, year);

    const payload = {
      events,
      scheduled,
      unscheduled,
      total: events.length,
      sources: ["BookMyShow", "District"],
      fromCache: !!fromCache,
    };

    if (fromCache && cacheAgeMs != null) {
      payload.cacheAgeHours = Math.round(cacheAgeMs / (1000 * 60 * 60));
    }

    if (includeDebug && debug) {
      payload.debug = debug;
    }

    return res.status(200).json(payload);
  } catch (err) {
    console.error("Events API error:", err);
    return res.status(500).json({ error: err.message || "Failed to fetch events. Check your API keys." });
  }
}
