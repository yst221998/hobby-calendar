// events.js — BookMyShow + District via SerpAPI (exact event pages only)

const TARGET_SITES = [
  {
    name: "BookMyShow",
    icon: "🎟️",
    site: "in.bookmyshow.com",
    queryPrefix: "site:in.bookmyshow.com/mumbai/events",
  },
  {
    name: "District",
    icon: "🏙️",
    site: "district.in",
    queryPrefix: "site:district.in/mumbai",
  },
];

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const NON_MUMBAI_CITIES = ["pune", "delhi", "bangalore", "bengaluru", "hyderabad", "chennai", "kolkata", "goa", "noida", "gurgaon", "gurugram"];

const REJECT_PATH_SEGMENTS = [
  "/places/",
  "/venues/",
  "/cinema/",
  "/explore/",
  "/artist/",
  "/person/",
  "/sports/",
  "/activities/",
  "/search",
];

const GENERIC_TITLE_PATTERNS = [
  /upcoming events at/i,
  /^events at\s/i,
  /^shows at\s/i,
  /book tickets for/i,
  /buy tickets for/i,
  /tickets for .+ in (pune|delhi|bangalore|bengaluru|hyderabad|chennai|kolkata|goa)/i,
  /explore .+ events/i,
  /discover .+ events/i,
  /events in (pune|delhi|bangalore|bengaluru|hyderabad|chennai|kolkata|goa)/i,
  /^buy .+ tickets online/i,
  /^all events at/i,
];

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

// ─── URL and title filters ────────────────────────────────────────────────────

function isEventPageUrl(url, platformName) {
  if (!url) return false;
  try {
    const u = new URL(url.startsWith("http") ? url : "https://" + url);
    const path = u.pathname.toLowerCase();
    const host = u.hostname.toLowerCase();

    if (REJECT_PATH_SEGMENTS.some((seg) => path.includes(seg))) return false;

    for (const city of NON_MUMBAI_CITIES) {
      if (path.includes(`/${city}/`) || path.match(new RegExp(`^/${city}(/|$)`))) return false;
    }

    if (platformName === "BookMyShow") {
      if (!host.includes("bookmyshow.com")) return false;
      if (!path.includes("/events/")) return false;
      if (/ET\d+/i.test(path)) return true;
      const afterEvents = path.split("/events/")[1] || "";
      const segments = afterEvents.split("/").filter(Boolean);
      return segments.length >= 1 && afterEvents.length > 8;
    }

    if (platformName === "District") {
      if (!host.includes("district.in")) return false;
      if (path.match(/^\/mumbai\/?$/)) return false;
      if (path.match(/^\/search(\/|$)/)) return false;
      const eventMatch = path.match(/\/events?\/([^/]+)/i);
      if (!eventMatch) return false;
      const slug = eventMatch[1];
      return slug.length > 2 && !["mumbai", "events", "search"].includes(slug);
    }

    return false;
  } catch {
    return false;
  }
}

function isGenericTitle(name, snippet = "") {
  const title = (name || "").trim();
  const combined = `${title} ${snippet}`.trim();
  if (title.length < 4) return true;

  for (const re of GENERIC_TITLE_PATTERNS) {
    if (re.test(title) || re.test(combined)) return true;
  }

  if (/^(upcoming\s+)?events at\s+\w/i.test(title)) return true;
  if (/^shows at\s+\w/i.test(title)) return true;

  return false;
}

function isMumbaiRelevant(link, text) {
  const urlLower = (link || "").toLowerCase();
  const combined = `${link} ${text}`.toLowerCase();

  for (const city of NON_MUMBAI_CITIES) {
    if (urlLower.includes(`/${city}/`) || urlLower.match(new RegExp(`[./]${city}(/|$|\\.)`))) {
      return false;
    }
    if (new RegExp(`\\b(in|at)\\s+${city}\\b`).test(combined)) return false;
    if (new RegExp(`events in ${city}`).test(combined)) return false;
    if (new RegExp(`tickets for .+ in ${city}`).test(combined)) return false;
  }

  return true;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

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

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/\s*[|\-–]\s*(bookmyshow|district).*$/i, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidDay(day, month, year) {
  if (!day || day < 1 || day > 31) return false;
  const d = new Date(year, month, day);
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
}

function dateResultFromParts(day, month, year, time) {
  if (!isValidDay(day, month, year)) return null;
  return { day, month, year, time: time || null };
}

function parseIsoDate(str, targetMonth, targetYear) {
  const iso = String(str).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const y = parseInt(iso[1], 10);
    const m = parseInt(iso[2], 10) - 1;
    const d = parseInt(iso[3], 10);
    if (m === targetMonth && y === targetYear) return dateResultFromParts(d, m, y);
    return null;
  }
  const parsed = new Date(str);
  if (isNaN(parsed)) return null;
  if (parsed.getMonth() === targetMonth && parsed.getFullYear() === targetYear) {
    const time = parsed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    return dateResultFromParts(parsed.getDate(), targetMonth, targetYear, time);
  }
  return null;
}

