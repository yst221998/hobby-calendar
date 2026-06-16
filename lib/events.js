// events.js — BookMyShow + District via SerpAPI (exact event pages only)

const TARGET_SITES = [
  {
    name: "BookMyShow",
    icon: "🎟️",
    site: "in.bookmyshow.com",
    queryPrefix: "site:in.bookmyshow.com/events",
  },
  {
    name: "District",
    icon: "🏙️",
    site: "district.in",
    queryPrefix: "site:district.in/events",
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
  "/search",
];

const DISTRICT_REJECT_SLUGS = [
  "mumbai", "events", "search", "music", "comedy", "theatre", "workshops",
  "activities", "experiences", "sports", "food", "nightlife",
];

const BMS_CATEGORY_SLUGS = [
  "music", "comedy", "theatre", "workshop", "sports", "activities",
  "events-mumbai", "experiences", "nightlife",
];

const GENERIC_TITLE_PATTERNS = [
  /upcoming events at/i,
  /^events at\s/i,
  /^shows at\s/i,
  /^events?\s/i,
  /^shows?\s/i,
  /book tickets for/i,
  /buy tickets for/i,
  /tickets for .+ in (pune|delhi|bangalore|bengaluru|hyderabad|chennai|kolkata|goa)/i,
  /explore .+ events/i,
  /discover .+ events/i,
  /events in (pune|delhi|bangalore|bengaluru|hyderabad|chennai|kolkata|goa)/i,
  /^buy .+ tickets online/i,
  /^all events at/i,
  /\b(workshops?|activities)\s+(in|at)\b/i,
  /^(at\s+)?(ncpa|jio world|prithvi)/i,
];

const CATEGORY_WORDS = new Set(["music", "comedy", "theatre", "events", "shows", "workshops", "activities"]);
const STOP_WORDS = new Set(["the", "at", "in", "mumbai", "and", "a", "an"]);

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

const DATE_KEYS = ["showDates", "sessionDates", "showTime", "startDate", "eventDate", "dates", "ShowDates"];

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
      const slug = afterEvents.split("/").filter(Boolean)[0] || afterEvents;
      if (BMS_CATEGORY_SLUGS.some((c) => slug.includes(c))) return false;

      return afterEvents.length > 8 && slug.length > 3;
    }

    if (platformName === "District") {
      if (!host.includes("district.in")) return false;
      if (path.match(/^\/mumbai\/?$/)) return false;
      if (path.match(/^\/search(\/|$)/)) return false;
      const eventMatch = path.match(/\/events?\/([^/]+)/i);
      if (!eventMatch) return false;
      const slug = eventMatch[1].toLowerCase();
      return slug.length > 2 && !DISTRICT_REJECT_SLUGS.includes(slug);
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

function isSpecificEventName(name, venue, url = "") {
  const title = (name || "").trim();
  const hasEventId = /ET\d+/i.test(url || "");
  const minLen = hasEventId ? 5 : 6;
  if (title.length < minLen) return false;
  if (isGenericTitle(title, "")) return false;

  const normName = normalizeName(title);
  const normVenue = normalizeName(venue || "");
  if (normVenue && normName === normVenue) return false;

  const tokens = normName.split(" ").filter((w) => w && !STOP_WORDS.has(w));
  if (tokens.length === 1 && CATEGORY_WORDS.has(tokens[0])) return false;
  if (tokens.length < 2) {
    if (hasEventId && tokens.length >= 1 && title.length >= 8) return true;
    const districtSlug = (url || "").match(/\/events?\/([^/]+)/i);
    if (districtSlug && districtSlug[1].length > 8 && title.length >= 8) return true;
    return false;
  }

  return true;
}

function isMumbaiRelevant(link) {
  const urlLower = (link || "").toLowerCase();

  for (const city of NON_MUMBAI_CITIES) {
    if (urlLower.includes(`/${city}/`) || urlLower.match(new RegExp(`[./]${city}(/|$|\\.)`))) {
      return false;
    }
  }

  return true;
}

function createDebugStats() {
  return {
    searchesRun: 0,
    organicResultsSeen: 0,
    rejectedByUrl: 0,
    candidatesAccepted: 0,
    rejectedByGenericTitle: 0,
    rejectedByCity: 0,
    rejectedAfterEnrichment: 0,
    finalScheduled: 0,
    finalTbd: 0,
  };
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

// Reject "Jun 2026" capturing day 20 from year 2026 — use (?!\d) on day groups.
function dayFromMonthMatch(fullMatch, dayStr, month, year, time) {
  if (!fullMatch || !dayStr) return null;
  const day = parseInt(dayStr, 10);
  if (day < 1 || day > 31) return null;

  const yearStr = String(year);
  if (fullMatch.match(new RegExp(`${MONTH_NAMES[month]}\\w*\\s+${yearStr}`, "i"))) return null;
  if (fullMatch.match(new RegExp(`${yearStr}`, "i")) && !fullMatch.match(/\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4}|\s+[a-z])/i)) {
    const monthLong = new Date(year, month, 1).toLocaleString("default", { month: "long" });
    if (new RegExp(`${monthLong}\\s+${yearStr}`, "i").test(fullMatch)) return null;
  }

  return dateResultFromParts(day, month, year, time);
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

  const monthFirstYear = new RegExp(`${mn}\\w*\\s+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?(?:,?\\s+${year})?`, "i");
  const mf = text.match(monthFirstYear);
  if (mf) {
    const r = dayFromMonthMatch(mf[0], mf[1], month, year, time);
    if (r) return r;
  }

  const monthLongFirst = new RegExp(`${monthLong}\\s+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?(?:,?\\s+${year})?`, "i");
  const mlf = text.match(monthLongFirst);
  if (mlf) {
    const r = dayFromMonthMatch(mlf[0], mlf[1], month, year, time);
    if (r) return r;
  }

  const dayFirst = [
    new RegExp(`(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?\\s+${mn}\\w*`, "i"),
    new RegExp(`(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?\\s+${monthLong}`, "i"),
    new RegExp(`${mn}\\w*\\s+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?`, "i"),
  ];
  for (const re of dayFirst) {
    const m = text.match(re);
    if (m) {
      const r = dayFromMonthMatch(m[0], m[1], month, year, time);
      if (r) return r;
    }
  }

  return null;
}

