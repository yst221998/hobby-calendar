import { createClient } from "@supabase/supabase-js";

const { extractRequestToken } = require("./authToken");

function getAuthSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}

/**
 * Validates the bearer token from the request.
 * Returns { user } on success, or { user: null, reason } on failure.
 */
export async function getUserFromRequestDetailed(req) {
  const token = extractRequestToken(req);
  if (!token) {
    return { user: null, reason: "missing_token" };
  }

  const url = getAuthSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || (!serviceKey && !anonKey)) {
    return { user: null, reason: "server_misconfigured" };
  }

  const verificationKeys = [serviceKey, anonKey].filter(
    (key, index, keys) => key && keys.indexOf(key) === index
  );
  for (const key of verificationKeys) {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data?.user) {
      return { user: data.user, reason: null };
    }
  }

  return { user: null, reason: "invalid_token" };
}

export async function getUserFromRequest(req) {
  const { user } = await getUserFromRequestDetailed(req);
  return user;
}

export function authErrorResponse(reason) {
  if (reason === "missing_token") {
    return {
      status: 401,
      error: "Authentication token missing. Try signing in again.",
    };
  }
  if (reason === "invalid_token") {
    return {
      status: 401,
      error: "Authentication token invalid or expired. Try signing in again.",
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
    error: "Authentication failed. Try signing in again.",
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
