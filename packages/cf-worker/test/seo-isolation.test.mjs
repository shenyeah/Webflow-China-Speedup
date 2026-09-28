import assert from "node:assert/strict";
import { test } from "node:test";

import { applySeoIsolation, isAllowedAssetHost, rewriteCssAssetUrls } from "../worker.js";

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

test("asset host allowlist requires an exact host or dot boundary", () => {
  assert.equal(isAllowedAssetHost("cdn.prod.website-files.com"), true);
  assert.equal(isAllowedAssetHost("uploads-ssl.webflow.com"), true);
  assert.equal(isAllowedAssetHost("evilwebsite-files.com"), false);
  assert.equal(isAllowedAssetHost("website-files.com.evil.example"), false);
});

test("CSS rewriting proxies allowed Webflow assets without touching lookalike hosts", () => {
  const rewritten = rewriteCssAssetUrls(
    ".a{background:url(https://cdn.prod.website-files.com/a.png)}" +
      ".b{background:url(https://evilwebsite-files.com/b.png)}"
  );
  assert.match(rewritten, /\/_cdn\/cdn\.prod\.website-files\.com\/a\.png/);
  assert.match(rewritten, /https:\/\/evilwebsite-files\.com\/b\.png/);
});
