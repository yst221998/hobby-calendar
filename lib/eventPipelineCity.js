const {
  classifyEventCity,
  isAllowedNormalizedCity,
} = require("./eventCity");

function extractVenueFromLocation(loc) {
  if (!loc) return "";
  if (typeof loc === "string") return loc.trim();
  if (loc.name) return String(loc.name).trim();
  if (loc.address?.name) return String(loc.address.name).trim();
  if (loc.address?.addressLocality) return String(loc.address.addressLocality).trim();
  if (loc.addressLocality) return String(loc.addressLocality).trim();
  return "";
}

function buildMetroLocationPart(preferredArea = "") {
  const metroScope = '(Mumbai OR "Navi Mumbai" OR Thane) Maharashtra';
  const preferred = preferredArea?.trim() ? `"${preferredArea.trim()}"` : "";
  return `${preferred} ${metroScope}`.trim();
}

function recordCityRejection(debug, classification) {
  if (!debug) return;
  if (classification.status === "outside") debug.rejectedOutsideMetro = (debug.rejectedOutsideMetro || 0) + 1;
  else if (classification.status === "conflict") debug.rejectedCityConflict = (debug.rejectedCityConflict || 0) + 1;
  else debug.rejectedUnknownCity = (debug.rejectedUnknownCity || 0) + 1;
}

function displayVenue(venue) {
  const trimmed = typeof venue === "string" ? venue.trim() : "";
  if (!trimmed || trimmed.toLowerCase() === "mumbai") return "Venue not provided";
  return trimmed;
}

function applyCityToEnrichedCandidate(candidate, pageData, debug = {}) {
  const url = candidate._pageUrl || Object.values(candidate.bookingLinks || {})[0] || "";

  if (pageData?.dead) return null;

  const venueEvidence = pageData?.valid
    ? pageData.venue || candidate.venue
    : candidate.venue;
  const classification = classifyEventCity({
    url,
    jsonLdLocation: pageData?.jsonLdLocation || null,
    venue: pageData?.valid ? venueEvidence : venueEvidence,
  });

  if (!pageData?.valid) {
    const fallbackVenue = displayVenue(candidate.venue) === "Venue not provided" ? "" : candidate.venue;
    const fallbackClassification = classifyEventCity({
      url,
      jsonLdLocation: null,
      venue: fallbackVenue,
    });
    if (fallbackClassification.status !== "allowed") {
      recordCityRejection(debug, fallbackClassification);
      return null;
    }
    return {
      ...candidate,
      venue: displayVenue(candidate.venue),
      normalizedCity: fallbackClassification.normalizedCity,
      enrichTier: "fallback",
      _days: [],
    };
  }

  if (classification.status !== "allowed") {
    recordCityRejection(debug, classification);
    return null;
  }

  return {
    ...candidate,
    name: pageData.name || candidate.name,
    venue: displayVenue(pageData.venue || candidate.venue),
    time: pageData.time || candidate.time,
    normalizedCity: classification.normalizedCity,
    source: "real",
    enrichTier: "confirmed",
    _days: pageData.days || [],
  };
}

function filterCitySafeEvents(events, debug = {}) {
  const kept = [];
  for (const event of events || []) {
    if (isAllowedNormalizedCity(event?.normalizedCity)) {
      kept.push(event);
      if (debug.cityBreakdown && debug.cityBreakdown[event.normalizedCity] != null) {
        debug.cityBreakdown[event.normalizedCity] += 1;
      }
    } else {
      debug.invariantCityDrops = (debug.invariantCityDrops || 0) + 1;
    }
  }
  return kept;
}

module.exports = {
  extractVenueFromLocation,
  buildMetroLocationPart,
  applyCityToEnrichedCandidate,
  filterCitySafeEvents,
  recordCityRejection,
  displayVenue,
};
