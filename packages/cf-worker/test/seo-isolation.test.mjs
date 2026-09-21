import assert from "node:assert/strict";
import { test } from "node:test";

import { applySeoIsolation } from "../worker.js";

function headerFor(hostname, configuredHosts) {
  const response = applySeoIsolation(
    new Response("ok", { headers: { "x-existing": "preserved" } }),
    hostname,
    configuredHosts
  );
  assert.equal(response.headers.get("x-existing"), "preserved");
  return response.headers.get("x-robots-tag");
}

test("matching hostname receives noindex", () => {
  assert.equal(headerFor("preview.example.com", "preview.example.com"), "noindex, nofollow");
});

test("non-matching hostname remains unchanged", () => {
  assert.equal(headerFor("www.example.com", "preview.example.com"), null);
});

test("multiple hosts are case-insensitive and whitespace-safe", () => {
  const configured = " preview.example.com , , STAGING.example.com,www.example.com ";
  for (const hostname of ["preview.example.com", "staging.example.com", "WWW.EXAMPLE.COM"]) {
    assert.equal(headerFor(hostname, configured), "noindex, nofollow");
  }
});

test("empty configuration preserves existing behavior", () => {
  assert.equal(headerFor("preview.example.com", ""), null);
  assert.equal(headerFor("preview.example.com", undefined), null);
});
