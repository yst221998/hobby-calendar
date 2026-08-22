const { withAuthTransport } = require("./authRequest");

export async function userApiFetch(path, accessToken, options = {}) {
  const authOptions = withAuthTransport(accessToken, options);
  const headers = {
    "Content-Type": "application/json",
    ...(authOptions.headers || {}),
  };

  const res = await fetch(path, {
    ...authOptions,
    headers,
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    const err = new Error(data.error || "Request failed");
    err.status = res.status;
    throw err;
  }
  return data;
}

export function getEventUrl(event) {
  if (!event?.bookingLinks) return "";
  return Object.values(event.bookingLinks)[0] || "";
}
