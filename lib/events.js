import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Platform search configs — each gets its own targeted SerpAPI query
const PLATFORMS = [
  {
    name: "BookMyShow",
    searchSuffix: "site:in.bookmyshow.com",
    baseUrl: "https://in.bookmyshow.com",
    searchUrl: (q) => `https://in.bookmyshow.com/search?q=${encodeURIComponent(q)}`,
    icon: "🎟️",
  },
  {
    name: "Insider.in",
    searchSuffix: "site:insider.in",
    baseUrl: "https://insider.in",
    searchUrl: (q) => `https://insider.in/search?q=${encodeURIComponent(q)}`,
    icon: "⭐",
  },
  {
    name: "District",
    searchSuffix: "site:district.in",
    baseUrl: "https://www.district.in",
    searchUrl: (q) => `https://www.district.in/search?q=${encodeURIComponent(q)}`,
    icon: "🏙️",
  },
  {
    name: "Skillbox",
    searchSuffix: "site:skillbox.in OR site:skillboxindia.com",
    baseUrl: "https://www.skillbox.in",
    searchUrl: (q) => `https://www.skillbox.in/search?q=${encodeURIComponent(q)}`,
    icon: "🎓",
  },
  {
    name: "Eventbrite",
    searchSuffix: "site:eventbrite.in",
    baseUrl: "https://www.eventbrite.in",
    searchUrl: (q) => `https://www.eventbrite.in/d/india--mumbai/${encodeURIComponent(q)}/`,
    icon: "🎪",
  },
  {
    name: "Meetup",
    searchSuffix: "site:meetup.com",
    baseUrl: "https://www.meetup.com",
    searchUrl: (q) => `https://www.meetup.com/find/?keywords=${encodeURIComponent(q)}&location=Mumbai`,
    icon: "👥",
  },
];

