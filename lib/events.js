// events.js — real events only, exact platform links only

const PLATFORM_MAP = [
  { name: "BookMyShow",  domains: ["bookmyshow.com"],                   icon: "🎟️" },
  { name: "Insider.in",  domains: ["insider.in"],                       icon: "⭐" },
  { name: "District",    domains: ["district.in"],                      icon: "🏙️" },
  { name: "Skillbox",    domains: ["skillbox.in","skillboxindia.com"],   icon: "🎓" },
  { name: "Eventbrite",  domains: ["eventbrite.in","eventbrite.com"],   icon: "🎪" },
  { name: "Meetup",      domains: ["meetup.com"],                       icon: "👥" },
  { name: "Dineout",     domains: ["dineout.co.in"],                    icon: "🍽️" },
  { name: "Cult.fit",    domains: ["cult.fit","cure.fit"],              icon: "🏃" },
  { name: "Paytm Insider", domains: ["paytminsider.com"],              icon: "🎭" },
  { name: "Explara",     domains: ["explara.com"],                      icon: "🎉" },
];

// Returns the platform object if the URL belongs to a known platform, else null
function detectPlatform(url) {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname.replace("www.", "");
    for (const p of PLATFORM_MAP) {
      if (p.domains.some((d) => hostname.includes(d))) return p;
    }
  } catch {}
  return null;
}

// Returns true only if the URL is a deep link to an actual event page
// (not just a homepage or category page)
function isDeepLink(url) {
  if (!url) return false;
  try {
    const { pathname } = new URL(url);
    // Must have a path with meaningful depth beyond just "/"
    return pathname && pathname.length > 2 && pathname !== "/events" && pathname !== "/mumbai";
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
  return null; // return null so we can skip events with no parseable date
}

function detectHobby(text, hobbies) {
  const lower = text.toLowerCase();
  for (const h of hobbies) {
    if (lower.includes(h.toLowerCase())) return h;
  }
  return hobbies[0];
}

// Core fetch — runs targeted SerpAPI Google Events queries
export async function fetchRealEvents(hobbies, city, month, year) {
  const serpKey = process.env.SERPAPI_KEY;
  if (!serpKey) return [];

  const monthName = new Date(year, month, 1).toLocaleString("default", { month: "long" });
  const allEvents = [];
  const seen = new Set();

  // Build queries — hobby-based + platform-targeted
  const hobbyStr = hobbies.join(" OR ");
  const queries = [
    `${hobbyStr} events Mumbai ${monthName} ${year}`,
    `${hobbyStr} Mumbai ${monthName} ${year} BookMyShow OR Insider OR District`,
    `workshop OR show OR concert OR class Mumbai ${monthName} ${year} Eventbrite OR Meetup OR Skillbox`,
    `${hobbyStr} things to do Mumbai ${monthName} ${year}`,
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

          const key = event.title.toLowerCase().trim();
          if (seen.has(key)) continue;
          seen.add(key);

          const link = event.link || "";
          const platform = detectPlatform(link);
          const deep = isDeepLink(link);

          // Skip events with no platform link or non-deep links
          if (!platform || !deep) continue;

          const day = parseEventDay(event, year);
          if (!day) continue; // skip events with no parseable date

          allEvents.push({
            day,
            name: event.title,
            venue: event.address?.[0] || city,
            time: event.date?.when || "Check listing",
            price: event.ticket_info?.[0]?.price || "See listing",
            platforms: [platform.name],
            platformIcon: platform.icon,
            bookingLinks: { [platform.name]: link }, // exact event page link
            source: "real",
            hobby: detectHobby(event.title + " " + (event.description || ""), hobbies),
          });
        }
      } catch (e) {
        console.error("SerpAPI error:", e.message);
      }
    })
  );

  return allEvents;
}

// No AI fallback — export a no-op so the API route doesn't break
export async function generateAIEvents() {
  return [];
}
