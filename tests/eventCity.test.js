const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ALLOWED_NORMALIZED_CITIES,
  CITY_META,
  isAllowedNormalizedCity,
  getCityLabel,
  classifyLocationText,
  inferCityFromUrl,
  classifyEventCity,
} = require("../lib/eventCity");

test("exposes the three allowed metro cities and exact labels", () => {
  assert.deepEqual(ALLOWED_NORMALIZED_CITIES, ["mumbai", "navi_mumbai", "thane"]);
  assert.equal(CITY_META.mumbai.label, "Mumbai");
  assert.equal(CITY_META.navi_mumbai.label, "Navi Mumbai");
  assert.equal(CITY_META.thane.label, "Thane");
  assert.equal(getCityLabel("mumbai"), "Mumbai");
  assert.equal(getCityLabel("navi_mumbai"), "Navi Mumbai");
  assert.equal(getCityLabel("thane"), "Thane");
  assert.equal(isAllowedNormalizedCity("mumbai"), true);
  assert.equal(isAllowedNormalizedCity("navi_mumbai"), true);
  assert.equal(isAllowedNormalizedCity("thane"), true);
  assert.equal(isAllowedNormalizedCity("pune"), false);
  assert.equal(isAllowedNormalizedCity(""), false);
  assert.equal(isAllowedNormalizedCity(null), false);
});

test("maps Mumbai aliases and neighborhoods", () => {
  const aliases = [
    "Mumbai",
    "Bombay",
    "Bandra",
    "Andheri",
    "Juhu",
    "Lower Parel",
    "Worli",
    "Colaba",
    "Powai",
    "Borivali",
    "Goregaon",
    "Malad",
    "Kandivali",
    "Chembur",
    "Ghatkopar",
    "BKC",
    "Dadar",
    "Fort",
    "Santacruz",
    "Vile Parle",
    "Mulund",
  ];

  for (const alias of aliases) {
    const result = classifyLocationText(alias);
    assert.equal(result.status, "allowed", alias);
    assert.equal(result.normalizedCity, "mumbai", alias);
  }
});

test("maps Navi Mumbai aliases and neighborhoods", () => {
  const aliases = [
    "Navi Mumbai",
    "New Bombay",
    "Vashi",
    "Nerul",
    "Belapur",
    "CBD Belapur",
    "Kharghar",
    "Airoli",
    "Ghansoli",
    "Kopar Khairane",
    "Sanpada",
    "Juinagar",
    "Turbhe",
    "Panvel",
  ];

  for (const alias of aliases) {
    const result = classifyLocationText(alias);
    assert.equal(result.status, "allowed", alias);
    assert.equal(result.normalizedCity, "navi_mumbai", alias);
  }
});

test("maps Thane aliases and neighborhoods", () => {
  const aliases = [
    "Thane",
    "Thane West",
    "Thane East",
    "Ghodbunder Road",
    "Hiranandani Estate",
    "Majiwada",
    "Wagle Estate",
    "Pokhran Road",
  ];

  for (const alias of aliases) {
    const result = classifyLocationText(alias);
    assert.equal(result.status, "allowed", alias);
    assert.equal(result.normalizedCity, "thane", alias);
  }
});

test("does not treat outside cities or unknown localities as Mumbai", () => {
  const outside = ["Pune", "Delhi", "Bengaluru", "Hyderabad", "Ahmedabad"];
  for (const city of outside) {
    const result = classifyLocationText(city);
    assert.notEqual(result.normalizedCity, "mumbai", city);
    assert.equal(result.status, "outside", city);
  }

  const unknown = classifyLocationText("Some Random Hall");
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.normalizedCity, null);

  const empty = classifyLocationText("");
  assert.equal(empty.status, "unknown");
  assert.equal(empty.normalizedCity, null);
});

test("does not match thane as a substring of an unrelated word", () => {
  const result = classifyLocationText("Athens Concert Hall");
  assert.notEqual(result.normalizedCity, "thane");
});

