// events.js — multi-source real events engine
// Sources: SerpAPI (Google Events + site: searches), LBB, Timeout, TrippyPin web parsing,
//          Eventbrite API, Meetup API

import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Platform definitions ─────────────────────────────────────────────────────

const PLATFORMS = [
  { name: "BookMyShow",  domains: ["bookmyshow.com"],                  icon: "🎟️", baseUrl: "https://in.bookmyshow.com/explore/events-mumbai" },
  { name: "Insider.in",  domains: ["insider.in"],                      icon: "⭐", baseUrl: "https://insider.in/mumbai" },
  { name: "District",    domains: ["district.in"],                     icon: "🏙️", baseUrl: "https://www.district.in" },
  { name: "Skillbox",    domains: ["skillbox.in","skillboxindia.com"], icon: "🎓", baseUrl: "https://www.skillbox.in" },
  { name: "Eventbrite",  domains: ["eventbrite.in","eventbrite.com"],  icon: "🎪", baseUrl: "https://www.eventbrite.in/d/india--mumbai/events/" },
  { name: "Meetup",      domains: ["meetup.com"],                      icon: "👥", baseUrl: "https://www.meetup.com/find/?location=Mumbai" },
  { name: "LBB",         domains: ["lbb.in"],                         icon: "🗺️", baseUrl: "https://lbb.in/mumbai/" },
  { name: "Timeout",     domains: ["timeout.com"],                     icon: "⏰", baseUrl: "https://www.timeout.com/mumbai" },
  { name: "Dineout",     domains: ["dineout.co.in"],                   icon: "🍽️", baseUrl: "https://www.dineout.co.in/mumbai-restaurants" },
  { name: "Cult.fit",    domains: ["cult.fit","cure.fit"],             icon: "🏃", baseUrl: "https://cult.fit/mumbai" },
  { name: "Paytm Insider", domains: ["paytminsider.com"],             icon: "🎭", baseUrl: "https://paytminsider.com" },
  { name: "Explara",     domains: ["explara.com"],                     icon: "🎉", baseUrl: "https://explara.com/events/mumbai" },
];

const WEB_FETCH_SOURCES = [
  { name: "LBB",          icon: "🗺️", url: "https://lbb.in/mumbai/events/" },
  { name: "Timeout Mumbai", icon: "⏰", url: "https://www.timeout.com/mumbai/things-to-do" },
  { name: "TrippyPin",    icon: "📍", url: "https://trippypin.com/events/mumbai/" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectPlatform(url) {
  if (!url) return null;
  try {
    const hostname = new URL(url.startsWith("http") ? url : "https://" + url).hostname.replace("www.", "");
    for (const p of PLATFORMS) {
      if (p.domains.some((d) => hostname.includes(d))) return p;
    }
  } catch {}
  return null;
}

// Returns true for any platform link — deep or homepage level
// We prefer deep links but won't throw away homepage links
function isPlatformLink(url) {
  return detectPlatform(url) !== null;
}

// Returns true only if the link goes to a specific event page
function isDeepLink(url) {
  if (!url) return false;
  try {
    const { pathname } = new URL(url.startsWith("http") ? url : "https://" + url);
    return pathname && pathname.length > 3 &&
      !pathname.match(/^\/?(mumbai|events|explore|find|search)?\/?$/i);
  } catch {}
  return false;
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
  return null;
}

function extractDay(text, month, year) {
  const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const mn = months[month];
  // Try "Jun 14" or "14 Jun" or "14th June"
  const patterns = [
    new RegExp(`${mn}\\w*\\s+(\\d{1,2})`, "i"),
    new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+${mn}`, "i"),
    /\b(\d{1,2})(?:st|nd|rd|th)\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const d = parseInt(m[1]);
      if (d >= 1 && d <= 31) return d;
    }
  }
  return null;
}

function extractTime(text) {
  const m = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))\b/);
  return m ? m[1] : null;
}

function extractPrice(text) {
  const m = text.match(/₹\s*[\d,]+|Rs\.?\s*[\d,]+|free/i);
  return m ? m[0] : null;
}

function detectHobby(text, hobbies) {
  const lower = text.toLowerCase();
  for (const h of hobbies) {
    if (lower.includes(h.toLowerCase())) return h;
  }
  return hobbies[0];
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

function randomDay(month, year) {
  return Math.floor(Math.random() * new Date(year, month + 1, 0).getDate()) + 1;
}

// ─── Source 1: Google Events engine ──────────────────────────────────────────

async function fetchGoogleEvents(hobbies, month, year, serpKey) {
  const monthName = new Date(year, month, 1).toLocaleString("default", { month: "long" });
  const results = [];

  const queries = [
    `${hobbies.slice(0,3).join(" OR ")} events Mumbai ${monthName} ${year}`,
    `things to do Mumbai ${monthName} ${year}`,
    `workshops classes shows Mumbai ${monthName} ${year}`,
  ];

  await Promise.all(queries.map(async (query) => {
    try {
      const url = `https://serpapi.com/search.json?engine=google_events&q=${encodeURIComponent(query)}&location=Mumbai,Maharashtra,India&api_key=${serpKey}&hl=en&gl=in`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.events_results) return;

      for (const event of data.events_results) {
        if (!event.title) continue;
        const link = event.link || "";
        const platform = detectPlatform(link);
        const day = parseEventDay(event, year);

        results.push({
          day: day || randomDay(month, year),
          name: event.title,
          venue: event.address?.[0] || "Mumbai",
          time: event.date?.when || "Check listing",
          price: event.ticket_info?.[0]?.price || "See listing",
          platforms: [platform ? platform.name : "Google Events"],
          platformIcon: platform ? platform.icon : "🔍",
          // Use deep link if available, else platform homepage, else Google search
          bookingLinks: {
            [platform ? platform.name : "Google Events"]:
              isDeepLink(link) ? link :
              platform ? platform.baseUrl :
              `https://www.google.com/search?q=${encodeURIComponent(event.title + " Mumbai tickets")}`,
          },
          source: isDeepLink(link) ? "real" : "partial",
          hobby: detectHobby(event.title + " " + (event.description || ""), hobbies),
        });
      }
    } catch (e) {
      console.error("Google Events error:", e.message);
    }
  }));

  return results;
}

