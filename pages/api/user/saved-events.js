import { getSupabase } from "../../../lib/supabase";
import {
  getUserFromRequestDetailed,
  ensureProfile,
  authErrorResponse,
} from "../../../lib/auth";
import { eventsFromDbRows } from "../../../lib/cache";
import { primaryBookingLink } from "../../../lib/events";

function stubFromSavedRow(row) {
  const platform = row.platform || "BookMyShow";
  const icon = platform === "District" ? "🏙️" : "🎟️";
  return {
    name: row.event_name || "Saved event",
    venue: "Mumbai",
    time: "Check listing",
    price: "See listing",
    platforms: [platform],
    platformIcon: icon,
    bookingLinks: { [platform]: row.event_url },
    source: "real",
    hobby: null,
    day: null,
    enrichTier: "saved",
  };
}

function mergeSavedWithDetails(savedRows, detailEvents) {
  const byUrl = new Map();
  for (const ev of detailEvents || []) {
    const url = primaryBookingLink(ev);
    if (!url) continue;
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(ev);
  }

  const events = [];
  const savedUrls = [];

  for (const row of savedRows) {
    const key = `${row.event_url}|${row.month}|${row.year}`;
    savedUrls.push(key);

    const matches = byUrl.get(row.event_url);
    if (matches && matches.length > 0) {
      events.push(...matches);
    } else {
      events.push(stubFromSavedRow(row));
    }
  }

  return { events, savedUrls };
}

export default async function handler(req, res) {
  const { user, reason } = await getUserFromRequestDetailed(req);
  if (!user) {
    const { status, error } = authErrorResponse(reason);
    return res.status(status).json({ error });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: "Supabase is not configured" });
  }

  if (req.method === "GET") {
    const { data: savedRows, error } = await supabase
      .from("saved_events")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!savedRows || savedRows.length === 0) {
      return res.status(200).json({ events: [], savedUrls: [], count: 0 });
    }

    const urls = [...new Set(savedRows.map((row) => row.event_url))];
    const { data: eventRows, error: eventError } = await supabase
      .from("events")
      .select("*")
      .in("url", urls);

    if (eventError) {
      return res.status(500).json({ error: eventError.message });
    }

    const detailEvents = eventsFromDbRows(eventRows || []);
    const { events, savedUrls } = mergeSavedWithDetails(savedRows, detailEvents);

    return res.status(200).json({ events, savedUrls, count: savedRows.length });
  }

  if (req.method === "POST") {
    const {
      eventUrl,
      month,
      year,
      status = "interested",
      eventName = null,
      platform = null,
    } = req.body || {};

    if (!eventUrl || typeof month !== "number" || typeof year !== "number") {
      return res.status(400).json({ error: "eventUrl, month, and year are required" });
    }

    await ensureProfile(supabase, user);

    const { error } = await supabase.from("saved_events").upsert(
      {
        user_id: user.id,
        event_url: eventUrl,
        month,
        year,
        status,
        event_name: eventName,
        platform,
      },
      { onConflict: "user_id,event_url,month,year" }
    );

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ ok: true, eventUrl, month, year });
  }

  if (req.method === "DELETE") {
    const { eventUrl, month, year } = req.body || {};

    if (!eventUrl || typeof month !== "number" || typeof year !== "number") {
      return res.status(400).json({ error: "eventUrl, month, and year are required" });
    }

    const { error } = await supabase
      .from("saved_events")
      .delete()
      .eq("user_id", user.id)
      .eq("event_url", eventUrl)
      .eq("month", month)
      .eq("year", year);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
