import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Fetch real events from Google via SerpAPI
export async function fetchRealEvents(hobbies, city, month, year) {
  const serpKey = process.env.SERPAPI_KEY;
  if (!serpKey) return [];

  const monthName = new Date(year, month, 1).toLocaleString("default", { month: "long" });
  const allEvents = [];

  // Query SerpAPI for each hobby cluster (batch to save quota)
  const hobbyQuery = hobbies.slice(0, 3).join(" OR ");
  const query = `${hobbyQuery} events in Mumbai ${monthName} ${year}`;

  try {
    const url = `https://serpapi.com/search.json?engine=google_events&q=${encodeURIComponent(query)}&location=Mumbai,Maharashtra,India&api_key=${serpKey}&hl=en&gl=in`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.events_results) {
      data.events_results.forEach((event) => {
        // Parse date
        let day = null;
        if (event.date?.start_date) {
          const d = new Date(event.date.start_date);
          if (!isNaN(d)) day = d.getDate();
        } else if (event.date?.when) {
          const match = event.date.when.match(/(\w+ \d+)/);
          if (match) {
            const d = new Date(`${match[1]} ${year}`);
            if (!isNaN(d)) day = d.getDate();
          }
        }
        if (!day) day = Math.floor(Math.random() * 28) + 1;

        // Detect platform
        const title = (event.title || "").toLowerCase();
        const desc = (event.description || "").toLowerCase();
        const link = event.link || "";
        let platforms = [];
        if (link.includes("bookmyshow") || desc.includes("bookmyshow")) platforms.push("BookMyShow");
        if (link.includes("insider") || desc.includes("insider")) platforms.push("Insider.in");
        if (link.includes("district") || desc.includes("district")) platforms.push("District");
        if (platforms.length === 0) platforms.push("Google Events");

        allEvents.push({
          day,
          name: event.title || "Event",
          venue: event.address?.[0] || "Mumbai",
          time: event.date?.when || "Check listing",
          price: event.ticket_info?.[0]?.price || "See listing",
          platforms,
          bookingLinks: {
            "Google Events": event.link || "https://www.google.com/search?q=" + encodeURIComponent(event.title + " Mumbai"),
            BookMyShow: "https://in.bookmyshow.com/explore/events-mumbai",
            "Insider.in": "https://insider.in/mumbai",
            District: "https://www.district.in",
          },
          source: "real",
          hobby: detectHobby(event.title + " " + (event.description || ""), hobbies),
        });
      });
    }
  } catch (e) {
    console.error("SerpAPI error:", e);
  }

  return allEvents;
}

function detectHobby(text, hobbies) {
  const lower = text.toLowerCase();
  for (const h of hobbies) {
    if (lower.includes(h.toLowerCase())) return h;
  }
  return hobbies[0];
}

// Generate AI events as fallback/supplement
export async function generateAIEvents(hobbies, city, month, year, existingCount) {
  const monthName = new Date(year, month, 1).toLocaleString("default", { month: "long" });
  const needed = Math.max(10 - existingCount, 6);

  const prompt = `You are an event discovery assistant for Mumbai, India.

Generate ${needed} realistic upcoming events for ${monthName} ${year} in ${city} for someone interested in: ${hobbies.join(", ")}.

Use real Mumbai venues, realistic prices in INR, and accurate platform names (BookMyShow, Insider.in, District, Dineout, Cult.fit).

Respond ONLY with a JSON array. No markdown, no explanation. Each object must have:
- day: number (1-${new Date(year, month + 1, 0).getDate()})
- name: string (event name)
- venue: string (real Mumbai venue + neighbourhood)
- time: string (e.g. "7:00 PM")
- price: string (e.g. "₹499" or "Free")
- hobby: string (one of: ${hobbies.join(", ")})
- platforms: array of strings (1-2 from: BookMyShow, Insider.in, District, Dineout, Cult.fit)

Spread events across different days. Make names specific and real-sounding.`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].text.replace(/```json|```/g, "").trim();
    const events = JSON.parse(text);

    return events.map((e) => ({
      ...e,
      source: "ai",
      bookingLinks: buildBookingLinks(e.platforms, e.name),
    }));
  } catch (err) {
    console.error("AI generation error:", err);
    return [];
  }
}

function buildBookingLinks(platforms, eventName) {
  const links = {};
  const q = encodeURIComponent(eventName + " Mumbai");
  platforms.forEach((p) => {
    if (p === "BookMyShow") links[p] = `https://in.bookmyshow.com/search?q=${q}`;
    else if (p === "Insider.in") links[p] = `https://insider.in/search?q=${q}`;
    else if (p === "District") links[p] = `https://www.district.in`;
    else if (p === "Dineout") links[p] = `https://www.dineout.co.in/mumbai`;
    else if (p === "Cult.fit") links[p] = `https://cult.fit`;
    else links[p] = `https://www.google.com/search?q=${q}`;
  });
  return links;
}