// ─── Source 2: Site-specific Google searches ─────────────────────────────────

async function fetchSiteSearchEvents(hobbies, month, year, serpKey) {
  const monthName = new Date(year, month, 1).toLocaleString("default", { month: "long" });
  const hobbyStr = hobbies.slice(0, 3).join(" OR ");
  const results = [];

  const targetSites = [
    { name: "BookMyShow",  icon: "🎟️", site: "in.bookmyshow.com",  base: "https://in.bookmyshow.com/explore/events-mumbai" },
    { name: "Insider.in",  icon: "⭐", site: "insider.in",          base: "https://insider.in/mumbai" },
    { name: "District",    icon: "🏙️", site: "district.in",         base: "https://www.district.in" },
    { name: "Skillbox",    icon: "🎓", site: "skillbox.in",          base: "https://www.skillbox.in" },
  ];

  await Promise.all(targetSites.map(async (platform) => {
    try {
      const query = `site:${platform.site} mumbai ${hobbyStr} ${monthName} ${year}`;
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${serpKey}&gl=in&hl=en&num=8`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.organic_results) return;

      for (const result of data.organic_results) {
        const link = result.link || "";
        if (!link.includes(platform.site)) continue;

        const text = `${result.title || ""} ${result.snippet || ""}`;
        const name = (result.title || "Event")
          .replace(/\s*[|\-–]\s*(BookMyShow|Insider|District|Skillbox).*$/i, "")
          .trim();

        const day = extractDay(text, month, year) || randomDay(month, year);

        results.push({
          day,
          name,
          venue: "Mumbai",
          time: extractTime(text) || "Check listing",
          price: extractPrice(text) || "See listing",
          platforms: [platform.name],
          platformIcon: platform.icon,
          bookingLinks: { [platform.name]: isDeepLink(link) ? link : platform.base },
          source: isDeepLink(link) ? "real" : "partial",
          hobby: detectHobby(text, hobbies),
        });
      }
    } catch (e) {
      console.error(`Site search error ${platform.name}:`, e.message);
    }
  }));

  return results;
}

// ─── Source 3: AI web page parsing (LBB, Timeout, TrippyPin) ─────────────────

async function fetchWebParsedEvents(hobbies, month, year) {
  const monthName = new Date(year, month, 1).toLocaleString("default", { month: "long" });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const results = [];

  await Promise.all(WEB_FETCH_SOURCES.map(async (source) => {
    try {
      const res = await fetch(source.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
      });
      if (!res.ok) {
        console.error(`${source.name} returned ${res.status}`);
        return;
      }
      const html = await res.text();

      // Extract text + preserve links
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 6000);

      const prompt = `Extract event listings from this ${source.name} Mumbai webpage.
Find events in ${monthName} ${year} or upcoming events with no specific date.

Page content:
${text}

Return ONLY a JSON array, no markdown. Each item:
{
  "name": "specific event name",
  "day": <number 1-${daysInMonth} or null>,
  "venue": "venue, neighbourhood in Mumbai",
  "time": "time string or null",
  "price": "₹X or Free or null",
  "link": "direct URL to event page if found in page content, else null"
}

Max 6 events. Only include real named events, not generic category pages.`;

      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      });

      const raw = response.content[0].text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(raw);

      for (const e of parsed) {
        if (!e.name || e.name.length < 3) continue;
        const link = e.link && e.link.startsWith("http") ? e.link : source.url;
        results.push({
          day: e.day || randomDay(month, year),
          name: e.name,
          venue: e.venue || "Mumbai",
          time: e.time || "Check listing",
          price: e.price || "See listing",
          platforms: [source.name],
          platformIcon: source.icon,
          bookingLinks: { [source.name]: link },
          source: "web",
          hobby: detectHobby(e.name, hobbies),
        });
      }
    } catch (e) {
      console.error(`Web parse error ${source.name}:`, e.message);
    }
  }));

  return results;
}

// ─── Source 4: Eventbrite API ─────────────────────────────────────────────────

async function fetchEventbriteEvents(hobbies, month, year) {
  const key = process.env.EVENTBRITE_API_KEY;
  if (!key) return [];

  try {
    const start = new Date(year, month, 1).toISOString();
    const end = new Date(year, month + 1, 0, 23, 59).toISOString();
    const q = hobbies.slice(0, 2).join(" ");
    const url = `https://www.eventbriteapi.com/v3/events/search/?q=${encodeURIComponent(q)}&location.address=Mumbai,India&location.within=25km&start_date.range_start=${start}&start_date.range_end=${end}&expand=venue&token=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.events) return [];

    return data.events.map((e) => {
      const d = new Date(e.start?.local || "");
      return {
        day: isNaN(d) ? randomDay(month, year) : d.getDate(),
        name: e.name?.text || "Eventbrite Event",
        venue: e.venue?.name || "Mumbai",
        time: isNaN(d) ? "Check listing" : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        price: e.is_free ? "Free" : "See listing",
        platforms: ["Eventbrite"],
        platformIcon: "🎪",
        bookingLinks: { Eventbrite: e.url },
        source: "real",
        hobby: detectHobby((e.name?.text || "") + " " + (e.description?.text || ""), hobbies),
      };
    });
  } catch (e) {
    console.error("Eventbrite error:", e.message);
    return [];
  }
}

// ─── Source 5: Meetup API ─────────────────────────────────────────────────────

async function fetchMeetupEvents(hobbies, month, year) {
  const key = process.env.MEETUP_API_KEY;
  if (!key) return [];

  try {
    const q = hobbies.slice(0, 2).join(" ");
    const url = `https://api.meetup.com/find/upcoming_events?text=${encodeURIComponent(q)}&lat=19.0760&lon=72.8777&radius=25&key=${key}&page=20`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.events) return [];

    return data.events
      .filter((e) => {
        const d = new Date(e.time || "");
        return !isNaN(d) && d.getMonth() === month && d.getFullYear() === year;
      })
      .map((e) => {
        const d = new Date(e.time);
        return {
          day: d.getDate(),
          name: e.name || "Meetup Event",
          venue: e.venue?.name || "Mumbai",
          time: d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
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

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchRealEvents(hobbies, city, month, year) {
  const serpKey = process.env.SERPAPI_KEY;

  const [googleResults, siteResults, webResults, eventbriteResults, meetupResults] =
    await Promise.all([
      serpKey ? fetchGoogleEvents(hobbies, month, year, serpKey) : [],
      serpKey ? fetchSiteSearchEvents(hobbies, month, year, serpKey) : [],
      fetchWebParsedEvents(hobbies, month, year),
      fetchEventbriteEvents(hobbies, month, year),
      fetchMeetupEvents(hobbies, month, year),
    ]);

  // Prioritise real deep links > partial platform links > web parsed
  const prioritised = [
    ...googleResults.filter(e => e.source === "real"),
    ...siteResults.filter(e => e.source === "real"),
    ...eventbriteResults,
    ...meetupResults,
    ...webResults,
    ...googleResults.filter(e => e.source === "partial"),
    ...siteResults.filter(e => e.source === "partial"),
  ];

  return dedupeEvents(prioritised);
}

export async function generateAIEvents() {
  return [];
}
