const test = require("node:test");
const assert = require("node:assert/strict");

const { withAuthTransport } = require("../lib/authRequest");

test("sends the token in both supported authentication headers", () => {
  const result = withAuthTransport("token-value", { method: "GET" });

  assert.equal(result.headers.Authorization, "Bearer token-value");
  assert.equal(result.headers["x-supabase-auth"], "token-value");
  assert.equal(result.body, undefined);
});

test("adds the token to a mutating JSON request body", () => {
  const result = withAuthTransport("token-value", {
    method: "POST",
    body: JSON.stringify({ eventUrl: "https://example.com/event" }),
  });

  assert.deepEqual(JSON.parse(result.body), {
    eventUrl: "https://example.com/event",
    accessToken: "token-value",
  });
});

test("preserves caller headers while adding authentication", () => {
  const result = withAuthTransport("token-value", {
    method: "DELETE",
    headers: { "X-Request-ID": "request-1" },
    body: JSON.stringify({ eventUrl: "https://example.com/event" }),
  });

  assert.equal(result.headers["X-Request-ID"], "request-1");
  assert.equal(result.headers.Authorization, "Bearer token-value");
});
