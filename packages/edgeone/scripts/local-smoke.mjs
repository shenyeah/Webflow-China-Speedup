import assert from "node:assert/strict";
import { handleProxyRequest } from "../edge-functions/_shared/proxy.js";

const ORIGIN_HOST = "example.webflow.io";
const REQ_HOST = "example.com";

const sampleHtml = `<!doctype html><html><head>
<link rel="stylesheet" href="https://cdn.prod.website-files.com/site/main.css" integrity="sha384-abc" crossorigin="anonymous">
<script src="https://cdn.prod.website-files.com/site/main.js" integrity="sha384-def" crossorigin="anonymous"></script>
<script src="https://ajax.googleapis.com/ajax/libs/webfont/1.6.26/webfont.js"></script>
<script>WebFont.load({ google: { families: ["Inter:300,400,500,600,700"] }});</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('config','G-XXXX');</script>
<script src="https://cdn.prod.website-files.com/gsap/3.15.0/gsap.min.js"></script>
<script src="https://d3e54v103j8qbb.cloudfront.net/js/jquery-3.5.1.min.dc5e7f18c8.js?site=foo"></script>
</head><body>
<img src="https://cdn.prod.website-files.com/site/hero.png">
</body></html>`;

const originalFetch = globalThis.fetch;

const cssFixture = `@font-face { font-family: 'TestFont'; src: url('https://cdn.prod.website-files.com/site/test.woff2') format('woff2'); }\n.site-main { color: red; }`;
const cssRewritten = `@font-face { font-family: 'TestFont'; src: url('https://example.com/__eo_asset_v3__/cdn.prod.website-files.com/site/test.woff2') format('woff2'); }\n.site-main { color: red; }`;

globalThis.fetch = async (input) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname === ORIGIN_HOST) {
    return new Response(sampleHtml, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  }

  // Serve CSS from the Webflow CDN (plain text, not compressed in test env)
  if (url.hostname === "cdn.prod.website-files.com" && url.pathname.endsWith(".css")) {
    return new Response(cssFixture, {
      status: 200,
      headers: { "content-type": "text/css; charset=utf-8" }
    });
  }

  return new Response("ok", {
    status: 200,
    headers: { "content-type": "text/plain" }
  });
};

try {
  const env = {
    WEBFLOW_ORIGIN_HOST: ORIGIN_HOST,
    ASSET_PROXY_PREFIX: "/__eo_asset_v3__"
  };

  const resp = await handleProxyRequest(new Request(`https://${REQ_HOST}/`), env);
  const html = await resp.text();

  // Geo routing: CN requests should pass through
  assert.equal(resp.status, 200);
  // Geo routing: non-CN requests should redirect to origin
  const usReq = new Request(`https://${REQ_HOST}/`, { headers: { "EO-Client-IPCountry": "US" } });
  const usResp = await handleProxyRequest(usReq, env);
  assert.equal(usResp.status, 301);
  assert.equal(usResp.headers.get("location"), `https://${ORIGIN_HOST}/`);

  // Geo routing: CN requests should NOT redirect
  const cnReq = new Request(`https://${REQ_HOST}/about`, { headers: { "EO-Client-IPCountry": "CN" } });
  const cnResp = await handleProxyRequest(cnReq, env);
  assert.equal(cnResp.status, 200);
  assert.ok(!html.includes("webfontloader"), "webfontloader.js should be removed");
  assert.ok(html.includes('href="https://fonts.googleapis.cn/css?family=Inter:300,400,500,600,700&display=swap" rel="stylesheet"'), "Google Fonts CSS link should use China mirror");
  assert.ok(!html.includes("googletagmanager.com"));
  assert.ok(!html.includes("WebFont.load("), "WebFont.load should be removed");
  assert.ok(html.includes("https://lib.baomitu.com/jquery/3.5.1/jquery.min.js"));
  assert.ok(html.includes(`https://${REQ_HOST}/__eo_asset_v3__/cdn.prod.website-files.com/gsap/3.15.0/gsap.min.js`));
  assert.ok(html.includes(`href="https://${REQ_HOST}/__eo_asset_v3__/cdn.prod.website-files.com/site/main.css"`));
  // CSS link must NOT have integrity (SRI would break since we rewrite CSS body)
  assert.ok(!/<link[^>]*stylesheet[^>]*integrity/i.test(html), "integrity must be stripped from CSS <link>");
  assert.ok(html.includes(`src="https://${REQ_HOST}/__eo_asset_v3__/cdn.prod.website-files.com/site/main.js"`));
  assert.ok(html.includes(`https://${REQ_HOST}/__eo_asset_v3__/cdn.prod.website-files.com/site/hero.png`));

  const assetResp = await handleProxyRequest(
    new Request(`https://${REQ_HOST}/__eo_asset_v3__/cdn.prod.website-files.com/site/a.png`),
    env
  );
  assert.equal(assetResp.status, 200);
  assert.equal(assetResp.headers.get("x-proxy-upstream"), "cdn.prod.website-files.com");

  // Test CSS proxying: CSS files served through the asset proxy
  const cssResp = await handleProxyRequest(
    new Request(`https://${REQ_HOST}/__eo_asset_v3__/cdn.prod.website-files.com/site/main.css`),
    env
  );
  assert.equal(cssResp.status, 200);
  assert.equal(cssResp.headers.get("content-type"), "text/css; charset=utf-8");
  assert.equal(cssResp.headers.get("x-proxy-upstream"), "cdn.prod.website-files.com");
  const cssText = await cssResp.text();
  assert.equal(cssText, cssRewritten, "CSS @font-face url() must be rewritten");

  // Test robots.txt generation
  const robotsResp = await handleProxyRequest(new Request(`https://${REQ_HOST}/robots.txt`), env);
  assert.equal(robotsResp.status, 200);
  const robotsText = await robotsResp.text();
  assert.ok(robotsText.includes("User-agent: *"), "robots.txt should be served");
  assert.ok(robotsText.includes("sitemap.xml"), "robots.txt should reference sitemap");

  // Test sitemap.xml generation (will fall back to single-entry sitemap)
  const sitemapResp = await handleProxyRequest(new Request(`https://${REQ_HOST}/sitemap.xml`), env);
  assert.equal(sitemapResp.status, 200);
  const sitemapText = await sitemapResp.text();
  assert.ok(sitemapText.includes("<urlset"), "sitemap.xml should be valid XML");

  const health = await handleProxyRequest(new Request(`https://${REQ_HOST}/__proxy/health`), env);
  const healthJson = await health.json();
  assert.equal(healthJson.origin, ORIGIN_HOST);

  // Test that missing WEBFLOW_ORIGIN_HOST falls back to DEFAULT_CONFIG
  const fallbackResp = await handleProxyRequest(
    new Request("https://example.com/"),
    { ASSET_PROXY_PREFIX: "/__eo_asset_v3__" }
  );
  assert.equal(fallbackResp.status, 200);

  console.log("Local smoke test passed.");
} finally {
  globalThis.fetch = originalFetch;
}
