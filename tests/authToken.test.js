const test = require("node:test");
const assert = require("node:assert/strict");

const { extractRequestToken } = require("../lib/authToken");

test("prefers a bearer token over fallback token sources", () => {
  const req = {
    headers: {
      authorization: "Bearer bearer-token",
      "x-supabase-auth": "header-token",
    },
    body: { accessToken: "body-token" },
  };

  assert.equal(extractRequestToken(req), "bearer-token");
});

test("uses x-supabase-auth when authorization is unavailable", () => {
  const req = {
    headers: { "x-supabase-auth": "header-token" },
    body: { accessToken: "body-token" },
  };

  assert.equal(extractRequestToken(req), "header-token");
});

test("uses the JSON body token as the final fallback", () => {
  const req = {
    headers: {},
    body: { accessToken: "body-token" },
  };

  assert.equal(extractRequestToken(req), "body-token");
});

test("returns null when no usable token exists", () => {
  assert.equal(extractRequestToken({ headers: {}, body: {} }), null);
  assert.equal(
    extractRequestToken({ headers: { authorization: "Basic value" } }),
    null
  );
});
