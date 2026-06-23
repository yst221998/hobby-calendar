export async function userApiFetch(path, accessToken, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

export function getEventUrl(event) {
  if (!event?.bookingLinks) return "";
  return Object.values(event.bookingLinks)[0] || "";
}
