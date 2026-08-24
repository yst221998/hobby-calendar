const test = require("node:test");
const assert = require("node:assert/strict");

const {
  saveGuestDraft,
  readGuestDraft,
  clearGuestDraft,
} = require("../lib/guestDraft");

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("saves and restores a valid guest calendar draft", () => {
  const storage = createStorage();
  const draft = {
    hobbies: ["Music", "Comedy"],
    preferredArea: "Bandra",
    location: "Bandra",
    month: 7,
    year: 2026,
  };

  assert.equal(saveGuestDraft({ hobbies: draft.hobbies, location: "Bandra", month: 7, year: 2026 }, storage), true);
  assert.deepEqual(readGuestDraft(storage), draft);
});

test("does not save an empty hobby draft", () => {
  const storage = createStorage();

  assert.equal(
    saveGuestDraft({ hobbies: [], location: "", month: 7, year: 2026 }, storage),
    false
  );
  assert.equal(readGuestDraft(storage), null);
});

test("clears a saved guest draft", () => {
  const storage = createStorage();
  saveGuestDraft(
    { hobbies: ["Music"], location: "", month: 7, year: 2026 },
    storage
  );

  clearGuestDraft(storage);

  assert.equal(readGuestDraft(storage), null);
});

test("restores preferredArea from a newly saved draft", () => {
  const storage = createStorage();
  saveGuestDraft(
    { hobbies: ["Music"], preferredArea: "Vashi", month: 7, year: 2026 },
    storage
  );
  const draft = readGuestDraft(storage);
  assert.equal(draft.preferredArea, "Vashi");
  assert.equal(draft.location, "Vashi");
});

test("ignores malformed stored drafts", () => {
  const storage = createStorage();
  storage.setItem("hobbymap-guest-draft", "{not-json");

  assert.equal(readGuestDraft(storage), null);
});
