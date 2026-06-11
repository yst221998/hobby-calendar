import { fetchRealEvents } from "../../lib/events";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { hobbies, city = "Mumbai", month, year } = req.body;

  if (!hobbies || hobbies.length === 0) {
    return res.status(400).json({ error: "Please provide at least one hobby" });
  }

  try {
    const events = await fetchRealEvents(hobbies, city, month, year);
    return res.status(200).json({
      events,
      total: events.length,
      message: events.length === 0
        ? "No events found with direct booking links for this month. Try different hobbies or check back later."
        : null
    });
  } catch (err) {
    console.error("Events API error:", err);
    return res.status(500).json({ error: "Failed to fetch events. Check your API keys." });
  }
}
