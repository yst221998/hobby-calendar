const ALLOWED_NORMALIZED_CITIES = ["mumbai", "navi_mumbai", "thane"];

const CITY_META = {
  mumbai: { label: "Mumbai" },
  navi_mumbai: { label: "Navi Mumbai" },
  thane: { label: "Thane" },
};

const GENERIC_REGIONS = new Set([
  "maharashtra",
  "india",
  "mh",
  "in",
  "maharashtra india",
  "mumbai metropolitan region",
  "mmr",
]);

const MUMBAI_ALIASES = [
  "vile parle",
  "lower parel",
  "bandra kurla complex",
  "mumbai",
  "bombay",
  "bandra",
  "andheri",
  "juhu",
  "worli",
  "colaba",
  "powai",
  "borivali",
  "goregaon",
  "malad",
  "kandivali",
  "chembur",
  "ghatkopar",
  "bkc",
  "dadar",
  "fort",
  "santacruz",
  "mulund",
  "khar",
  "mahalaxmi",
  "parel",
  "prabhadevi",
  "sion",
  "kurla",
  "vikhroli",
  "kandivli",
  "versova",
  "lokhandwala",
  "juhu beach",
  "nariman point",
  "cst",
  "churchgate",
  "grant road",
  "byculla",
  "wadala",
  "chembur east",
  "andheri west",
  "andheri east",
  "bandra west",
  "bandra east",
];

const NAVI_MUMBAI_ALIASES = [
  "kopar khairane",
  "cbd belapur",
  "navi mumbai",
  "new bombay",
  "navimumbai",
  "vashi",
  "nerul",
  "belapur",
  "kharghar",
  "airoli",
  "ghansoli",
  "sanpada",
  "juinagar",
  "turbhe",
  "panvel",
  "seawoods",
  "kamothe",
  "kalamboli",
  "ulwe",
];

const THANE_ALIASES = [
  "ghodbunder road",
  "hiranandani estate",
  "wagle estate",
  "pokhran road",
  "thane west",
  "thane east",
  "thane",
  "majiwada",
  "manpada",
  "kolshet",
  "kapurbawdi",
  "ghodbunder",
];

const OUTSIDE_ALIASES = [
  "new delhi",
  "bengaluru",
  "bangalore",
  "hyderabad",
  "ahmedabad",
  "chennai",
  "kolkata",
  "gurugram",
  "gurgaon",
  "noida",
  "pune",
  "delhi",
  "goa",
  "nashik",
  "lonavala",
  "jaipur",
  "lucknow",
  "indore",
  "nagpur",
  "surat",
  "mysore",
  "mysuru",
  "chandigarh",
  "kochi",
  "whitefield",
];

const ALLOWED_ALIAS_ENTRIES = [
  ...NAVI_MUMBAI_ALIASES.map((alias) => ({ alias, city: "navi_mumbai" })),
  ...THANE_ALIASES.map((alias) => ({ alias, city: "thane" })),
  ...MUMBAI_ALIASES.map((alias) => ({ alias, city: "mumbai" })),
];

const UNKNOWN_RESULT = { status: "unknown", normalizedCity: null, source: null };
const OUTSIDE_CITIES_PATH = [
  "pune",
  "delhi",
  "new-delhi",
  "bangalore",
  "bengaluru",
  "hyderabad",
  "chennai",
  "kolkata",
  "goa",
  "noida",
  "gurgaon",
  "gurugram",
  "ahmedabad",
  "nashik",
  "lonavala",
];

function isAllowedNormalizedCity(value) {
  return ALLOWED_NORMALIZED_CITIES.includes(value);
}

