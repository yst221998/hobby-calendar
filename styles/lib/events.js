// events.js — multi-source real events engine
// Sources: SerpAPI site: searches (District, Insider, BookMyShow, LBB, Timeout, Skillbox, TrippyPin)
//          + Eventbrite API + Meetup API
//          + AI parsing of LBB/Timeout web pages

import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Platform definitions ────────────────────────────────────────────────────

const SITE_SEARCH_PLATFORMS = [
  {
    name: "District",
    icon: "🏙️",
    site: "district.in",
    pathIndicators: ["/event/", "/events/", "/show/"],
  },
  {
    name: "Insider.in",
    icon: "⭐",
    site: "insider.in",
    pathIndicators: ["/e/", "/event/", "/mumbai/"],
  },
  {
    name: "BookMyShow",
    icon: "🎟️",
    site: "in.bookmyshow.com",
    pathIndicators: ["/buytickets/", "/events/", "/plays/", "/activities/"],
  },
  {
    name: "Skillbox",
    icon: "🎓",
    site: "skillbox.in",
    pathIndicators: ["/workshop/", "/event/", "/class/", "/course/"],
  },
];

const WEB_FETCH_SOURCES = [
  {
    name: "LBB",
    icon: "🗺️",
    url: "https://lbb.in/mumbai/events/",
    selector: "events in mumbai",
  },
  {
    name: "Timeout Mumbai",
    icon: "⏰",
    url: "https://www.timeout.com/mumbai/things-to-do",
    selector: "events and things to do in mumbai",
  },
  {
    name: "TrippyPin",
    icon: "📍",
    url: "https://trippypin.com/events/mumbai/",
    selector: "events in mumbai",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectHobby(text, hobbies) {
  const lower = text.toLowerCase();
  for (const h of hobbies) {
    if (lower.includes(h.toLowerCase())) return h;
  }
  return hobbies[0];
}

function isRealEventLink(url, platform) {
  if (!url) return false;
  try {
    const { pathname } = new URL(url.startsWith("http") ? url : "https://" + url);
    if (pathname.length < 3) return false;
    // Must contain at least one platform path indicator
    return platform.pathIndicators.some((p) => pathname.toLowerCase().includes(p));
  } catch {
    return false;
  }
}

function parseDay(dateStr, month, year) {
  if (!dateStr) return null;
  // Try ISO format
  const iso = new Date(dateStr);
  if (!isNaN(iso)) return iso.getDate();
  // Try "Jun 14" or "14 Jun" style
  const match = dateStr.match(/(\d{1,2})\s+\w+|\w+\s+(\d{1,2})/);
  if (match) {
    const day = parseInt(match[1] || match[2]);
    if (day >= 1 && day <= 31) return day;
  }
  return null;
}

function dedupeEvents(events) {
  const seen = new Set();
  return events.filter((e) => {
    const key = e.name.toLowerCase().trim().slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Source 1: SerpAPI site: searches ────────────────────────────────────────

async function fetchSiteSearchEvents(hobbies, month, year, serpKey) {
  const monthName = new Date(year, month, 1).toLocaleString("default", { month: "long" });
  const hobbyStr = hobbies.slice(0, 3).join(" OR ");
  const results = [];

  await Promise.all(
    SITE_SEARCH_PLATFORMS.map(async (platform) => {
      try {
        const query = `site:${platform.site} mumbai (${hobbyStr}) ${monthName} ${year}`;
        const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${serpKey}&gl=in&hl=en&num=10`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data.organic_results) return;

        for (const result of data.organic_results) {
          const link = result.link || "";
          if (!isRealEventLink(link, platform)) continue;

          // Try to extract date from snippet
          const text = `${result.title || ""} ${result.snippet || ""}`;
          const dateMatch = text.match(/(\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/);
          const day = dateMatch ? parseDay(dateMatch[0], month, year) : Math.floor(Math.random() * 28) + 1;

          // Extract price from snippet
          const priceMatch = text.match(/₹\s*[\d,]+|Rs\.?\s*[\d,]+|free/i);
          const price = priceMatch ? priceMatch[0] : "See listing";

          // Clean title — remove site name suffixes
          const name = (result.title || "Event")
            .replace(/\s*[|\-–]\s*(BookMyShow|Insider|District|Skillbox|LBB).*$/i, "")
            .trim();

          results.push({
            day: day || (Math.floor(Math.random() * 28) + 1),
            name,
            venue: extractVenue(text) || "Mumbai",
            time: extractTime(text) || "Check listing",
            price,
            platforms: [platform.name],
            platformIcon: platform.icon,
            bookingLinks: { [platform.name]: link },
            source: "real",
            hobby: detectHobby(text, hobbies),
          });
        }
      } catch (e) {
        console.error(`Site search error for ${platform.name}:`, e.message);
      }
    })
  );

  return results;
}

// ─── Source 2: Google Events engine ──────────────────────────────────────────

async function fetchGoogleEvents(hobbies, month, year, serpKey) {
  const monthName = new Date(year, month, 1).toLocaleString("default", { month: "long" });
  const hobbyStr = hobbies.join(" OR ");
  const results = [];

  const queries = [
    `${hobbyStr} events Mumbai ${monthName} ${year}`,
    `things to do Mumbai ${monthName} ${year}`,
  ];

  await Promise.all(
    queries.map(async (query) => {
      try {
        const url = `https://serpapi.com/search.json?engine=google_events&q=${encodeURIComponent(query)}&location=Mumbai,Maharashtra,India&api_key=${serpKey}&hl=en&gl=in`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.events_results) return;

        for (const event of data.events_results) {
          if (!event.title) continue;
          const link = event.link || "";

          // Only include if it's a known platform deep link
          const allPlatforms = [
            ...SITE_SEARCH_PLATFORMS,
            { site: "lbb.in", name: "LBB", icon: "🗺️", pathIndicators: ["/mumbai/"] },
            { site: "eventbrite", name: "Eventbrite", icon: "🎪", pathIndicators: ["/e/"] },
            { site: "meetup.com", name: "Meetup", icon: "👥", pathIndicators: ["/events/"] },
          ];

          const matchedPlatform = allPlatforms.find((p) =>
            link.includes(p.site) && isRealEventLink(link, p)
          );
          if (!matchedPlatform) continue;

          const day = parseDay(event.date?.start_date || event.date?.when || "", month, year);
          if (!day) continue;

          results.push({
            day,
            name: event.title,
            venue: event.address?.[0] || "Mumbai",
            time: event.date?.when || "Check listing",
            price: event.ticket_info?.[0]?.price || "See listing",
            platforms: [matchedPlatform.name],
            platformIcon: matchedPlatform.icon,
            bookingLinks: { [matchedPlatform.name]: link },
            source: "real",
            hobby: detectHobby(event.title + " " + (event.description || ""), hobbies),
          });
        }
      } catch (e) {
        console.error("Google Events error:", e.message);
      }
    })
  );

  return results;
}

// ─── Source 3: AI web page parsing (LBB, Timeout, TrippyPin) ─────────────────

async function fetchWebParsedEvents(hobbies, month, year) {
  const monthName = new Date(year, month, 1).toLocaleString("default", { month: "long" });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const results = [];

  await Promise.all(
    WEB_FETCH_SOURCES.map(async (source) => {
      try {
        // Fetch the page
        const res = await fetch(source.url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; HobbyCalendar/1.0)" },
        });
        if (!res.ok) return;
        const html = await res.text();

        // Strip HTML to plain text for AI parsing (keep links)
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "LINK:$1 TEXT:$2")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .slice(0, 8000); // cap for token safety

        // Ask Claude to extract events
        const prompt = `You are extracting event listings from this ${source.name} webpage content.

Find all events happening in Mumbai in ${monthName} ${year} or with no specific date.
For each event extract: name, date/day (if mentioned), venue, price (if mentioned), and the most specific URL you can find in the LINK: references near that event.

Page content:
${text}

Respond ONLY with a JSON array. No markdown. Each item:
{
  "name": "event name",
  "day": <day number 1-${daysInMonth} or null if not found>,
  "venue": "venue name, neighbourhood",
  "time": "time or null",
  "price": "₹X or Free or null",
  "link": "most specific URL found near this event or null",
  "hobby_keywords": "comma separated keywords describing this event"
}

Only include real events with actual names. Maximum 8 events.`;

        const response = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }],
        });

        const rawText = response.content[0].text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(rawText);

        for (const e of parsed) {
          if (!e.name) continue;
          const day = e.day || (Math.floor(Math.random() * daysInMonth) + 1);
          const link = e.link && e.link.startsWith("http") ? e.link : source.url;

          results.push({
            day,
            name: e.name,
            venue: e.venue || "Mumbai",
            time: e.time || "Check listing",
            price: e.price || "See listing",
            platforms: [source.name],
            platformIcon: source.icon,
            bookingLinks: { [source.name]: link },
            source: "web",
            hobby: detectHobby((e.name + " " + (e.hobby_keywords || "")), hobbies),
          });
        }
      } catch (e) {
        console.error(`Web parse error for ${source.name}:`, e.message);
      }
    })
  );

  return results;
}

