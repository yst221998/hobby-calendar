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
    location: "Bandra",
    month: 7,
    year: 2026,
  };

  assert.equal(saveGuestDraft(draft, storage), true);
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

test("ignores malformed stored drafts", () => {
  const storage = createStorage();
  storage.setItem("hobbymap-guest-draft", "{not-json");

  assert.equal(readGuestDraft(storage), null);
});