function expandDateRangeToDays(startStr, endStr, targetMonth, targetYear) {
  const start = new Date(startStr);
  let end = endStr ? new Date(endStr) : new Date(startStr);
  if (isNaN(start)) return [];
  if (isNaN(end)) end = start;

  const days = new Set();
  const cur = new Date(start);
  const limit = new Date(start);
  limit.setDate(limit.getDate() + 31);

  while (cur <= end && cur <= limit) {
    if (cur.getMonth() === targetMonth && cur.getFullYear() === targetYear) {
      days.add(cur.getDate());
    }
    cur.setDate(cur.getDate() + 1);
  }

  return [...days].sort((a, b) => a - b);
}

function addDayFromIsoString(str, targetMonth, targetYear, daysSet) {
  const r = parseIsoDate(String(str), targetMonth, targetYear);
  if (r) daysSet.add(r.day);
  const iso = String(str).match(/\d{4}-\d{2}-\d{2}/);
  if (iso) {
    const r2 = parseIsoDate(iso[0], targetMonth, targetYear);
    if (r2) daysSet.add(r2.day);
  }
}

// ─── JSON-LD and page enrichment ───────────────────────────────────────────────

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

function parseAllJsonLdEvents(html, targetMonth, targetYear) {
  const scripts = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (!scripts) return null;

  let bestName = null;
  let bestVenue = "Mumbai";
  let bestTime = null;
  const daysSet = new Set();

  for (const block of scripts) {
    const inner = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
    try {
      const data = JSON.parse(inner);
      for (const item of flattenJsonLd(data)) {
        if (!item || typeof item !== "object") continue;
        const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
        if (!types.some((t) => t && String(t).toLowerCase().includes("event"))) continue;

        const name = (item.name || item.title || "").trim();
        if (name && name.length >= 3 && !bestName) {
          bestName = name;
          bestVenue = extractVenueFromLocation(item.location);
        }

        const start = item.startDate || item.startTime;
        const end = item.endDate || item.endTime;
        if (start) {
          const rangeDays = expandDateRangeToDays(start, end, targetMonth, targetYear);
          if (rangeDays.length > 0) {
            rangeDays.forEach((d) => daysSet.add(d));
          } else {
            addDayFromIsoString(start, targetMonth, targetYear, daysSet);
          }
          const dateR = parseIsoDate(String(start), targetMonth, targetYear);
          if (dateR?.time && !bestTime) bestTime = dateR.time;
        }
      }
    } catch {
      // try next block
    }
  }

  if (!bestName) return null;

  return {
    valid: true,
    name: bestName,
    venue: bestVenue,
    time: bestTime,
    days: [...daysSet].sort((a, b) => a - b),
  };
}

