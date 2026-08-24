const GUEST_DRAFT_KEY = "hobbymap-guest-draft";

function getStorage(storage) {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function normalizeDraft(value) {
  if (!value || !Array.isArray(value.hobbies) || value.hobbies.length === 0) {
    return null;
  }

  const hobbies = value.hobbies.filter(
    (hobby) => typeof hobby === "string" && hobby.trim()
  );
  if (hobbies.length === 0) return null;

  return {
    hobbies,
    location: typeof value.location === "string" ? value.location : "",
    month: Number.isInteger(value.month) ? value.month : new Date().getMonth(),
    year: Number.isInteger(value.year) ? value.year : new Date().getFullYear(),
  };
}

function saveGuestDraft(draft, storage) {
  const target = getStorage(storage);
  const normalized = normalizeDraft(draft);
  if (!target || !normalized) return false;

  try {
    target.setItem(GUEST_DRAFT_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

function readGuestDraft(storage) {
  const target = getStorage(storage);
  if (!target) return null;

  try {
    const raw = target.getItem(GUEST_DRAFT_KEY);
    return raw ? normalizeDraft(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function clearGuestDraft(storage) {
  const target = getStorage(storage);
  if (!target) return;

  try {
    target.removeItem(GUEST_DRAFT_KEY);
  } catch {
    // Storage may be unavailable in private browsing modes.
  }
}

module.exports = {
  GUEST_DRAFT_KEY,
  saveGuestDraft,
  readGuestDraft,
  clearGuestDraft,
};
