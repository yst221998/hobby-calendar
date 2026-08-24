const test = require("node:test");
const assert = require("node:assert/strict");

const { formatEventLocation } = require("../lib/eventDisplay");

test("formats venue and city together", () => {
  assert.equal(
    formatEventLocation({ venue: "Viviana Mall", normalizedCity: "thane" }),
    "Viviana Mall · Thane"
  );
});

test("omits placeholder venues", () => {
  assert.equal(
    formatEventLocation({ venue: "Venue not provided", normalizedCity: "navi_mumbai" }),
    "Navi Mumbai"
  );
});

test("marks legacy rows without a verified city", () => {
  assert.equal(formatEventLocation({ normalizedCity: null }), "Location not verified");
});

test("does not duplicate a city already present in the venue", () => {
  assert.equal(
    formatEventLocation({ venue: "Prithvi Theatre, Mumbai", normalizedCity: "mumbai" }),
    "Prithvi Theatre, Mumbai"
  );
});