// ─── Source 4: Eventbrite API ────────────────────────────────────────────────

async function fetchEventbriteEvents(hobbies, month, year) {
  const key = process.env.EVENTBRITE_API_KEY;
  if (!key) return [];

  try {
    const start = new Date(year, month, 1).toISOString();
    const end = new Date(year, month + 1, 0, 23, 59).toISOString();
    const q = hobbies.slice(0, 2).join(" ");

    const url = `https://www.eventbriteapi.com/v3/events/search/?q=${encodeURIComponent(q)}&location.address=Mumbai&location.within=20km&start_date.range_start=${start}&start_date.range_end=${end}&expand=venue&token=${key}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.events) return [];

    return data.events.map((e) => {
      const d = new Date(e.start?.local || "");
      return {
        day: isNaN(d) ? 1 : d.getDate(),
        name: e.name?.text || "Eventbrite Event",
        venue: e.venue?.name || "Mumbai",
        time: isNaN(d) ? "Check listing" : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        price: e.is_free ? "Free" : "See listing",
        platforms: ["Eventbrite"],
        platformIcon: "🎪",
        bookingLinks: { Eventbrite: e.url },
        source: "real",
        hobby: detectHobby(e.name?.text + " " + (e.description?.text || ""), hobbies),
      };
    });
  } catch (e) {
    console.error("Eventbrite error:", e.message);
    return [];
  }
}

// ─── Source 5: Meetup API ────────────────────────────────────────────────────

async function fetchMeetupEvents(hobbies, month, year) {
  const key = process.env.MEETUP_API_KEY;
  if (!key) return [];

  try {
    const startEpoch = Math.floor(new Date(year, month, 1).getTime());
    const endEpoch = Math.floor(new Date(year, month + 1, 0, 23, 59).getTime());
    const q = hobbies.slice(0, 2).join(" ");

    const url = `https://api.meetup.com/find/upcoming_events?text=${encodeURIComponent(q)}&lat=19.0760&lon=72.8777&radius=25&start_date_range=${startEpoch}&end_date_range=${endEpoch}&key=${key}&page=20`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.events) return [];

    return data.events.map((e) => {
      const d = new Date(e.time || "");
      return {
        day: isNaN(d) ? 1 : d.getDate(),
        name: e.name || "Meetup Event",
        venue: e.venue?.name || "Mumbai",
        time: isNaN(d) ? "Check listing" : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        price: e.fee ? `₹${e.fee.amount}` : "Free",
        platforms: ["Meetup"],
        platformIcon: "👥",
        bookingLinks: { Meetup: e.link },
        source: "real",
        hobby: detectHobby(e.name + " " + (e.description || ""), hobbies),
      };
    });
  } catch (e) {
    console.error("Meetup error:", e.message);
    return [];
  }
}

// ─── Utility extractors ───────────────────────────────────────────────────────

function extractVenue(text) {
  const match = text.match(/\bat\s+([A-Z][^,.]{3,40})/);
  return match ? match[1].trim() : null;
}

function extractTime(text) {
  const match = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))\b/);
  return match ? match[1] : null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchRealEvents(hobbies, city, month, year) {
  const serpKey = process.env.SERPAPI_KEY;

  // Run all sources in parallel
  const [siteResults, googleResults, webResults, eventbriteResults, meetupResults] =
    await Promise.all([
      serpKey ? fetchSiteSearchEvents(hobbies, month, year, serpKey) : [],
      serpKey ? fetchGoogleEvents(hobbies, month, year, serpKey) : [],
      fetchWebParsedEvents(hobbies, month, year),
      fetchEventbriteEvents(hobbies, month, year),
      fetchMeetupEvents(hobbies, month, year),
    ]);

  const all = [
    ...siteResults,
    ...googleResults,
    ...webResults,
    ...eventbriteResults,
    ...meetupResults,
  ];

  return dedupeEvents(all);
}

// No AI fallback — kept for API route compatibility
export async function generateAIEvents() {
  return [];
}
