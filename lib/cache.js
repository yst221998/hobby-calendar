import { getSupabase, isSupabaseConfigured } from "./supabase";
import {
  fetchRealEvents,
  groupEventsByUrl,
  expandGroupedEvents,
  dedupeEvents,
  splitScheduled,
  primaryBookingLink,
} from "./events";
import {
  EVENT_POOL_CITIES,
  buildCacheKey as buildVersionedCacheKey,
  groupedToRow,
  rowToGrouped,
  selectPersistableGrouped,
} from "./eventCacheCity";
import { filterCitySafeEvents } from "./eventPipelineCity";
import { isAllowedNormalizedCity } from "./eventCity";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_EVENTS_PER_SEARCH = 6;

export function buildCacheKey(hobbies, month, year, preferredArea) {
  return buildVersionedCacheKey(hobbies, month, year, preferredArea || "");
}

function daysEqual(a, b) {
  const sa = [...(a || [])].sort((x, y) => x - y).join(",");
  const sb = [...(b || [])].sort((x, y) => x - y).join(",");
  return sa === sb;
}

export function eventsFromDbRows(rows) {
  if (!rows || rows.length === 0) return [];
  const grouped = (rows || [])
    .map(rowToGrouped)
    .filter((g) => isAllowedNormalizedCity(g.normalizedCity));
  return filterCitySafeEvents(dedupeEvents(expandGroupedEvents(grouped)));
}

async function loadEventsFromPool(hobbies, month, year) {
  const supabase = getSupabase();
  if (!supabase || hobbies.length === 0) return [];

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("month", month)
    .eq("year", year)
    .in("hobby", hobbies)
    .in("normalized_city", EVENT_POOL_CITIES);

  if (error) {
    console.error("Event pool load error:", error.message);
    return [];
  }
  if (!data || data.length === 0) return [];

  return filterCitySafeEvents(eventsFromDbRows(data).filter((event) => (
    event.day != null
  )));
}

function assessCoverage(events, hobbies) {
  const hobbiesCovered = hobbies.filter((hobby) => events.some((e) => e.hobby === hobby));
  const minHobbiesWithResults = Math.min(2, hobbies.length);
  const enough =
    events.length >= MIN_EVENTS_PER_SEARCH && hobbiesCovered.length >= minHobbiesWithResults;
  const hobbiesNeedingSearch = hobbies.filter((hobby) => !hobbiesCovered.includes(hobby));

  return {
    enough,
    hobbiesCovered,
    hobbiesNeedingSearch,
    totalEvents: events.length,
  };
}

function buildResultFromEvents(events, debug = null) {
  const { scheduled, unscheduled } = splitScheduled(events);
  return {
    events: [...scheduled, ...unscheduled],
    scheduled,
    unscheduled,
    debug,
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

  const grouped = data
    .map(rowToGrouped)
    .filter((g) => Array.isArray(g.days) && g.days.length > 0 && isAllowedNormalizedCity(g.normalizedCity));
  if (grouped.length === 0) return null;
  const expanded = expandGroupedEvents(grouped);
  return filterCitySafeEvents(dedupeEvents(expanded));
}

export async function persistEventsAndCache(hobbies, preferredArea, month, year, fetchResult) {
  const supabase = getSupabase();
  if (!supabase) return { newEvents: 0, dateChanges: 0, skippedUnclassifiedCity: 0 };

  if (!fetchResult.events || fetchResult.events.length === 0) {
    return { newEvents: 0, dateChanges: 0, skippedEmpty: true, skippedUnclassifiedCity: 0 };
  }

  const cacheKey = buildCacheKey(hobbies, month, year, preferredArea);
  const grouped = groupEventsByUrl(fetchResult.events);
  const { persistable, skippedUnclassifiedCity } = selectPersistableGrouped(grouped);
  let newEvents = 0;
  let dateChanges = 0;
  const urls = [];

  for (const g of persistable) {
    const url = primaryBookingLink(g);
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
      city: preferredArea || "",
      month,
      year,
      event_urls: urls,
      refreshed_at: new Date().toISOString(),
    },
    { onConflict: "cache_key" }
  );
  if (cacheError) console.error("Search cache upsert error:", cacheError.message);

  return { newEvents, dateChanges, skippedUnclassifiedCity };
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

  const events = filterCitySafeEvents(await loadEventsFromUrls(cacheRow.event_urls || [], month, year) || []);
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

export async function getEventsWithCache(hobbies, preferredArea, month, year) {
  const cacheKey = buildCacheKey(hobbies, month, year, preferredArea);

  if (isSupabaseConfigured()) {
    const cached = await readCache(cacheKey, month, year);
    if (cached && !cached.stale) {
      const events = filterCitySafeEvents(cached.events);
      const { scheduled, unscheduled } = splitScheduled(events);
      return {
        events: [...scheduled, ...unscheduled],
        scheduled,
        unscheduled,
        fromCache: true,
        cacheAgeMs: cached.cacheAgeMs,
        debug: null,
      };
    }

    const poolEvents = filterCitySafeEvents(await loadEventsFromPool(hobbies, month, year));
    const coverage = assessCoverage(poolEvents, hobbies);

    if (coverage.enough) {
      const result = buildResultFromEvents(poolEvents, {
        selectedHobbies: hobbies,
        cachedPoolEvents: poolEvents.length,
        hobbiesCoveredByCache: coverage.hobbiesCovered,
        hobbiesSearchedLive: [],
        serpApiSkippedBecauseCacheEnough: true,
      });

      await persistEventsAndCache(hobbies, preferredArea, month, year, result);
      return { ...result, fromCache: true, cacheAgeMs: 0 };
    }

    const hobbiesToSearch =
      coverage.hobbiesNeedingSearch.length > 0 ? coverage.hobbiesNeedingSearch : hobbies;

    const liveResult = await fetchRealEvents(hobbies, preferredArea, month, year, {
      hobbiesToSearchLive: hobbiesToSearch,
      preferredArea,
    });

    const mergedEvents = filterCitySafeEvents(dedupeEvents([...poolEvents, ...liveResult.events]));
    const merged = buildResultFromEvents(mergedEvents, {
      ...liveResult.debug,
      cachedPoolEvents: poolEvents.length,
      hobbiesCoveredByCache: coverage.hobbiesCovered,
      hobbiesSearchedLive: hobbiesToSearch,
      serpApiSkippedBecauseCacheEnough: false,
    });

    await persistEventsAndCache(hobbies, preferredArea, month, year, merged);
    return { ...merged, fromCache: poolEvents.length > 0 };
  }

  return { ...(await fetchRealEvents(hobbies, preferredArea, month, year, { preferredArea })), fromCache: false };
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
      const preferredArea = row.city && row.city !== "Mumbai" ? row.city : "";
      const result = await fetchRealEvents(row.hobbies, preferredArea, row.month, row.year, {
        preferredArea,
      });
      const stats = await persistEventsAndCache(
        row.hobbies,
        preferredArea,
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
      const preferredArea = row.city && row.city !== "Mumbai" ? row.city : "";
      const result = await fetchRealEvents(row.hobbies, preferredArea, row.month, row.year, {
        preferredArea,
      });
      const stats = await persistEventsAndCache(
        row.hobbies,
        preferredArea,
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
