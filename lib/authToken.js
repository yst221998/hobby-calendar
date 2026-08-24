function firstHeaderValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function extractRequestToken(req) {
  const authHeader = firstHeaderValue(req?.headers?.authorization);
  if (typeof authHeader === "string") {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]?.trim()) return match[1].trim();
  }

  const fallbackHeader = firstHeaderValue(req?.headers?.["x-supabase-auth"]);
  if (typeof fallbackHeader === "string" && fallbackHeader.trim()) {
    return fallbackHeader.trim();
  }

  const bodyToken = req?.body?.accessToken;
  if (typeof bodyToken === "string" && bodyToken.trim()) {
    return bodyToken.trim();
  }

  return null;
}

module.exports = { extractRequestToken };
