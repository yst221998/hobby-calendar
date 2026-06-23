import { createClient } from "@supabase/supabase-js";

export async function getUserFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export async function ensureProfile(supabase, user) {
  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      email: user.email || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) console.error("Profile upsert error:", error.message);
}
