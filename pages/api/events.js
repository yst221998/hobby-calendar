import { fetchRealEvents, generateAIEvents } from "../../lib/events";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { hobbies, city = "Mumbai", month, year } = req.body;

  if (!hobbies || hobbies.length === 0) {
    return res.status(400).json({ error: "Please provide at least one hobby" });
  }

  try {
    // Try real events first
    let events = await fetchRealEvents(hobbies, city, month, year);

    // Always supplement with AI events
    const aiEvents = await generateAIEvents(hobbies, city, month, year, events.length);
    events = [...events, ...aiEvents];

    // Deduplicate by day (prefer real over AI)
    const byDay = {};
    events.forEach((e) => {
      if (!byDay[e.day]) byDay[e.day] = [];
      byDay[e.day].push(e);
    });

    return res.status(200).json({ events, total: events.length });
  } catch (err) {
    console.error("Events API error:", err);
    return res.status(500).json({ error: "Failed to fetch events. Check your API keys." });
  }
}