function getCityLabel(value) {
  return CITY_META[value]?.label || "";
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findPhraseMatches(normalized, phrase) {
  const needle = normalizeText(phrase);
  if (!normalized || !needle) return [];
  const pattern = new RegExp(`(?:^|\\s)(${needle.replace(/\s+/g, "\\s+")})(?=\\s|$)`, "g");
  const matches = [];
  let match;
  while ((match = pattern.exec(normalized))) {
    const start = match.index + match[0].indexOf(match[1]);
    matches.push({ start, end: start + match[1].length });
  }
  return matches;
}

function dropOverlapped(matches) {
  const sorted = [...matches].sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const kept = [];
  for (const candidate of sorted) {
    const insideLonger = kept.some(
      (other) => candidate.start >= other.start && candidate.end <= other.end
    );
    if (!insideLonger) kept.push(candidate);
  }
  return kept;
}

function classifyLocationText(text) {
  const normalized = normalizeText(text);
  if (!normalized) return { ...UNKNOWN_RESULT };

  const allowedHits = [];
  for (const entry of ALLOWED_ALIAS_ENTRIES) {
    for (const span of findPhraseMatches(normalized, entry.alias)) {
      allowedHits.push({ ...span, city: entry.city });
    }
  }

  const outsideHits = [];
  for (const alias of OUTSIDE_ALIASES) {
    for (const span of findPhraseMatches(normalized, alias)) {
      outsideHits.push(span);
    }
  }

  const allowedKept = dropOverlapped(allowedHits);
  const outsideKept = dropOverlapped(
    outsideHits.filter((outside) =>
      !allowedKept.some((allowed) => outside.start >= allowed.start && outside.end <= allowed.end)
    )
  );

  const cities = new Set(allowedKept.map((hit) => hit.city));
  if (cities.size > 1) {
    return { status: "conflict", normalizedCity: null, source: null };
  }
  if (cities.size === 1 && outsideKept.length === 0) {
    return {
      status: "allowed",
      normalizedCity: [...cities][0],
      source: null,
    };
  }
  if (outsideKept.length > 0) {
    return { status: "outside", normalizedCity: null, source: null };
  }
  if (cities.size === 1) {
    return {
      status: "allowed",
      normalizedCity: [...cities][0],
      source: null,
    };
  }
  return { ...UNKNOWN_RESULT };
}

function pathSegments(url) {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.pathname.toLowerCase().split("/").filter(Boolean);
  } catch {
    return String(url || "")
      .toLowerCase()
      .split(/[/?#]/)
      .filter(Boolean);
  }
}

function inferCityFromUrl(url) {
  if (!url) return { ...UNKNOWN_RESULT, source: "url" };
  const segments = pathSegments(url).map((segment) => segment.replace(/_/g, "-"));

  if (segments.some((segment) => segment === "navi-mumbai" || segment === "navimumbai" || segment === "new-bombay")) {
    return { status: "allowed", normalizedCity: "navi_mumbai", source: "url" };
  }
  if (segments.some((segment) => segment === "thane")) {
    return { status: "allowed", normalizedCity: "thane", source: "url" };
  }
  if (segments.some((segment) => segment === "mumbai" || segment === "bombay")) {
    return { status: "allowed", normalizedCity: "mumbai", source: "url" };
  }
  if (segments.some((segment) => OUTSIDE_CITIES_PATH.includes(segment))) {
    return { status: "outside", normalizedCity: null, source: "url" };
  }
  return { ...UNKNOWN_RESULT, source: "url" };
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function collectJsonLdLocations(location) {
  const nodes = [];
  for (const item of asArray(location)) {
    if (item == null) continue;
    if (typeof item === "string") {
      nodes.push({ name: item, address: null });
      continue;
    }
    if (typeof item !== "object") continue;
    nodes.push(item);
    if (item.address) {
      for (const nested of asArray(item.address)) {
        if (nested && typeof nested === "object") nodes.push(nested);
      }
    }
  }
  return nodes;
}

function classifyJsonLdLocation(location) {
  if (location == null || location === "") {
    return { ...UNKNOWN_RESULT, source: "jsonld" };
  }

  const allowedCities = new Set();
  let sawOutside = false;
  let sawUnmappedLocality = false;

  for (const node of collectJsonLdLocations(location)) {
    const locality = typeof node.addressLocality === "string" ? node.addressLocality : node.address?.addressLocality;
    const region = typeof node.addressRegion === "string" ? node.addressRegion : node.address?.addressRegion;
    const street = typeof node.streetAddress === "string" ? node.streetAddress : node.address?.streetAddress;
    const name = typeof node.name === "string" ? node.name : "";

    if (typeof locality === "string" && locality.trim()) {
      const result = classifyLocationText(locality);
      if (result.status === "allowed") allowedCities.add(result.normalizedCity);
      else if (result.status === "outside" || result.status === "conflict") sawOutside = true;
      else sawUnmappedLocality = true;
    }

    if (typeof region === "string" && region.trim()) {
      const normalizedRegion = normalizeText(region);
      if (!GENERIC_REGIONS.has(normalizedRegion)) {
        const result = classifyLocationText(region);
        if (result.status === "allowed") allowedCities.add(result.normalizedCity);
        else if (result.status === "outside" || result.status === "conflict") sawOutside = true;
      }
    }

    if (typeof street === "string" && street.trim()) {
      const result = classifyLocationText(street);
      if (result.status === "allowed") allowedCities.add(result.normalizedCity);
      else if (result.status === "outside" || result.status === "conflict") sawOutside = true;
    }

    if (name.trim()) {
      const result = classifyLocationText(name);
      if (result.status === "allowed") allowedCities.add(result.normalizedCity);
      else if (result.status === "outside" || result.status === "conflict") sawOutside = true;
    }
  }

  if (sawOutside || sawUnmappedLocality) {
    return { status: "outside", normalizedCity: null, source: "jsonld" };
  }
  if (allowedCities.size > 1) {
    return { status: "conflict", normalizedCity: null, source: "jsonld" };
  }
  if (allowedCities.size === 1) {
    return {
      status: "allowed",
      normalizedCity: [...allowedCities][0],
      source: "jsonld",
    };
  }
  return { ...UNKNOWN_RESULT, source: "jsonld" };
}

function classifyEventCity(evidence = {}) {
  const jsonLd = classifyJsonLdLocation(evidence.jsonLdLocation);
  if (jsonLd.status === "allowed" || jsonLd.status === "outside" || jsonLd.status === "conflict") {
    return jsonLd;
  }

  const fromUrl = inferCityFromUrl(evidence.url);
  if (fromUrl.status === "allowed" || fromUrl.status === "outside") {
    return fromUrl;
  }

  const venueText = evidence.venue && evidence.venue !== "Venue not provided" ? evidence.venue : "";
  const fromVenue = classifyLocationText(venueText);
  if (fromVenue.status === "allowed" || fromVenue.status === "outside" || fromVenue.status === "conflict") {
    return { ...fromVenue, source: "venue" };
  }

  return { ...UNKNOWN_RESULT };
}

module.exports = {
  ALLOWED_NORMALIZED_CITIES,
  CITY_META,
  isAllowedNormalizedCity,
  getCityLabel,
  classifyLocationText,
  inferCityFromUrl,
  classifyEventCity,
};