function collectDatesFromObject(obj, targetMonth, targetYear, daysSet, depth = 0) {
  if (depth > 12 || obj == null) return;

  if (typeof obj === "string" || typeof obj === "number") {
    addDayFromIsoString(String(obj), targetMonth, targetYear, daysSet);
    return;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) collectDatesFromObject(item, targetMonth, targetYear, daysSet, depth + 1);
    return;
  }

  if (typeof obj === "object") {
    for (const key of DATE_KEYS) {
      if (obj[key] != null) collectDatesFromObject(obj[key], targetMonth, targetYear, daysSet, depth + 1);
    }
    if (depth < 4) {
      for (const val of Object.values(obj)) {
        if (typeof val === "object") collectDatesFromObject(val, targetMonth, targetYear, daysSet, depth + 1);
      }
    }
  }
}

function parseBmsNextDataDates(html, targetMonth, targetYear) {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return [];

  try {
    const data = JSON.parse(match[1]);
    const daysSet = new Set();
    collectDatesFromObject(data, targetMonth, targetYear, daysSet);
    return [...daysSet].sort((a, b) => a - b).slice(0, 31);
  } catch {
    return [];
  }
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

  const fromLd = parseAllJsonLdEvents(html, month, year);
  if (fromLd) {
    if (fromLd.days.length === 0 && url.includes("bookmyshow.com")) {
      const bmsDays = parseBmsNextDataDates(html, month, year);
      if (bmsDays.length > 0) fromLd.days = bmsDays;
    }
    return fromLd;
  }

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

export function primaryBookingLink(event) {
  const links = event.bookingLinks || {};
  return Object.values(links)[0] || "";
}

function expandEventsByDates(events) {
  const expanded = [];

  for (const e of events) {
    const days = e._days && e._days.length > 0 ? e._days : [];
    if (days.length === 0) {
      expanded.push({ ...e, day: null });
      continue;
    }
    for (const day of days) {
      expanded.push({ ...e, day });
    }
  }

  return expanded.map(({ _days, _pageUrl, ...rest }) => rest);
}

// ─── Dedupe and split ─────────────────────────────────────────────────────────

export function dedupeEvents(events) {
  const map = new Map();

  for (const e of events) {
    const link = primaryBookingLink(e);
    const key = `${normalizeName(e.name)}|${e.day ?? "tbd"}|${link}`;
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

export function splitScheduled(events) {
  return {
    scheduled: events.filter((e) => e.day !== null),
    unscheduled: events.filter((e) => e.day === null),
  };
}

export function groupEventsByUrl(events) {
  const map = new Map();
  for (const e of events) {
    const url = primaryBookingLink(e);
    if (!url) continue;
    if (!map.has(url)) {
      map.set(url, {
        ...e,
        days: [],
      });
    }
    const grouped = map.get(url);
    if (e.day != null && !grouped.days.includes(e.day)) {
      grouped.days.push(e.day);
    }
    grouped.days.sort((a, b) => a - b);
  }
  return [...map.values()];
}

export function expandGroupedEvents(grouped) {
  const expanded = [];
  for (const g of grouped) {
    const { days, ...base } = g;
    const sortedDays = [...(days || [])].sort((a, b) => a - b);
    if (sortedDays.length === 0) {
      expanded.push({ ...base, day: null });
      continue;
    }
    for (const day of sortedDays) {
      expanded.push({ ...base, day });
    }
  }
  return expanded;
}

// ─── SerpAPI site search ──────────────────────────────────────────────────────

function buildSerpQueries(platform, hobby, areaPart, monthName, year) {
  const negatives = "-pune -delhi -bangalore";
  const locationPart = areaPart.trim() ? `${areaPart.trim()} Mumbai` : "Mumbai";

  return [
    `${platform.queryPrefix} ${locationPart} ${hobby} ${monthName} ${year} ${negatives}`,
    `${platform.queryPrefix} ${locationPart} ${hobby} ${negatives}`,
    `${platform.queryPrefix} ${locationPart} ${negatives}`,
  ];
}

async function fetchSerpResults(query, serpKey) {
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${serpKey}&gl=in&hl=en&num=10`;
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`SerpAPI request failed (${res.status}): ${data.error || res.statusText || "Unknown error"}`);
  }
  if (data.error) {
    throw new Error(`SerpAPI error: ${data.error}`);
  }

  return Array.isArray(data.organic_results) ? data.organic_results : [];
}

function processOrganicResult(result, platform, hobbies, seenLinks, candidates, debug) {
  const link = result.link || "";
  if (!link.includes(platform.site)) return;
  if (seenLinks.has(link)) return;

  if (!isEventPageUrl(link, platform.name)) {
    debug.rejectedByUrl += 1;
    return;
  }

  const snippet = result.snippet || "";
  const rawTitle = (result.title || "")
    .replace(/\s*[|\-–]\s*(BookMyShow|District).*$/i, "")
    .trim();

  if (isGenericTitle(rawTitle, snippet)) {
    debug.rejectedByGenericTitle += 1;
    return;
  }
  if (!isMumbaiRelevant(link)) {
    debug.rejectedByCity += 1;
    return;
  }

  seenLinks.add(link);
  debug.candidatesAccepted += 1;
  const text = `${rawTitle} ${snippet}`;

  candidates.push({
    day: null,
    name: rawTitle,
    venue: "Mumbai",
    time: extractTime(text) || "Check listing",
    price: extractPrice(text) || "See listing",
    platforms: [platform.name],
    platformIcon: platform.icon,
    bookingLinks: { [platform.name]: link },
    source: "real",
    hobby: detectHobby(text, hobbies),
    _pageUrl: link,
    _days: [],
  });
}

async function fetchSiteSearchEvents(hobbies, month, year, serpKey, area = "", debug = createDebugStats()) {
  const monthName = new Date(year, month, 1).toLocaleString("default", { month: "long" });
  const areaPart = area.trim() ? `${area.trim()} ` : "";
  const hobbiesToSearch = hobbies.slice(0, 4);
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
      const queries = buildSerpQueries(platform, hobby, areaPart, monthName, year);

      for (const query of queries) {
        debug.searchesRun += 1;
        const organicResults = await fetchSerpResults(query, serpKey);
        debug.organicResultsSeen += organicResults.length;

        for (const result of organicResults) {
          processOrganicResult(result, platform, hobbies, seenLinks, candidates, debug);
        }
      }
    })
  );

  const enriched = await mapConcurrent(candidates, 8, async (candidate) => {
    const link = candidate._pageUrl;
    const pageData = await enrichFromEventPage(link, month, year);

    if (pageData.valid) {
      if (isGenericTitle(pageData.name, "")) {
        debug.rejectedAfterEnrichment += 1;
        return null;
      }
      if (!isSpecificEventName(pageData.name, pageData.venue, link)) {
        debug.rejectedAfterEnrichment += 1;
        return null;
      }
      return {
        ...candidate,
        name: pageData.name,
        venue: pageData.venue || candidate.venue,
        time: pageData.time || candidate.time,
        source: "real",
        enrichTier: "confirmed",
        _days: pageData.days || [],
      };
    }

    if (isGenericTitle(candidate.name, "")) {
      debug.rejectedAfterEnrichment += 1;
      return null;
    }
    if (!isSpecificEventName(candidate.name, candidate.venue, link)) {
      debug.rejectedAfterEnrichment += 1;
      return null;
    }
    return {
      ...candidate,
      source: "real",
      enrichTier: "fallback",
      _days: [],
    };
  });

  const valid = enriched.filter(Boolean);
  return expandEventsByDates(valid);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchRealEvents(hobbies, city, month, year) {
  const serpKey = process.env.SERPAPI_KEY;
  if (!serpKey) {
    throw new Error("SERPAPI_KEY is not set. Add it to .env.local");
  }

  const area = city && city !== "Mumbai" ? city : "";
  const debug = createDebugStats();
  const raw = await fetchSiteSearchEvents(hobbies, month, year, serpKey, area, debug);
  const deduped = dedupeEvents(raw);
  const { scheduled, unscheduled } = splitScheduled(deduped);

  debug.finalScheduled = scheduled.length;
  debug.finalTbd = unscheduled.length;

  return {
    events: [...scheduled, ...unscheduled],
    scheduled,
    unscheduled,
    debug,
  };
}
