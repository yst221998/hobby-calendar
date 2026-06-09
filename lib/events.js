import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PLATFORM_MAP = [
  { name: "BookMyShow",  domains: ["bookmyshow.com"],          icon: "🎟️", searchUrl: (q) => `https://in.bookmyshow.com/search?q=${encodeURIComponent(q)}` },
  { name: "Insider.in",  domains: ["insider.in"],              icon: "⭐", searchUrl: (q) => `https://insider.in/search?q=${encodeURIComponent(q)}` },
  { name: "District",    domains: ["district.in"],             icon: "🏙️", searchUrl: (q) => `https://www.district.in/search?q=${encodeURIComponent(q)}` },
  { name: "Skillbox",    domains: ["skillbox.in","skillboxindia.com"], icon: "🎓", searchUrl: (q) => `https://www.skillbox.in/search?q=${encodeURIComponent(q)}` },
  { name: "Eventbrite",  domains: ["eventbrite.in","eventbrite.com"], icon: "🎪", searchUrl: (q) => `https://www.eventbrite.in/d/india--mumbai/${encodeURIComponent(q)}/` },
  { name: "Meetup",      domains: ["meetup.com"],              icon: "👥", searchUrl: (q) => `https://www.meetup.com/find/?keywords=${encodeURIComponent(q)}&location=Mumbai` },
  { name: "Dineout",     domains: ["dineout.co.in"],           icon: "🍽️", searchUrl: (q) => `https://www.dineout.co.in/mumbai-restaurants` },
  { name: "Cult.fit",    domains: ["cult.fit","cure.fit"],     icon: "🏃", searchUrl: (q) => `https://cult.fit/mumbai` },
];

function detectPlatform(link) {
  if (!link) return null;
  for (const p of PLATFORM_MAP) {
    if (p.domains.some((d) => link.includes(d))) return p;
  }
  return null;
}

function parseEventDay(event, year) {
  if (event.date?.start_date) {
    const d = new Date(event.date.start_date);
    if (!isNaN(d)) return d.getDate();
  }
  if (event.date?.when) {
    const match = event.date.when.match(/(\w+)\s+(\d{1,2})/);
    if (match) {
      const d = new Date(`${match[1]} ${match[2]} ${year}`);
      if (!isNaN(d)) return d.getDate();
    }
  }
  return Math.floor(Math.random() * 28) + 1;
}

function detectHobby(text, hobbies) {
  const lower = text.toLowerCase();
  for (const h of hobbies) {
    if (lower.includes(h.toLowerCase())) return h;
  }
  return hobbies[0];
}

// Run multiple targeted Google Events searches to pull from all platforms
export async function fetchRealEvents(hobbies, city, month, year) {
  const serpKey = process.env.SERPAPI_KEY;
  if (!serpKey) return [];

  const monthName = new Date(year, month, 1).toLocaleString("default", { month: "long" });
  const allEvents = [];
  const seen = new Set();

  // Build several search queries targeting different hobby clusters + platforms
  const hobbyChunks = [];
  for (let i = 0; i < hobbies.length; i += 2) {
    hobbyChunks.push(hobbies.slice(i, i + 2).join(" OR "));
  }
  // Also add platform-name queries so Google Events surfaces those listings
  const platformQueries = [
    "BookMyShow OR Insider.in events Mumbai",
    "District.in OR Eventbrite events Mumbai",
    "workshop OR class OR show OR concert Mumbai",
  ];

  const queries = [
    ...hobbyChunks.map((c) => `${c} events Mumbai ${monthName} ${year}`),
    ...platformQueries.map((p) => `${p} ${monthName} ${year}`),
  ].slice(0, 4); // cap at 4 SerpAPI calls to protect quota

  await Promise.all(
    queries.map(async (query) => {
      try {
        const url = `https://serpapi.com/search.json?engine=google_events&q=${encodeURIComponent(query)}&location=Mumbai,Maharashtra,India&api_key=${serpKey}&hl=en&gl=in`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data.events_results) return;

        data.events_results.forEach((event) => {
          const key = (event.title || "").toLowerCase().trim();
          if (seen.has(key) || !event.title) return;
          seen.add(key);

          const day = parseEventDay(event, year);
          const link = event.link || "";
          const platform = detectPlatform(link);

          // Only include events where we can link to the actual event page
          // i.e. the link is a deep link (has path beyond just the domain)
          const url = new URL(link.startsWith("http") ? link : "https://" + link);
          const isDeepLink = url.pathname && url.pathname.length > 1;

          const platformName = platform ? platform.name : "Google Events";
          const platformIcon = platform ? platform.icon : "🔍";
          // Use the actual event link if it's a deep link, otherwise build a search link
          const bookingUrl = (platform && isDeepLink)
            ? link
            : platform
              ? platform.searchUrl(event.title)
              : `https://www.google.com/search?q=${encodeURIComponent(event.title + " Mumbai tickets")}`;

          allEvents.push({
            day,
            name: event.title,
            venue: event.address?.[0] || city,
            time: event.date?.when || "Check listing",
            price: event.ticket_info?.[0]?.price || "See listing",
            platforms: [platformName],
            platformIcon,
            bookingLinks: { [platformName]: bookingUrl },
            source: "real",
            hobby: detectHobby(event.title + " " + (event.description || ""), hobbies),
          });
        });
      } catch (e) {
        console.error("SerpAPI fetch error:", e.message);
      }
    })
  );

  return allEvents;
}

// AI fallback — generate realistic events spread across all platforms
export async function generateAIEvents(hobbies, city, month, year, existingCount) {
  const monthName = new Date(year, month, 1).toLocaleString("default", { month: "long" });
  const needed = Math.max(14 - existingCount, 8);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prompt = `You are an event discovery assistant for Mumbai, India.

Generate ${needed} realistic upcoming events for ${monthName} ${year} in ${city} for someone interested in: ${hobbies.join(", ")}.

Rules:
- Use real, well-known Mumbai venues with their neighbourhood (e.g. "Blue Frog, Lower Parel")
- Realistic INR prices or "Free"
- Spread events evenly across ALL these platforms (use each at least once): BookMyShow, Insider.in, District, Skillbox, Eventbrite, Meetup, Dineout, Cult.fit
- Each event on a different day, spread across the month
- Make event names specific (e.g. "Sunset Rooftop Jazz Session" not just "Jazz Event")

Respond ONLY with a valid JSON array. No markdown, no explanation, no extra text.

Each object must have exactly these fields:
{
  "day": <number 1-${daysInMonth}>,
  "name": <specific event name string>,
  "venue": <real Mumbai venue, neighbourhood>,
  "time": <e.g. "7:00 PM">,
  "price": <e.g. "₹499" or "Free">,
  "hobby": <one of: ${hobbies.join(", ")}>,
  "platforms": [<exactly one platform name>],
  "platformIcon": <one relevant emoji>
}`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].text.replace(/```json|```/g, "").trim();
    const events = JSON.parse(text);

    return events.map((e) => {
      const platform = PLATFORM_MAP.find((p) => p.name === e.platforms?.[0]);
      return {
        ...e,
        source: "ai",
        bookingLinks: {
          [e.platforms?.[0]]: platform
            ? platform.searchUrl(e.name)
            : `https://www.google.com/search?q=${encodeURIComponent(e.name + " Mumbai")}`,
        },
      };
    });
  } catch (err) {
    console.error("AI generation error:", err);
    return [];
  }
}
