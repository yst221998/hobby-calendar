const { isAllowedNormalizedCity } = require("./eventCity");

function validateSavedEventWrite(body = {}) {
  const { eventUrl, month, year, normalizedCity } = body;
  if (!eventUrl || typeof month !== "number" || typeof year !== "number") {
    return { ok: false, status: 400, error: "eventUrl, month, and year are required" };
  }
  if (!isAllowedNormalizedCity(normalizedCity)) {
    return {
      ok: false,
      status: 400,
      error: "normalizedCity must be mumbai, navi_mumbai, or thane",
    };
  }
  return { ok: true, status: 200, error: null };
}

function stubFromSavedRow(row) {
  const platform = row.platform || "BookMyShow";
  const icon = platform === "District" ? "🏙️" : "🎟️";
  const normalizedCity = isAllowedNormalizedCity(row.normalized_city) ? row.normalized_city : null;
  const venue = row.venue && row.venue !== "Mumbai" ? row.venue : "Venue not provided";
  return {
    name: row.event_name || "Saved event",
    venue,
    normalizedCity,
    locationVerificationRequired: !normalizedCity,
    time: "Check listing",
    price: "See listing",
    platforms: [platform],
    platformIcon: icon,
    bookingLinks: { [platform]: row.event_url },
    source: "real",
    hobby: null,
    day: null,
    enrichTier: "saved",
  };
}

function eventUrl(event) {
  const links = event?.bookingLinks || {};
  return Object.values(links)[0] || "";
}

function mergeSavedWithDetails(savedRows, detailEvents) {
  const byUrl = new Map();
  for (const ev of detailEvents || []) {
    const url = eventUrl(ev);
    if (!url) continue;
    if (!isAllowedNormalizedCity(ev.normalizedCity)) continue;
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(ev);
  }

  const events = [];
  const savedUrls = [];

  for (const row of savedRows || []) {
    const key = `${row.event_url}|${row.month}|${row.year}`;
    savedUrls.push(key);

    const matches = byUrl.get(row.event_url);
    if (matches && matches.length > 0) {
      events.push(...matches);
    } else {
      events.push(stubFromSavedRow(row));
    }
  }

  return { events, savedUrls };
}

module.exports = {
  validateSavedEventWrite,
  stubFromSavedRow,
  mergeSavedWithDetails,
};
