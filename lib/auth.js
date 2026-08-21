import { createClient } from "@supabase/supabase-js";

function getAuthSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}

/**
 * Validates the bearer token from the request.
 * Returns { user } on success, or { user: null, reason } on failure.
 */
export async function getUserFromRequestDetailed(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { user: null, reason: "missing_token" };
  }

  const url = getAuthSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return { user: null, reason: "server_misconfigured" };
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { user: null, reason: "invalid_token" };
  }

  return { user: data.user, reason: null };
}

export async function getUserFromRequest(req) {
  const { user } = await getUserFromRequestDetailed(req);
  return user;
}

export function authErrorResponse(reason) {
  if (reason === "missing_token") {
    return {
      status: 401,
      error: "Sign in required. Could not save — try signing in again.",
    };
  }
  if (reason === "invalid_token") {
    return {
      status: 401,
      error: "Session expired or invalid. Could not save — try signing in again.",
    };
  }
  if (reason === "server_misconfigured") {
    return {
      status: 500,
      error: "Server auth is not configured (missing Supabase URL or service role key).",
    };
  }
  return {
    status: 401,
    error: "Sign in required",
  };
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
