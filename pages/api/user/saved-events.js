import { getSupabase } from "../../../lib/supabase";
import { getUserFromRequest, ensureProfile } from "../../../lib/auth";
import { eventsFromDbRows } from "../../../lib/cache";

export default async function handler(req, res) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Sign in required" });
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
      return res.status(200).json({ events: [], savedUrls: [] });
    }

    const urls = [...new Set(savedRows.map((row) => row.event_url))];
    const { data: eventRows, error: eventError } = await supabase
      .from("events")
      .select("*")
      .in("url", urls);

    if (eventError) {
      return res.status(500).json({ error: eventError.message });
    }

    const events = eventsFromDbRows(eventRows || []);
    const savedUrls = savedRows.map((row) => `${row.event_url}|${row.month}|${row.year}`);

    return res.status(200).json({ events, savedUrls });
  }

  if (req.method === "POST") {
    const { eventUrl, month, year, status = "interested" } = req.body || {};

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
