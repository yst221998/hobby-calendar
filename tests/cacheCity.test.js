const test = require("node:test");
const assert = require("node:assert/strict");

const {
  groupedToRow,
  rowToGrouped,
  eventsFromCityRows,
  buildCacheKey,
  buildCacheKeyPayload,
  selectPersistableGrouped,
  EVENT_POOL_CITIES,
} = require("../lib/eventCacheCity");

test("groupedToRow writes normalized_city and does not invent Mumbai as venue", () => {
  const row = groupedToRow(
    {
      name: "Mall Concert",
      venue: "Viviana Mall",
      normalizedCity: "thane",
      platforms: ["District"],
      bookingLinks: { District: "https://district.in/thane/events/mall-concert" },
      days: [8],
      time: "7:00 PM",
      price: "See listing",
      hobby: "Music",
      enrichTier: "confirmed",
    },
    7,
    2026
  );

  assert.equal(row.normalized_city, "thane");
  assert.equal(row.venue, "Viviana Mall");
});

test("rowToGrouped restores normalizedCity", () => {
  const grouped = rowToGrouped({
    name: "Vashi Live",
    venue: "Inorbit Mall",
    normalized_city: "navi_mumbai",
    days: [5],
    url: "https://example.com/vashi",
    platform: "BookMyShow",
    event_payload: { platforms: ["BookMyShow"] },
  });

  assert.equal(grouped.normalizedCity, "navi_mumbai");
  assert.equal(grouped.venue, "Inorbit Mall");
});

test("eventsFromCityRows drops rows with null or invalid city", () => {
  const events = eventsFromCityRows([
    {
      name: "Keep",
      venue: "NCPA",
      normalized_city: "mumbai",
      days: [1],
      url: "https://example.com/keep",
      event_payload: { bookingLinks: { BookMyShow: "https://example.com/keep" }, platforms: ["BookMyShow"] },
    },
    {
      name: "Null city",
      venue: "Unknown",
      normalized_city: null,
      days: [1],
      url: "https://example.com/null",
      event_payload: {},
    },
    {
      name: "Pune",
      venue: "Pune",
      normalized_city: "pune",
      days: [1],
      url: "https://example.com/pune",
      event_payload: {},
    },
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].name, "Keep");
  assert.equal(events[0].normalizedCity, "mumbai");
});

test("buildCacheKey includes a version marker so old keys cannot hit", () => {
  const payload = buildCacheKeyPayload(["Music"], 7, 2026, "Bandra");
  assert.equal(payload.v, 2);
  assert.equal(payload.metroScope, "mumbai_navi_mumbai_thane");
  assert.equal(payload.preferredArea, "Bandra");

  const mumbaiKey = buildCacheKey(["Music"], 7, 2026, "");
  const thaneAreaKey = buildCacheKey(["Music"], 7, 2026, "Thane West");
  assert.notEqual(mumbaiKey, thaneAreaKey);
  assert.notEqual(mumbaiKey, buildCacheKey(["Comedy"], 7, 2026, ""));
});

test("pool queries are constrained to the three allowed cities", () => {
  assert.deepEqual(EVENT_POOL_CITIES, ["mumbai", "navi_mumbai", "thane"]);
});

test("persistence skips events without an allowed city", () => {
  const { persistable, skippedUnclassifiedCity } = selectPersistableGrouped([
    {
      name: "Keep",
      normalizedCity: "mumbai",
      days: [3],
      bookingLinks: { BookMyShow: "https://example.com/keep" },
    },
    {
      name: "Skip",
      normalizedCity: null,
      days: [3],
      bookingLinks: { BookMyShow: "https://example.com/skip" },
    },
    {
      name: "Outside",
      normalizedCity: "pune",
      days: [4],
      bookingLinks: { BookMyShow: "https://example.com/pune" },
    },
  ]);

  assert.equal(persistable.length, 1);
  assert.equal(persistable[0].name, "Keep");
  assert.equal(skippedUnclassifiedCity, 2);
});
