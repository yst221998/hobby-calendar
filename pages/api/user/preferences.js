import { getSupabase } from "../../../lib/supabase";
import {
  getUserFromRequestDetailed,
  ensureProfile,
  authErrorResponse,
} from "../../../lib/auth";

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
    const { data, error } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      hobbies: data?.hobbies || [],
      city: data?.city || "Mumbai",
      defaultMonth: data?.default_month ?? null,
      defaultYear: data?.default_year ?? null,
    });
  }

  if (req.method === "POST") {
    const { hobbies, city = "Mumbai", month, year } = req.body || {};

    if (!Array.isArray(hobbies)) {
      return res.status(400).json({ error: "hobbies must be an array" });
    }

    if (hobbies.length === 0) {
      return res.status(400).json({ error: "Cannot save empty hobbies" });
    }

    await ensureProfile(supabase, user);

    const row = {
      user_id: user.id,
      hobbies,
      city: city || "Mumbai",
      default_month: typeof month === "number" ? month : null,
      default_year: typeof year === "number" ? year : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("user_preferences").upsert(row, {
      onConflict: "user_id",
    });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ ok: true, hobbies, city: row.city });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