function parseEventDate(text, month, year) {
  if (!text) return null;
  const time = extractTime(text);

  const isoInline = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoInline) {
    const r = parseIsoDate(isoInline[0], month, year);
    if (r) return { ...r, time: r.time || time };
  }

  const dmy = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const m = parseInt(dmy[2], 10) - 1;
    const y = parseInt(dmy[3], 10);
    const r = dateResultFromParts(day, m, y, time);
    if (r && m === month && y === year) return r;
  }

  const mn = MONTH_NAMES[month];
  const monthLong = new Date(year, month, 1).toLocaleString("default", { month: "long" });

  const rangePatterns = [
    new RegExp(`(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+${mn}\\w*`, "i"),
    new RegExp(`(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})\\s+${monthLong}`, "i"),
  ];
  for (const re of rangePatterns) {
    const m = text.match(re);
    if (m) {
      const r = dateResultFromParts(parseInt(m[1], 10), month, year, time);
      if (r) return r;
    }
  }

  const monthFirstYear = new RegExp(`${mn}\\w*\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+${year})?`, "i");
  const mf = text.match(monthFirstYear);
  if (mf) {
    const r = dateResultFromParts(parseInt(mf[1], 10), month, year, time);
    if (r) return r;
  }

  const monthLongFirst = new RegExp(`${monthLong}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+${year})?`, "i");
  const mlf = text.match(monthLongFirst);
  if (mlf) {
    const r = dateResultFromParts(parseInt(mlf[1], 10), month, year, time);
    if (r) return r;
  }

  const dayFirst = [
    new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+${mn}\\w*`, "i"),
    new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthLong}`, "i"),
    new RegExp(`${mn}\\w*\\s+(\\d{1,2})(?:st|nd|rd|th)?`, "i"),
  ];
  for (const re of dayFirst) {
    const m = text.match(re);
    if (m) {
      const r = dateResultFromParts(parseInt(m[1], 10), month, year, time);
      if (r) return r;
    }
  }

  return null;
}

function parseDateFromUrl(url, month, year) {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : "https://" + url);

    for (const key of ["date", "on", "start", "event_date"]) {
      const val = u.searchParams.get(key);
      if (val) {
        const r = parseIsoDate(val, month, year);
        if (r) return r;
      }
    }

    const pathIso = u.pathname.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (pathIso) {
      const r = parseIsoDate(pathIso[0], month, year);
      if (r) return r;
    }

    const slugDmy = u.pathname.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
    if (slugDmy) {
      const day = parseInt(slugDmy[1], 10);
      const m = parseInt(slugDmy[2], 10) - 1;
      const y = parseInt(slugDmy[3], 10);
      const r = dateResultFromParts(day, m, y);
      if (r && m === month && y === year) return r;
    }
  } catch {
    return null;
  }
  return null;
}

function resolveEventDate(text, link, month, year) {
  return parseEventDate(text, month, year) || parseDateFromUrl(link, month, year) || null;
}

// ─── JSON-LD event page enrichment ───────────────────────────────────────────

function flattenJsonLd(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data.flatMap(flattenJsonLd);
  if (data["@graph"]) return flattenJsonLd(data["@graph"]);
  return [data];
}

function extractVenueFromLocation(loc) {
  if (!loc) return "Mumbai";
  if (typeof loc === "string") return loc;
  if (loc.name) return loc.name;
  if (loc.address?.name) return loc.address.name;
  if (loc.address?.addressLocality) return loc.address.addressLocality;
  return "Mumbai";
}

function parseJsonLdEvent(html, targetMonth, targetYear) {
  const scripts = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (!scripts) return null;

  for (const block of scripts) {
    const inner = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
    try {
      const data = JSON.parse(inner);
      for (const item of flattenJsonLd(data)) {
        if (!item || typeof item !== "object") continue;
        const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
        if (!types.some((t) => t && String(t).toLowerCase().includes("event"))) continue;

        const name = (item.name || item.title || "").trim();
        if (!name || name.length < 3) continue;

        let day = null;
        let time = null;
        const start = item.startDate || item.startTime;
        if (start) {
          const dateR = parseIsoDate(String(start), targetMonth, targetYear);
          if (dateR) {
            day = dateR.day;
            time = dateR.time;
          }
        }

        return {
          valid: true,
          name,
          day,
          time,
          venue: extractVenueFromLocation(item.location),
        };
      }
    } catch {
      // try next block
    }
  }

  return null;
}

