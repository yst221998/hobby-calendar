const { getCityLabel, isAllowedNormalizedCity } = require("./eventCity");

function formatEventLocation(event = {}) {
  if (!isAllowedNormalizedCity(event.normalizedCity)) {
    return "Location not verified";
  }

  const city = getCityLabel(event.normalizedCity);
  const venue = typeof event.venue === "string" ? event.venue.trim() : "";
  if (!venue || venue === "Venue not provided" || venue.toLowerCase() === city.toLowerCase()) {
    return city;
  }

  const venueLower = venue.toLowerCase();
  if (venueLower.endsWith(city.toLowerCase()) || venueLower.includes(`, ${city.toLowerCase()}`)) {
    return venue;
  }

  return `${venue} · ${city}`;
}

function eventTooltip(event = {}) {
  const location = formatEventLocation(event);
  const name = event.name || "Event";
  if (location === "Location not verified") return `${name} · ${location}`;
  return `${name} · ${location}`;
}

module.exports = {
  formatEventLocation,
  eventTooltip,
};
