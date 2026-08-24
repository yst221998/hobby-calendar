const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function withAuthTransport(accessToken, options = {}) {
  const next = {
    ...options,
    headers: { ...(options.headers || {}) },
  };

  if (!accessToken) return next;

  next.headers.Authorization = `Bearer ${accessToken}`;
  next.headers["x-supabase-auth"] = accessToken;

  const method = String(options.method || "GET").toUpperCase();
  if (!MUTATING_METHODS.has(method)) return next;

  let payload = {};
  if (typeof options.body === "string" && options.body) {
    try {
      payload = JSON.parse(options.body);
    } catch {
      return next;
    }
  } else if (options.body && typeof options.body === "object") {
    payload = options.body;
  }

  if (payload && !Array.isArray(payload) && typeof payload === "object") {
    next.body = JSON.stringify({ ...payload, accessToken });
  }

  return next;
}

module.exports = { withAuthTransport };