// Fetch real events from Google via SerpAPI — one query per platform
export async function fetchRealEvents(hobbies, city, month, year) {
  const serpKey = process.env.SERPAPI_KEY;
  if (!serpKey) return [];

  const monthName = new Date(year, month, 1).toLocaleString("default", { month: "long" });
  const hobbyQuery = hobbies.slice(0, 3).join(" OR ");
  const allEvents = [];

  // Run platform-specific searches in parallel (up to 3 to save API quota)
  const platformsToSearch = PLATFORMS.slice(0, 3);

  await Promise.all(
    platformsToSearch.map(async (platform) => {
      try {
        // First try Google Events engine for rich structured data
        const eventsQuery = `${hobbyQuery} events Mumbai ${monthName} ${year}`;
        const eventsUrl = `https://serpapi.com/search.json?engine=google_events&q=${encodeURIComponent(eventsQuery)}&location=Mumbai,Maharashtra,India&api_key=${serpKey}&hl=en&gl=in`;
        const eventsRes = await fetch(eventsUrl);
        const eventsData = await eventsRes.json();

        if (eventsData.events_results?.length > 0) {
          eventsData.events_results.forEach((event) => {
            const link = event.link || "";
            // Only include if it matches this platform
            if (!link.includes(platform.baseUrl.replace("https://", "").replace("www.", ""))) return;

            const day = parseEventDay(event, year);
            allEvents.push(buildRealEvent(event, day, platform, hobbies));
          });
        }

        // Also do a regular Google search for platform-specific listings
        const searchQuery = `${hobbyQuery} events Mumbai ${monthName} ${year} ${platform.searchSuffix}`;
        const searchUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(searchQuery)}&api_key=${serpKey}&hl=en&gl=in&num=5`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();

        if (searchData.organic_results?.length > 0) {
          searchData.organic_results.slice(0, 3).forEach((result) => {
            // Extract a day from the snippet if possible
            const day = extractDayFromText(result.snippet || result.title || "", month, year);
            allEvents.push({
              day,
              name: cleanTitle(result.title || "Event"),
              venue: extractVenue(result.snippet || "") || city,
              time: extractTime(result.snippet || "") || "Check listing",
              price: extractPrice(result.snippet || "") || "See listing",
              platforms: [platform.name],
              bookingLinks: { [platform.name]: result.link || platform.searchUrl(hobbyQuery) },
              source: "real",
              hobby: detectHobby(result.title + " " + (result.snippet || ""), hobbies),
              platformIcon: platform.icon,
            });
          });
        }
      } catch (e) {
        console.error(`Error fetching from ${platform.name}:`, e);
      }
    })
  );

  // Also run a general Google Events search to catch anything missed
  try {
    const generalUrl = `https://serpapi.com/search.json?engine=google_events&q=${encodeURIComponent(`${hobbyQuery} events Mumbai ${monthName} ${year}`)}&location=Mumbai,Maharashtra,India&api_key=${serpKey}&hl=en&gl=in`;
    const generalRes = await fetch(generalUrl);
    const generalData = await generalRes.json();

    if (generalData.events_results) {
      generalData.events_results.forEach((event) => {
        const day = parseEventDay(event, year);
        const link = event.link || "";
        const detectedPlatform = detectPlatformFromLink(link);
        allEvents.push({
          day,
          name: event.title || "Event",
          venue: event.address?.[0] || city,
          time: event.date?.when || "Check listing",
          price: event.ticket_info?.[0]?.price || "See listing",
          platforms: [detectedPlatform.name],
          bookingLinks: { [detectedPlatform.name]: link || detectedPlatform.searchUrl(event.title || hobbyQuery) },
          source: "real",
          hobby: detectHobby(event.title + " " + (event.description || ""), hobbies),
          platformIcon: detectedPlatform.icon,
        });
      });
    }
  } catch (e) {
    console.error("General SerpAPI error:", e);
  }

  // Deduplicate by event name
  const seen = new Set();
  return allEvents.filter((e) => {
    const key = e.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Helper: parse day from SerpAPI event object
function parseEventDay(event, year) {
  if (event.date?.start_date) {
    const d = new Date(event.date.start_date);
    if (!isNaN(d)) return d.getDate();
  }
  if (event.date?.when) {
    const match = event.date.when.match(/(\w+)\s+(\d+)/);
    if (match) {
      const d = new Date(`${match[1]} ${match[2]} ${year}`);
      if (!isNaN(d)) return d.getDate();
    }
  }
  return Math.floor(Math.random() * 28) + 1;
}

// Helper: build a real event object from Google Events result
function buildRealEvent(event, day, platform, hobbies) {
  return {
    day,
    name: event.title || "Event",
    venue: event.address?.[0] || "Mumbai",
    time: event.date?.when || "Check listing",
    price: event.ticket_info?.[0]?.price || "See listing",
    platforms: [platform.name],
    bookingLinks: { [platform.name]: event.link || platform.searchUrl(event.title || "") },
    source: "real",
    hobby: detectHobby(event.title + " " + (event.description || ""), hobbies),
    platformIcon: platform.icon,
  };
}

// Helper: detect platform from a URL
function detectPlatformFromLink(link) {
  for (const p of PLATFORMS) {
    if (link.includes(p.baseUrl.replace("https://", "").replace("www.", ""))) return p;
  }
  return { name: "Google Events", searchUrl: (q) => `https://www.google.com/search?q=${encodeURIComponent(q + " Mumbai")}`, icon: "🔍" };
}

// Helper: extract day number from free text
function extractDayFromText(text, month, year) {
  const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const monthName = months[month];
  const regex = new RegExp(`(${monthName}\\w*\\s+(\\d{1,2}))|(\\d{1,2})\\s+${monthName}`, "i");
  const match = text.match(regex);
  if (match) {
    const day = parseInt(match[2] || match[3]);
    if (day >= 1 && day <= 31) return day;
  }
  // Try just finding a standalone number 1-31
  const numMatch = text.match(/\b([1-9]|[12]\d|3[01])\b/);
  if (numMatch) return parseInt(numMatch[1]);
  return Math.floor(Math.random() * 28) + 1;
}

function extractVenue(text) {
  const match = text.match(/at\s+([A-Z][^,.]+)/);
  return match ? match[1].trim() : null;
}

function extractTime(text) {
  const match = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))\b/);
  return match ? match[1] : null;
}

function extractPrice(text) {
  const match = text.match(/₹\s*[\d,]+|Rs\.?\s*[\d,]+|free/i);
  return match ? match[0] : null;
}

function cleanTitle(title) {
  return title.replace(/\s*[-|]\s*(BookMyShow|Insider|District|Eventbrite|Meetup).*$/i, "").trim();
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
  const needed = Math.max(12 - existingCount, 6);

  const prompt = `You are an event discovery assistant for Mumbai, India.

Generate ${needed} realistic upcoming events for ${monthName} ${year} in ${city} for someone interested in: ${hobbies.join(", ")}.

Use real Mumbai venues, realistic prices in INR. Spread events across ALL these platforms: BookMyShow, Insider.in, District, Skillbox, Eventbrite, Meetup, Dineout, Cult.fit. Use a mix — don't use the same platform twice in a row.

Respond ONLY with a JSON array. No markdown, no explanation. Each object must have:
- day: number (1-${new Date(year, month + 1, 0).getDate()})
- name: string (specific event name)
- venue: string (real Mumbai venue + neighbourhood)
- time: string (e.g. "7:00 PM")
- price: string (e.g. "₹499" or "Free")
- hobby: string (one of: ${hobbies.join(", ")})
- platforms: array with exactly 1-2 platform names
- platformIcon: string (relevant emoji)

Spread events across different days. Make names specific and real-sounding for Mumbai.`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
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
    const platform = PLATFORMS.find((pl) => pl.name === p);
    if (platform) links[p] = platform.searchUrl(eventName);
    else if (p === "Dineout") links[p] = `https://www.dineout.co.in/mumbai`;
    else if (p === "Cult.fit") links[p] = `https://cult.fit/mumbai`;
    else links[p] = `https://www.google.com/search?q=${q}`;
  });
  return links;
}
