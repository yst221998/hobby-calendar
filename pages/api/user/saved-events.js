import { getSupabase } from "../../../lib/supabase";
import {
  getUserFromRequestDetailed,
  ensureProfile,
  authErrorResponse,
} from "../../../lib/auth";
import { eventsFromDbRows } from "../../../lib/cache";
import {
  stubFromSavedRow,
  mergeSavedWithDetails,
  validateSavedEventWrite,
} from "../../../lib/savedEventCity";

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
      normalizedCity = null,
      venue = null,
    } = req.body || {};

    const validation = validateSavedEventWrite({ eventUrl, month, year, normalizedCity });
    if (!validation.ok) {
      return res.status(validation.status).json({ error: validation.error });
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
        venue,
        normalized_city: normalizedCity,
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
