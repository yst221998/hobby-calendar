import { fetchRealEvents } from "../../lib/events";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { hobbies, city = "Mumbai", month, year } = req.body;

  if (!hobbies || hobbies.length === 0) {
    return res.status(400).json({ error: "Please provide at least one hobby" });
  }

  if (!process.env.SERPAPI_KEY) {
    return res.status(400).json({ error: "SERPAPI_KEY is not set. Add it to .env.local" });
  }

  try {
    const { events, scheduled, unscheduled } = await fetchRealEvents(hobbies, city, month, year);
    return res.status(200).json({
      events,
      scheduled,
      unscheduled,
      total: events.length,
      sources: ["BookMyShow", "District"],
    });
  } catch (err) {
    console.error("Events API error:", err);
    return res.status(500).json({ error: err.message || "Failed to fetch events. Check your API keys." });
  }
}
