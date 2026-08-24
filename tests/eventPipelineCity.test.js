const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyCityToEnrichedCandidate,
  extractVenueFromLocation,
  buildMetroLocationPart,
  filterCitySafeEvents,
} = require("../lib/eventPipelineCity");

function debugStats() {
  return {
    rejectedOutsideMetro: 0,
    rejectedUnknownCity: 0,
    rejectedCityConflict: 0,
    invariantCityDrops: 0,
    cityBreakdown: { mumbai: 0, navi_mumbai: 0, thane: 0 },
  };
}

function candidate(overrides = {}) {
  return {
    name: "Saturday Night Gig",
    venue: "",
    time: "Check listing",
    price: "See listing",
    platforms: ["District"],
    platformIcon: "🏙️",
    bookingLinks: { District: "https://district.in/mumbai/events/saturday-night-gig" },
    source: "real",
    hobby: "Music",
    _pageUrl: "https://district.in/mumbai/events/saturday-night-gig",
    _days: [],
    ...overrides,
  };
}

test("extractVenueFromLocation does not default missing venues to Mumbai", () => {
  assert.equal(extractVenueFromLocation(null), "");
  assert.equal(extractVenueFromLocation({ name: "Prithvi Theatre" }), "Prithvi Theatre");
  assert.equal(
    extractVenueFromLocation({ address: { addressLocality: "Thane West" } }),
    "Thane West"
  );
});

test("metro query scope covers Mumbai, Navi Mumbai, and Thane", () => {
  assert.match(buildMetroLocationPart(""), /Mumbai/);
  assert.match(buildMetroLocationPart(""), /Navi Mumbai/);
  assert.match(buildMetroLocationPart(""), /Thane/);
  assert.match(buildMetroLocationPart("Bandra"), /Bandra/);
  assert.doesNotMatch(buildMetroLocationPart("Bandra"), /Bandra Mumbai$/);
});

test("a Mumbai URL with blocked enrichment remains a TBD event", () => {
  const result = applyCityToEnrichedCandidate(
    candidate(),
    { valid: false, dead: false },
    debugStats()
  );
  assert.equal(result.normalizedCity, "mumbai");
  assert.equal(result.enrichTier, "fallback");
  assert.equal(result.day, undefined);
});

test("a cityless URL with no structured or venue city is rejected", () => {
  const result = applyCityToEnrichedCandidate(
    candidate({
      _pageUrl: "https://in.bookmyshow.com/events/foo/ET00314123",
      bookingLinks: { BookMyShow: "https://in.bookmyshow.com/events/foo/ET00314123" },
      venue: "",
    }),
    { valid: false, dead: false },
    debugStats()
  );
  assert.equal(result, null);
});

test("a Mumbai URL whose JSON-LD locality is Pune is rejected", () => {
  const result = applyCityToEnrichedCandidate(
    candidate(),
    {
      valid: true,
      dead: false,
      name: "Touring Comedy Night",
      venue: "Phoenix Marketcity",
      jsonLdLocation: { address: { addressLocality: "Pune" } },
      days: [12],
      time: "8:00 PM",
    },
    debugStats()
  );
  assert.equal(result, null);
});

test("JSON-LD locality Vashi produces navi_mumbai", () => {
  const result = applyCityToEnrichedCandidate(
    candidate({
      _pageUrl: "https://in.bookmyshow.com/events/vashi-gig/ET00",
      bookingLinks: { BookMyShow: "https://in.bookmyshow.com/events/vashi-gig/ET00" },
    }),
    {
      valid: true,
      dead: false,
      name: "Vashi Live",
      venue: "Inorbit Mall",
      jsonLdLocation: { address: { addressLocality: "Vashi" } },
      days: [5],
      time: "7:00 PM",
    },
    debugStats()
  );
  assert.equal(result.normalizedCity, "navi_mumbai");
  assert.equal(result.venue, "Inorbit Mall");
});

test("JSON-LD locality Thane West produces thane", () => {
  const result = applyCityToEnrichedCandidate(
    candidate({
      _pageUrl: "https://in.bookmyshow.com/events/viviana/ET00",
      bookingLinks: { BookMyShow: "https://in.bookmyshow.com/events/viviana/ET00" },
    }),
    {
      valid: true,
      dead: false,
      name: "Mall Concert",
      venue: "Viviana Mall",
      jsonLdLocation: { address: { addressLocality: "Thane West" } },
      days: [18],
    },
    debugStats()
  );
  assert.equal(result.normalizedCity, "thane");
});

test("filterCitySafeEvents drops events without an allowed city and never repairs them", () => {
  const kept = filterCitySafeEvents(
    [
      { name: "A", normalizedCity: "mumbai" },
      { name: "B", normalizedCity: "pune" },
      { name: "C", normalizedCity: null },
      { name: "D", normalizedCity: "thane" },
    ],
    debugStats()
  );
  assert.deepEqual(
    kept.map((event) => event.name),
    ["A", "D"]
  );
  assert.ok(kept.every((event) => ["mumbai", "navi_mumbai", "thane"].includes(event.normalizedCity)));
});
