// events.js — BookMyShow + District via SerpAPI site search

const PLATFORMS = [
  { name: "BookMyShow", domains: ["bookmyshow.com"], icon: "🎟️", baseUrl: "https://in.bookmyshow.com/explore/events-mumbai" },
  { name: "District", domains: ["district.in"], icon: "🏙️", baseUrl: "https://www.district.in" },
];

const TARGET_SITES = [
  { name: "BookMyShow", icon: "🎟️", site: "in.bookmyshow.com", base: "https://in.bookmyshow.com/explore/events-mumbai" },
  { name: "District", icon: "🏙️", site: "district.in", base: "https://www.district.in" },
];

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isDeepLink(url) {
  if (!url) return false;
  try {
    const { pathname } = new URL(url.startsWith("http") ? url : "https://" + url);
    return (
      pathname &&
      pathname.length > 3 &&
      !pathname.match(/^\/?(mumbai|events|explore|find|search)?\/?$/i)
    );
  } catch {
    return false;
  }
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
  const iso = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const y = parseInt(iso[1], 10);
    const m = parseInt(iso[2], 10) - 1;
    const d = parseInt(iso[3], 10);
    if (m === targetMonth && y === targetYear) return dateResultFromParts(d, m, y);
    return null;
  }
  const d = new Date(str);
  if (isNaN(d)) return null;
  if (d.getMonth() === targetMonth && d.getFullYear() === targetYear) {
    return dateResultFromParts(d.getDate(), targetMonth, targetYear);
  }
  return null;
}

function parseEventDate(text, month, year) {
  if (!text) return null;
  const time = extractTime(text);

  // ISO: 2026-06-15
  const isoInline = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoInline) {
    const r = parseIsoDate(isoInline[0], month, year);
    if (r) return { ...r, time: r.time || time };
  }

  // 15/06/2026 or 15-06-2026
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

  // Range: 14 - 15 Jun or 14-15 June 2026
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

  // Jun 15, 2026 / June 15 2026
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

  // 15 Jun / 15th June
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

    // Query params: ?date=2026-06-15 or ?on=2026-06-15
    for (const key of ["date", "on", "start", "event_date"]) {
      const val = u.searchParams.get(key);
      if (val) {
        const r = parseIsoDate(val, month, year);
        if (r) return r;
      }
    }

    // Path segment ISO date
    const pathIso = u.pathname.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (pathIso) {
      const r = parseIsoDate(pathIso[0], month, year);
      if (r) return r;
    }

    // BMS-style: /events/.../ET00... or date in slug DD-MM-YYYY
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

function extractJsonLdDates(html, targetMonth, targetYear) {
  const scripts = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (!scripts) return null;

  for (const block of scripts) {
    const inner = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
    try {
      const data = JSON.parse(inner);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
        if (!types.some((t) => t && String(t).toLowerCase().includes("event"))) continue;
        const start = item.startDate || item.startTime;
        if (start) {
          const r = parseIsoDate(String(start), targetMonth, targetYear);
          if (r) return r;
        }
      }
    } catch {
      // try next block
    }
  }
  return null;
}

function extractMetaDates(html, targetMonth, targetYear) {
  const patterns = [
    /property=["']event:start_time["'][^>]*content=["']([^"']+)["']/i,
    /name=["']start_date["'][^>]*content=["']([^"']+)["']/i,
    /property=["']og:start_time["'][^>]*content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      const r = parseIsoDate(m[1], targetMonth, targetYear);
      if (r) return r;
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

async function enrichDateFromPage(url, month, year) {
  const html = await fetchWithTimeout(url);
  if (!html) return null;
  return extractJsonLdDates(html, month, year) || extractMetaDates(html, month, year);
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

function resolveEventDate(text, link, month, year) {
  const fromSnippet = parseEventDate(text, month, year);
  if (fromSnippet) return fromSnippet;

  const fromUrl = parseDateFromUrl(link, month, year);
  if (fromUrl) return fromUrl;

  return null;
}

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
    if (existing.source !== "real" && e.source === "real") {
      existing.source = "real";
      existing.platformIcon = e.platformIcon;
    }
  }

  return [...map.values()];
}

function splitScheduled(events) {
  const scheduled = events.filter((e) => e.day !== null);
  const unscheduled = events.filter((e) => e.day === null);
  return { scheduled, unscheduled };
}

// ─── SerpAPI site search (BookMyShow + District) ─────────────────────────────

async function fetchSiteSearchEvents(hobbies, month, year, serpKey, area = "") {
  const monthName = new Date(year, month, 1).toLocaleString("default", { month: "long" });
  const hobbyStr = hobbies.slice(0, 3).join(" OR ");
  const areaPart = area.trim() ? `${area.trim()} ` : "";
  const results = [];

  await Promise.all(
    TARGET_SITES.map(async (platform) => {
      try {
        const query = `site:${platform.site} ${areaPart}mumbai ${hobbyStr} ${monthName} ${year}`;
        const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${serpKey}&gl=in&hl=en&num=10`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.organic_results) return;

        for (const result of data.organic_results) {
          const link = result.link || "";
          if (!link.includes(platform.site)) continue;

          const text = `${result.title || ""} ${result.snippet || ""}`;
          const name = (result.title || "Event")
            .replace(/\s*[|\-–]\s*(BookMyShow|District).*$/i, "")
            .trim();
          if (name.length < 3) continue;

          const bookingUrl = isDeepLink(link) ? link : platform.base;
          const dateInfo = resolveEventDate(text, link, month, year);

          results.push({
            day: dateInfo ? dateInfo.day : null,
            name,
            venue: "Mumbai",
            time: dateInfo?.time || extractTime(text) || "Check listing",
            price: extractPrice(text) || "See listing",
            platforms: [platform.name],
            platformIcon: platform.icon,
            bookingLinks: { [platform.name]: bookingUrl },
            source: isDeepLink(link) ? "real" : "partial",
            hobby: detectHobby(text, hobbies),
            _enrichUrl: isDeepLink(link) && !dateInfo ? link : null,
          });
        }
      } catch (e) {
        console.error(`Site search error ${platform.name}:`, e.message);
      }
    })
  );

  // Enrich undated deep links from page metadata (max 8 concurrent)
  const toEnrich = results.filter((e) => e._enrichUrl);
  await mapConcurrent(toEnrich, 8, async (event) => {
    const dateInfo = await enrichDateFromPage(event._enrichUrl, month, year);
    if (dateInfo) {
      event.day = dateInfo.day;
      if (dateInfo.time) event.time = dateInfo.time;
    }
  });

  return results.map(({ _enrichUrl, ...e }) => e);
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