async function fetchWithTimeout(url, ms = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS, signal: controller.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function enrichFromEventPage(url, month, year) {
  const html = await fetchWithTimeout(url);
  if (!html) return { valid: false };

  const fromLd = parseJsonLdEvent(html, month, year);
  if (fromLd) return fromLd;

  return { valid: false };
}

async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ─── Dedupe and split ─────────────────────────────────────────────────────────

function dedupeEvents(events) {
  const map = new Map();

  for (const e of events) {
    const key = `${normalizeName(e.name)}|${e.day ?? "tbd"}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...e, platforms: [...e.platforms], bookingLinks: { ...e.bookingLinks } });
      continue;
    }

    for (const p of e.platforms) {
      if (!existing.platforms.includes(p)) existing.platforms.push(p);
    }
    Object.assign(existing.bookingLinks, e.bookingLinks);
  }

  return [...map.values()];
}

function splitScheduled(events) {
  return {
    scheduled: events.filter((e) => e.day !== null),
    unscheduled: events.filter((e) => e.day === null),
  };
}

// ─── SerpAPI site search ──────────────────────────────────────────────────────

function buildSerpQuery(platform, hobby, areaPart, monthName, year) {
  const negatives = "-pune -delhi -bangalore";
  return `${platform.queryPrefix} ${areaPart}${hobby} ${monthName} ${year} ${negatives}`;
}

async function fetchSiteSearchEvents(hobbies, month, year, serpKey, area = "") {
  const monthName = new Date(year, month, 1).toLocaleString("default", { month: "long" });
  const areaPart = area.trim() ? `${area.trim()} ` : "";
  const hobbiesToSearch = hobbies.slice(0, 2);
  const seenLinks = new Set();
  const candidates = [];

  const searchJobs = [];
  for (const platform of TARGET_SITES) {
    for (const hobby of hobbiesToSearch) {
      searchJobs.push({ platform, hobby });
    }
  }

  await Promise.all(
    searchJobs.map(async ({ platform, hobby }) => {
      try {
        const query = buildSerpQuery(platform, hobby, areaPart, monthName, year);
        const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${serpKey}&gl=in&hl=en&num=8`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.organic_results) return;

        for (const result of data.organic_results) {
          const link = result.link || "";
          if (!link.includes(platform.site)) continue;
          if (seenLinks.has(link)) continue;

          if (!isEventPageUrl(link, platform.name)) continue;

          const snippet = result.snippet || "";
          const rawTitle = (result.title || "")
            .replace(/\s*[|\-–]\s*(BookMyShow|District).*$/i, "")
            .trim();

          if (isGenericTitle(rawTitle, snippet)) continue;
          if (!isMumbaiRelevant(link, `${rawTitle} ${snippet}`)) continue;

          seenLinks.add(link);
          const text = `${rawTitle} ${snippet}`;
          const dateInfo = resolveEventDate(text, link, month, year);

          candidates.push({
            day: dateInfo ? dateInfo.day : null,
            name: rawTitle,
            venue: "Mumbai",
            time: dateInfo?.time || extractTime(text) || "Check listing",
            price: extractPrice(text) || "See listing",
            platforms: [platform.name],
            platformIcon: platform.icon,
            bookingLinks: { [platform.name]: link },
            source: "real",
            hobby: detectHobby(text, hobbies),
            _pageUrl: link,
          });
        }
      } catch (e) {
        console.error(`Site search error ${platform.name}:`, e.message);
      }
    })
  );

  const enriched = await mapConcurrent(candidates, 8, async (candidate) => {
    const pageData = await enrichFromEventPage(candidate._pageUrl, month, year);
    if (!pageData.valid) return null;
    if (isGenericTitle(pageData.name, "")) return null;

    return {
      ...candidate,
      name: pageData.name,
      venue: pageData.venue || candidate.venue,
      day: pageData.day !== null ? pageData.day : candidate.day,
      time: pageData.time || candidate.time,
      source: "real",
    };
  });

  return enriched
    .filter(Boolean)
    .map(({ _pageUrl, ...e }) => e);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchRealEvents(hobbies, city, month, year) {
  const serpKey = process.env.SERPAPI_KEY;
  if (!serpKey) {
    throw new Error("SERPAPI_KEY is not set. Add it to .env.local");
  }

  const area = city && city !== "Mumbai" ? city : "";
  const raw = await fetchSiteSearchEvents(hobbies, month, year, serpKey, area);
  const deduped = dedupeEvents(raw);
  const { scheduled, unscheduled } = splitScheduled(deduped);

  return {
    events: [...scheduled, ...unscheduled],
    scheduled,
    unscheduled,
  };
}
