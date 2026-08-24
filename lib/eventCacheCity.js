const crypto = require("crypto");
const {
  ALLOWED_NORMALIZED_CITIES,
  isAllowedNormalizedCity,
} = require("./eventCity");
const { filterCitySafeEvents } = require("./eventPipelineCity");

const EVENT_POOL_CITIES = [...ALLOWED_NORMALIZED_CITIES];
const METRO_SCOPE = "mumbai_navi_mumbai_thane";
const CACHE_KEY_VERSION = 2;

function primaryBookingLink(event) {
  const links = event?.bookingLinks || {};
  return Object.values(links)[0] || event?.url || "";
}

function buildCacheKeyPayload(hobbies, month, year, preferredArea = "") {
  return {
    v: CACHE_KEY_VERSION,
    hobbies: [...(hobbies || [])].sort(),
    month,
    year,
    metroScope: METRO_SCOPE,
    preferredArea: preferredArea || "",
  };
}

function buildCacheKey(hobbies, month, year, preferredArea = "") {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(buildCacheKeyPayload(hobbies, month, year, preferredArea)))
    .digest("hex");
}

function groupedToRow(grouped, month, year) {
  const url = primaryBookingLink(grouped);
  const { days, ...payload } = grouped;
  const venue = grouped.venue && grouped.venue !== "Mumbai" ? grouped.venue : grouped.venue || "Venue not provided";
  return {
    url,
    month,
    year,
    name: grouped.name,
    venue: venue === "Mumbai" ? "Venue not provided" : (grouped.venue || "Venue not provided"),
    platform: grouped.platforms?.[0] || null,
    days: days || [],
    time: grouped.time || "Check listing",
    price: grouped.price || "See listing",
    hobby: grouped.hobby || null,
    enrich_tier: grouped.enrichTier || null,
    normalized_city: grouped.normalizedCity,
    event_payload: payload,
    updated_at: new Date().toISOString(),
  };
}

function rowToGrouped(row) {
  const base = row.event_payload || {};
  return {
    ...base,
    name: row.name,
    venue: row.venue && row.venue !== "Mumbai" ? row.venue : (row.venue || "Venue not provided"),
    time: row.time,
    price: row.price,
    hobby: row.hobby,
    enrichTier: row.enrich_tier,
    normalizedCity: row.normalized_city || base.normalizedCity || null,
    platforms: base.platforms || (row.platform ? [row.platform] : []),
    bookingLinks: base.bookingLinks || (row.platform ? { [row.platform]: row.url } : {}),
    days: row.days || [],
  };
}

function eventsFromCityRows(rows) {
  if (!rows || rows.length === 0) return [];
  const expanded = [];
  for (const row of rows) {
    const grouped = rowToGrouped(row);
    if (!isAllowedNormalizedCity(grouped.normalizedCity)) continue;
    const days = Array.isArray(grouped.days) ? grouped.days : [];
    if (days.length === 0) {
      expanded.push({ ...grouped, day: null });
    } else {
      for (const day of days) {
        expanded.push({ ...grouped, day });
      }
    }
  }
  return filterCitySafeEvents(expanded);
}

function selectPersistableGrouped(grouped) {
  const persistable = [];
  let skippedUnclassifiedCity = 0;
  for (const item of grouped || []) {
    const days = Array.isArray(item.days) ? item.days : [];
    if (days.length === 0) continue;
    if (item.enrichTier === "dead") continue;
    if (!primaryBookingLink(item)) continue;
    if (!isAllowedNormalizedCity(item.normalizedCity)) {
      skippedUnclassifiedCity += 1;
      continue;
    }
    persistable.push(item);
  }
  return { persistable, skippedUnclassifiedCity };
}

module.exports = {
  EVENT_POOL_CITIES,
  METRO_SCOPE,
  CACHE_KEY_VERSION,
  buildCacheKeyPayload,
  buildCacheKey,
  groupedToRow,
  rowToGrouped,
  eventsFromCityRows,
  selectPersistableGrouped,
  primaryBookingLink,
};
