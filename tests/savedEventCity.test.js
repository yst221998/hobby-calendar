const test = require("node:test");
const assert = require("node:assert/strict");

const {
  stubFromSavedRow,
  validateSavedEventWrite,
  mergeSavedWithDetails,
} = require("../lib/savedEventCity");

test("POST validation rejects a missing or invalid normalizedCity", () => {
  const missing = validateSavedEventWrite({
    eventUrl: "https://example.com/event",
    month: 7,
    year: 2026,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.status, 400);

  const invalid = validateSavedEventWrite({
    eventUrl: "https://example.com/event",
    month: 7,
    year: 2026,
    normalizedCity: "pune",
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.status, 400);
});

test("a saved Thane row restores normalizedCity thane", () => {
  const event = stubFromSavedRow({
    event_url: "https://example.com/thane",
    event_name: "Mall Concert",
    platform: "District",
    venue: "Viviana Mall",
    normalized_city: "thane",
  });

  assert.equal(event.normalizedCity, "thane");
  assert.equal(event.venue, "Viviana Mall");
  assert.equal(event.locationVerificationRequired, false);
});

test("a legacy saved row never invents Mumbai", () => {
  const event = stubFromSavedRow({
    event_url: "https://example.com/legacy",
    event_name: "Old save",
    platform: "BookMyShow",
  });

  assert.equal(event.normalizedCity, null);
  assert.equal(event.locationVerificationRequired, true);
  assert.notEqual(event.venue, "Mumbai");
  assert.equal(event.venue, "Venue not provided");
});

test("merge prefers joined details only when the joined city is allowed", () => {
  const { events } = mergeSavedWithDetails(
    [{ event_url: "https://example.com/a", month: 7, year: 2026, event_name: "Joined", normalized_city: "mumbai" }],
    [{
      name: "Joined live",
      normalizedCity: "mumbai",
      bookingLinks: { BookMyShow: "https://example.com/a" },
      platforms: ["BookMyShow"],
    }]
  );
  assert.equal(events[0].normalizedCity, "mumbai");
  assert.equal(events[0].name, "Joined live");

  const unverified = mergeSavedWithDetails(
    [{ event_url: "https://example.com/b", month: 7, year: 2026, event_name: "Legacy" }],
    [{
      name: "Bad join",
      normalizedCity: "pune",
      bookingLinks: { BookMyShow: "https://example.com/b" },
      platforms: ["BookMyShow"],
    }]
  );
  assert.equal(unverified.events[0].normalizedCity, null);
  assert.equal(unverified.events[0].locationVerificationRequired, true);
});