test("classifies city segments from booking URLs", () => {
  assert.deepEqual(
    inferCityFromUrl("https://district.in/mumbai/events/some-slug"),
    { status: "allowed", normalizedCity: "mumbai", source: "url" }
  );
  assert.deepEqual(
    inferCityFromUrl("https://in.bookmyshow.com/navi-mumbai/events/foo/ET00"),
    { status: "allowed", normalizedCity: "navi_mumbai", source: "url" }
  );
  assert.deepEqual(
    inferCityFromUrl("https://district.in/thane/events/workshop"),
    { status: "allowed", normalizedCity: "thane", source: "url" }
  );
  assert.deepEqual(
    inferCityFromUrl("https://in.bookmyshow.com/pune/events/foo/ET00"),
    { status: "outside", normalizedCity: null, source: "url" }
  );
  assert.deepEqual(
    inferCityFromUrl("https://in.bookmyshow.com/events/foo/ET00314123"),
    { status: "unknown", normalizedCity: null, source: "url" }
  );
});

test("JSON-LD Pune outranks a Mumbai URL", () => {
  const result = classifyEventCity({
    url: "https://district.in/mumbai/events/touring-show",
    jsonLdLocation: {
      name: "Phoenix Marketcity",
      address: { addressLocality: "Pune", addressRegion: "Maharashtra" },
    },
    venue: "Mumbai",
  });
  assert.equal(result.status, "outside");
  assert.equal(result.normalizedCity, null);
  assert.equal(result.source, "jsonld");
});

test("JSON-LD Thane outranks a Mumbai venue string", () => {
  const result = classifyEventCity({
    url: "https://in.bookmyshow.com/events/foo/ET00314123",
    jsonLdLocation: {
      name: "Viviana Mall",
      address: { addressLocality: "Thane West" },
    },
    venue: "Mumbai",
  });
  assert.equal(result.status, "allowed");
  assert.equal(result.normalizedCity, "thane");
  assert.equal(result.source, "jsonld");
});

test("conflicting structured locality fields return conflict", () => {
  const result = classifyEventCity({
    url: "https://in.bookmyshow.com/events/foo/ET00",
    jsonLdLocation: {
      name: "Bandra Fort",
      address: { addressLocality: "Thane", streetAddress: "Bandra West" },
    },
    venue: null,
  });
  assert.equal(result.status, "conflict");
  assert.equal(result.normalizedCity, null);
  assert.equal(result.source, "jsonld");
});

test("a non-empty structured locality that is not allowed is outside", () => {
  const result = classifyEventCity({
    url: "https://in.bookmyshow.com/events/foo/ET00",
    jsonLdLocation: {
      address: { addressLocality: "Ahmedabad" },
    },
    venue: "NCPA",
  });
  assert.equal(result.status, "outside");
  assert.equal(result.source, "jsonld");
});

test("falls back to URL then venue when JSON-LD is missing", () => {
  const fromUrl = classifyEventCity({
    url: "https://district.in/navi-mumbai/events/gig",
    jsonLdLocation: null,
    venue: "Some Hall",
  });
  assert.equal(fromUrl.status, "allowed");
  assert.equal(fromUrl.normalizedCity, "navi_mumbai");
  assert.equal(fromUrl.source, "url");

  const fromVenue = classifyEventCity({
    url: "https://in.bookmyshow.com/events/foo/ET00",
    jsonLdLocation: null,
    venue: "Jio World Convention Centre, Bandra Kurla Complex",
  });
  assert.equal(fromVenue.status, "allowed");
  assert.equal(fromVenue.normalizedCity, "mumbai");
  assert.equal(fromVenue.source, "venue");
});

test("cityless URL plus unknown venue is unknown", () => {
  const result = classifyEventCity({
    url: "https://in.bookmyshow.com/events/foo/ET00314123",
    jsonLdLocation: null,
    venue: "Venue not provided",
  });
  assert.equal(result.status, "unknown");
  assert.equal(result.normalizedCity, null);
  assert.equal(result.source, null);
});
