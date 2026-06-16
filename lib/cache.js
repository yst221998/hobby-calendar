import crypto from "crypto";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import {
  fetchRealEvents,
  groupEventsByUrl,
  expandGroupedEvents,
  dedupeEvents,
  splitScheduled,
  primaryBookingLink,
} from "./events";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function buildCacheKey(hobbies, month, year, city) {
  const payload = JSON.stringify({
    hobbies: [...hobbies].sort(),
    month,
    year,
    city: city || "Mumbai",
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function daysEqual(a, b) {
  const sa = [...(a || [])].sort((x, y) => x - y).join(",");
  const sb = [...(b || [])].sort((x, y) => x - y).join(",");
  return sa === sb;
}

function groupedToRow(grouped, month, year) {
  const url = primaryBookingLink(grouped);
  const { days, ...payload } = grouped;
  return {
    url,
    month,
    year,
    name: grouped.name,
    venue: grouped.venue || "Mumbai",
    platform: grouped.platforms?.[0] || null,
    days: days || [],
    time: grouped.time || "Check listing",
    price: grouped.price || "See listing",
    hobby: grouped.hobby || null,
    enrich_tier: grouped.enrichTier || null,
    event_payload: payload,
    updated_at: new Date().toISOString(),
  };
}

function rowToGrouped(row) {
  const base = row.event_payload || {};
  return {
    ...base,
    name: row.name,
    venue: row.venue,
    time: row.time,
    price: row.price,
    hobby: row.hobby,
    enrichTier: row.enrich_tier,
    platforms: base.platforms || (row.platform ? [row.platform] : []),
    bookingLinks: base.bookingLinks || (row.platform ? { [row.platform]: row.url } : {}),
    days: row.days || [],
  };
}

async function loadEventsFromUrls(urls, month, year) {
  const supabase = getSupabase();
  if (!supabase || urls.length === 0) return null;

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("month", month)
    .eq("year", year)
    .in("url", urls);

  if (error) {
    console.error("Cache load error:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  const grouped = data.map(rowToGrouped);
  const expanded = expandGroupedEvents(grouped);
  return dedupeEvents(expanded);
}

export async function persistEventsAndCache(hobbies, city, month, year, fetchResult) {
  const supabase = getSupabase();
  if (!supabase) return { newEvents: 0, dateChanges: 0 };

  if (!fetchResult.events || fetchResult.events.length === 0) {
    return { newEvents: 0, dateChanges: 0, skippedEmpty: true };
  }

  const cacheKey = buildCacheKey(hobbies, month, year, city);
  const grouped = groupEventsByUrl(fetchResult.events);
  let newEvents = 0;
  let dateChanges = 0;
  const urls = [];

  for (const g of grouped) {
    const url = primaryBookingLink(g);
    if (!url) continue;
    urls.push(url);

    const row = groupedToRow(g, month, year);

    const { data: existing } = await supabase
      .from("events")
      .select("days, name")
      .eq("url", url)
      .eq("month", month)
      .eq("year", year)
      .maybeSingle();

    if (!existing) {
      newEvents += 1;
    } else if (!daysEqual(existing.days, row.days)) {
      await supabase.from("event_changelog").insert({
        url,
        event_name: row.name,
        old_days: existing.days,
        new_days: row.days,
        month,
        year,
      });
      dateChanges += 1;
    }

    const { error } = await supabase.from("events").upsert(row, {
      onConflict: "url,month,year",
    });
    if (error) console.error("Event upsert error:", error.message);
  }

  const { error: cacheError } = await supabase.from("search_cache").upsert(
    {
      cache_key: cacheKey,
      hobbies,
      city: city || "Mumbai",
      month,
      year,
      event_urls: urls,
      refreshed_at: new Date().toISOString(),
    },
    { onConflict: "cache_key" }
  );
  if (cacheError) console.error("Search cache upsert error:", cacheError.message);

  return { newEvents, dateChanges };
}

async function readCache(cacheKey, month, year) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: cacheRow, error } = await supabase
    .from("search_cache")
    .select("*")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (error || !cacheRow) return null;

  const age = Date.now() - new Date(cacheRow.refreshed_at).getTime();
  if (age > CACHE_TTL_MS) return { stale: true, cacheRow };

  const events = await loadEventsFromUrls(cacheRow.event_urls || [], month, year);
  if (!events || events.length === 0) return { stale: true, cacheRow };

  const { scheduled, unscheduled } = splitScheduled(events);
  return {
    stale: false,
    fromCache: true,
    cacheAgeMs: age,
    events: [...scheduled, ...unscheduled],
    scheduled,
    unscheduled,
    cacheRow,
  };
}

export async function getEventsWithCache(hobbies, city, month, year) {
  const cacheKey = buildCacheKey(hobbies, month, year, city);

  if (isSupabaseConfigured()) {
    const cached = await readCache(cacheKey, month, year);
    if (cached && !cached.stale) {
      return {
        events: cached.events,
        scheduled: cached.scheduled,
        unscheduled: cached.unscheduled,
        fromCache: true,
        cacheAgeMs: cached.cacheAgeMs,
        debug: null,
      };
    }
  }

  const result = await fetchRealEvents(hobbies, city, month, year);

  if (isSupabaseConfigured()) {
    await persistEventsAndCache(hobbies, city, month, year, result);
  }

  return { ...result, fromCache: false };
}

export async function refreshAllStaleCaches() {
  const supabase = getSupabase();
  if (!supabase) {
    return { refreshed: 0, newEvents: 0, dateChanges: 0, error: "Supabase not configured" };
  }

  const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
  const { data: rows, error } = await supabase
    .from("search_cache")
    .select("*")
    .lt("refreshed_at", cutoff);

  if (error) {
    return { refreshed: 0, newEvents: 0, dateChanges: 0, error: error.message };
  }

  let refreshed = 0;
  let newEvents = 0;
  let dateChanges = 0;

  for (const row of rows || []) {
    try {
      const result = await fetchRealEvents(row.hobbies, row.city, row.month, row.year);
      const stats = await persistEventsAndCache(
        row.hobbies,
        row.city,
        row.month,
        row.year,
        result
      );
      refreshed += 1;
      newEvents += stats.newEvents;
      dateChanges += stats.dateChanges;
    } catch (e) {
      console.error("Cron refresh failed for cache key", row.cache_key, e.message);
    }
  }

  return { refreshed, newEvents, dateChanges };
}

export async function refreshAllCaches() {
  const supabase = getSupabase();
  if (!supabase) {
    return { refreshed: 0, newEvents: 0, dateChanges: 0, error: "Supabase not configured" };
  }

  const { data: rows, error } = await supabase.from("search_cache").select("*");
  if (error) {
    return { refreshed: 0, newEvents: 0, dateChanges: 0, error: error.message };
  }

  let refreshed = 0;
  let newEvents = 0;
  let dateChanges = 0;

  for (const row of rows || []) {
    try {
      const result = await fetchRealEvents(row.hobbies, row.city, row.month, row.year);
      const stats = await persistEventsAndCache(
        row.hobbies,
        row.city,
        row.month,
        row.year,
        result
      );
      refreshed += 1;
      newEvents += stats.newEvents;
      dateChanges += stats.dateChanges;
    } catch (e) {
      console.error("Cron refresh failed for cache key", row.cache_key, e.message);
    }
  }

  return { refreshed, newEvents, dateChanges };
}
