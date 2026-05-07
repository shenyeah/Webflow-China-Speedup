const DEFAULT_CONFIG = {
  originHost: "webflowcn.webflow.io",
  assetProxyPrefix: "/__eo_asset_v3__",
  proxyableHosts: [
    "cdn.prod.website-files.com",
    "assets.website-files.com",
    "assets-global.website-files.com",
    "uploads-ssl.webflow.com",
    "fonts.googleapis.com",
    "fonts.gstatic.com"
  ],
  mirrorJquery: "https://lib.baomitu.com/jquery/3.5.1/jquery.min.js",
  mirrorWebfont: "https://cdn.jsdelivr.net/npm/webfontloader@1.6.26/webfontloader.js",
  mirrorJsdMirror: "https://cdn.jsdmirror.com"
};

const STRIP_PATTERNS = [
  /<a[^>]*class=["']w-webflow-badge["'][^>]*>[\s\S]*?<\/a>/gi,
  /<div[^>]*class=["']w-webflow-badge["'][^>]*>[\s\S]*?<\/div>/gi,
  /<span[^>]*class=["']w-webflow-badge["'][^>]*>[\s\S]*?<\/span>/gi,
  /<meta[^>]*name=["']generator["'][^>]*content=["']Webflow[^"']*["'][^>]*\/?>/gi
];

const HEAD_INJECT = [].join("");

const BODY_INJECT = `<script>(function(){var r=function(){document.querySelectorAll('.w-webflow-badge,[class*="webflow-badge"]').forEach(function(n){n.remove()})};r();setTimeout(r,800);setTimeout(r,2500);document.querySelectorAll('img:not([loading])').forEach(function(i){i.loading='lazy';i.decoding='async'});}());</script>`;

const STATIC_EXT_RE = /\.(?:js|mjs|css|png|jpg|jpeg|gif|webp|svg|ico|woff2|woff|ttf|map|json|xml|txt|pdf|mp4|webm|ogg|mp3)$/i;

export async function handleProxyRequest(request, env = {}) {
  const reqUrl = new URL(request.url);
  const cfg = resolveSiteConfig(env);

  if (reqUrl.pathname === "/__proxy/health") {
    return Response.json(
      {
        ok: true,
        runtime: "edgeone-pages",
        host: reqUrl.host,
        origin: cfg.originHost,
        assetProxyPrefix: cfg.assetProxyPrefix,
        geo: {
          country: request.headers.get("EO-Client-IPCountry") || request.headers.get("CloudFront-Viewer-Country") || null,
          allGeoHeaders: ["EO-Client-IPCountry", "CloudFront-Viewer-Country", "EO-Client-IPRegion", "X-EdgeOne-Client-Country"]
            .map(h => `${h}: ${request.headers.get(h) || "(none)"}`)
        }
      },
      { status: 200 }
    );
  }

  // Serve generated robots.txt and sitemap.xml since Webflow origins often lack them
  if (reqUrl.pathname === "/robots.txt") {
    const sitemapUrl = `${reqUrl.protocol}//${reqUrl.host}/sitemap.xml`;
    const body = `User-agent: *\nAllow: /\nSitemap: ${sitemapUrl}\n`;
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" }
    });
  }

  if (reqUrl.pathname === "/sitemap.xml") {
    try {
      const sitemap = await generateSitemap(cfg, reqUrl);
      return new Response(sitemap, {
        status: 200,
        headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" }
      });
    } catch (_e) {
      return new Response('<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>', {
        status: 200,
        headers: { "content-type": "application/xml; charset=utf-8" }
      });
    }
  }

  // Geo routing: redirect overseas visitors to the Webflow origin (no China CDN needed)
  if (cfg.originHost) {
    const country = (request.headers.get("EO-Client-IPCountry") || "").toUpperCase();
    if (country && country !== "CN") {
      const originUrl = `https://${cfg.originHost}${reqUrl.pathname}${reqUrl.search}`;
      return Response.redirect(originUrl, 301);
    }
  }

  if (!cfg.originHost) {
    return new Response(
      "502 PROXY_CONFIG_ERROR: 环境变量 WEBFLOW_ORIGIN_HOST 未配置。请在 EdgeOne Pages 控制台 → 设置 → 环境变量中添加，值为你的 Webflow 项目地址（如 xxx.webflow.io）。",
      { status: 502, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  const target = resolveUpstreamTarget(reqUrl, cfg);
  if (!target) {
    return new Response("400 Invalid asset proxy target", { status: 400 });
  }

  const upstreamHeaders = buildUpstreamHeaders(request, reqUrl, target.upstreamHost);

  let upstreamResp;
  try {
    upstreamResp = await fetch(target.upstreamUrl.toString(), {
      method: request.method,
      headers: upstreamHeaders,
      body: canHaveBody(request.method) ? request.body : undefined,
      redirect: "manual"
    });
  } catch (_err) {
    return new Response("502 Upstream fetch failed", { status: 502 });
  }

  return rewriteResponse(upstreamResp, reqUrl, request.method, target, cfg);
}

function resolveSiteConfig(env) {
  return {
    originHost: env.WEBFLOW_ORIGIN_HOST || DEFAULT_CONFIG.originHost,
    assetProxyPrefix: ensurePrefix(env.ASSET_PROXY_PREFIX || DEFAULT_CONFIG.assetProxyPrefix),
    proxyableHosts: DEFAULT_CONFIG.proxyableHosts,
    mirrorJquery: env.MIRROR_JQUERY || DEFAULT_CONFIG.mirrorJquery,
    mirrorWebfont: env.MIRROR_WEBFONT || DEFAULT_CONFIG.mirrorWebfont,
    mirrorJsdMirror: env.MIRROR_JSD_MIRROR || DEFAULT_CONFIG.mirrorJsdMirror
  };
}

function buildUpstreamHeaders(request, reqUrl, upstreamHost) {
  const headers = new Headers(request.headers);
  headers.set("host", upstreamHost);
  headers.set("x-forwarded-host", reqUrl.host);
  headers.set("x-forwarded-proto", reqUrl.protocol.replace(":", ""));
  headers.set("accept-encoding", "identity");
  return headers;
}

function canHaveBody(method) {
  return method !== "GET" && method !== "HEAD";
}

async function rewriteResponse(originResp, requestUrl, method, target, cfg) {
  const headers = new Headers(originResp.headers);
  const upstreamContentEncoding = originResp.headers.get("content-encoding");
  const isCompressed = upstreamContentEncoding && upstreamContentEncoding !== "identity";
  const contentType = (headers.get("content-type") || "").toLowerCase();
  const isHtml = contentType.includes("text/html") || contentType.includes("application/xhtml+xml");
  const isCss = contentType.includes("text/css");
  const isGoogleFontCss = target.upstreamHost === "fonts.googleapis.com" && isCss;
  const shouldRewriteBodyText = isHtml || isGoogleFontCss || isCss;
  const isStatic = STATIC_EXT_RE.test(target.sourcePathname);

  rewriteLocationHeader(headers, requestUrl, cfg);
  dropUnsafeUpstreamHeaders(headers);

  // MIME override: .txt files through asset proxy are often JS code
  if (target.assetProxy && target.sourcePathname.endsWith('.txt') && contentType === 'text/plain') {
    headers.set('content-type', 'text/javascript; charset=utf-8');
  }

  setCachingHeaders(headers, isStatic, target);
  setSecurityHeaders(headers);

  if (!shouldRewriteBodyText || method === "HEAD") {
    normalizeTransferHeaders(headers);
    headers.set("x-proxy-cache-policy", isStatic ? "static" : "dynamic");
    headers.set("x-proxy-upstream", target.upstreamHost);
    if (isCompressed) {
      const decompressed = await originResp.arrayBuffer();
      return new Response(decompressed, {
        status: originResp.status,
        headers
      });
    }
    return new Response(originResp.body, {
      status: originResp.status,
      headers
    });
  }

  let text = await originResp.text();
  text = rewriteDomainTokens(text, requestUrl, cfg);

  if (isHtml) {
    text = stripWebflowBranding(text);
    text = injectOptimizations(text);
    text = applyChinaSpeedRewrites(text, requestUrl, cfg);
    text = stripCssIntegrity(text);
  } else if (isCss) {
    text = rewriteCssFonts(text, requestUrl, cfg);
  }

  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("vary");
  headers.set("vary", "Accept");
  headers.set("x-proxy-cache-policy", isStatic ? "static" : "dynamic");
  headers.set("x-proxy-upstream", target.upstreamHost);

  return new Response(text, {
    status: originResp.status,
    headers
  });
}

function rewriteLocationHeader(headers, requestUrl, cfg) {
  const location = headers.get("location");
  if (!location) return;
  headers.set("location", rewriteDomainTokens(location, requestUrl, cfg));
}

function dropUnsafeUpstreamHeaders(headers) {
  [
    "x-lambda-id",
    "surrogate-key",
    "surrogate-control",
    "x-wf-region",
    "x-wf-accelerated",
    "cf-ray",
    "cf-cache-status"
  ].forEach((key) => headers.delete(key));
}

function normalizeTransferHeaders(headers) {
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.set("content-encoding", "identity");
  headers.delete("vary");
  headers.set("vary", "Accept");
}

function setCachingHeaders(headers, isStatic, target) {
  if (target.assetProxy && target.upstreamHost === "fonts.googleapis.com") {
    headers.set("cache-control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000, no-transform");
    return;
  }
  if (isStatic) {
    headers.set("cache-control", "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=2592000, no-transform");
    return;
  }
  headers.set("cache-control", "public, max-age=0, s-maxage=300, stale-while-revalidate=604800, no-transform");
}

function setSecurityHeaders(headers) {
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-dns-prefetch-control", "on");
}

function rewriteDomainTokens(input, requestUrl, cfg) {
  const reqHost = requestUrl.host;
  const reqOrigin = `${requestUrl.protocol}//${reqHost}`;
  let output = input
    .replace(new RegExp(`https://${escapeRegExp(cfg.originHost)}`, "gi"), reqOrigin)
    .replace(new RegExp(`//${escapeRegExp(cfg.originHost)}`, "gi"), `//${reqHost}`)
    .replace(new RegExp(escapeRegExp(cfg.originHost), "gi"), reqHost);

  cfg.proxyableHosts.forEach((host) => {
    const escapedHost = escapeRegExp(host);
    output = output
      .replace(new RegExp(`https://${escapedHost}`, "gi"), `${reqOrigin}${cfg.assetProxyPrefix}/${host}`)
      .replace(new RegExp(`//${escapedHost}`, "gi"), `//${reqHost}${cfg.assetProxyPrefix}/${host}`);
  });

  return output;
}

function stripWebflowBranding(input) {
  let output = input;
  STRIP_PATTERNS.forEach((re) => {
    output = output.replace(re, "");
  });
  return output;
}

function injectOptimizations(input) {
  let output = input;
  output = output.replace(/<head([^>]*)>/i, `<head$1>${HEAD_INJECT}`);
  output = output.replace(/<\/body>/i, `${BODY_INJECT}</body>`);
  output = output.replace(/<img(?![^>]*decoding)([^>]*?)>/gi, '<img decoding="async"$1>');
  return output;
}

function applyChinaSpeedRewrites(input, requestUrl, cfg) {
  let output = input;
  const reqHost = requestUrl.host;
  const reqOrigin = `${requestUrl.protocol}//${reqHost}`;

  output = output.replace(
    /<style>\s*html\.w-mod-js:not\(\.w-mod-ix3\)\s*:is\(\.post_collection-item\)\s*\{[^}]*\}\s*<\/style>/gi,
    ""
  );

  output = output.replace(
    /<link[^>]*(?:rel=["'](?:preconnect|dns-prefetch)["'][^>]*href=["'][^"']*(?:google|gstatic)[^"']*|href=["'][^"']*(?:google|gstatic)[^"']*["'][^>]*rel=["'](?:preconnect|dns-prefetch)["'])[^>]*>/gi,
    ""
  );

  output = output.replace(/<script[^>]*src=["'][^"']*(?:googletagmanager|google-analytics)\.com[^"']*["'][^>]*>\s*<\/script>/gi, "");
  output = output.replace(/<noscript>\s*<iframe[^>]*googletagmanager\.com[^>]*><\/iframe>\s*<\/noscript>/gi, "");
  output = output.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, (match) => {
    if (/(?:dataLayer|gtag\(|GoogleAnalyticsObject)/i.test(match)) return "";
    return match;
  });

  output = output.replace(
    /https?:\/\/ajax\.googleapis\.com\/ajax\/libs\/webfont\/[\d.]+\/webfont\.js/gi,
    cfg.mirrorWebfont
  );
  // Convert WebFont.load({google:{families:["..."]}}) to <link> tags via Google Fonts China mirror
  output = output.replace(
    /<script[^>]*>\s*WebFont\.load\(\s*\{[\s\S]*?google\s*:\s*\{[\s\S]*?families\s*:\s*\[([\s\S]*?)\][\s\S]*?\)\s*;?\s*<\/script>/gi,
    (_match, familiesContent) => {
      const families = [...familiesContent.matchAll(/"([^"]+)"/g)].map(m => m[1]);
      const links = families.map(f => {
        const [name, weights] = f.split(':');
        const href = weights
          ? `https://fonts.googleapis.cn/css?family=${name}:${weights}&display=swap`
          : `https://fonts.googleapis.cn/css?family=${name}&display=swap`;
        return `<link href="${href}" rel="stylesheet">`;
      });
      return links.join('\n');
    }
  );

  output = output.replace(
    /https?:\/\/d3e54v103j8qbb\.cloudfront\.net\/js\/jquery-3\.5\.1\.min\.dc5e7f18c8\.js\?site=[^"']+/gi,
    cfg.mirrorJquery
  );

  // Replace jsdelivr CDN with JSDMirror
  output = output.replace(
    /https?:\/\/cdn\.jsdelivr\.net\/(npm|gh)\//gi,
    `${cfg.mirrorJsdMirror}/$1/`
  );

  // Replace cdnjs CDN with JSDMirror (same /ajax/libs/ path, not /npm/)
  output = output.replace(
    /https?:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\//gi,
    `${cfg.mirrorJsdMirror}/ajax/libs/`
  );

  // GSAP — already proxied via rewriteDomainTokens, keep explicit patterns for version flexibility
  output = output
    .replace(
      /https?:\/\/cdn\.prod\.website-files\.com\/gsap\/([\d.]+)\/([\w.]+\.min\.js)/gi,
      `${reqOrigin}${cfg.assetProxyPrefix}/cdn.prod.website-files.com/gsap/$1/$2`
    );

  // Remove webfontloader.js script (no longer needed since WebFont.load is converted to <link>)
  output = output.replace(
    /<script[^>]*src=["'][^"']*\/webfontloader[^"']*\.js["'][^>]*>\s*<\/script>/gi,
    ""
  );

  return output;
}

function stripCssIntegrity(input) {
  // CSS files proxied through EdgeOne get their content rewritten (URL domains changed),
  // so SRI integrity hashes no longer match. Remove integrity + crossorigin from
  // <link rel="stylesheet"> tags to prevent browsers from blocking the CSS.
  return input.replace(
    /<link\b([^>]*?\brel\s*=\s*["']stylesheet["'])([^>]*)>/gi,
    (_, relAttr, rest) => {
      rest = rest.replace(/\s*integrity\s*=\s*["'][^"']*["']/gi, "");
      rest = rest.replace(/\s*crossorigin\s*=\s*["'][^"']*["']/gi, "");
      return `<link${relAttr}${rest}>`;
    }
  );
}

function resolveUpstreamTarget(reqUrl, cfg) {
  if (!cfg.originHost) return null;
  const originBase = `https://${cfg.originHost}`;
  if (!reqUrl.pathname.startsWith(`${cfg.assetProxyPrefix}/`)) {
    return {
      assetProxy: false,
      upstreamHost: cfg.originHost,
      upstreamUrl: new URL(reqUrl.pathname + reqUrl.search, originBase),
      sourcePathname: reqUrl.pathname
    };
  }

  const rest = reqUrl.pathname.slice(`${cfg.assetProxyPrefix}/`.length);
  const slashIndex = rest.indexOf("/");
  if (slashIndex <= 0) return null;

  const host = rest.slice(0, slashIndex).toLowerCase();
  if (!cfg.proxyableHosts.includes(host)) return null;

  const path = rest.slice(slashIndex);
  return {
    assetProxy: true,
    upstreamHost: host,
    upstreamUrl: new URL(`https://${host}${path}${reqUrl.search}`),
    sourcePathname: path
  };
}

function ensurePrefix(s) {
  if (!s) return DEFAULT_CONFIG.assetProxyPrefix;
  return s.startsWith("/") ? s : `/${s}`;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rewriteCssFonts(input, requestUrl, cfg) {
  const reqHost = requestUrl.host;
  const reqOrigin = `${requestUrl.protocol}//${reqHost}`;
  let output = input;
  cfg.proxyableHosts.forEach((host) => {
    const escapedHost = escapeRegExp(host);
    output = output.replace(
      new RegExp(`url\\(\\s*(["']?)https?://${escapedHost}`, "gi"),
      (_, q) => `url(${q || ""}${reqOrigin}${cfg.assetProxyPrefix}/${host}`
    );
    output = output.replace(
      new RegExp(`url\\(\\s*(["']?)//${escapedHost}`, "gi"),
      (_, q) => `url(${q || ""}//${reqHost}${cfg.assetProxyPrefix}/${host}`
    );
  });
  return output;
}

async function generateSitemap(cfg, reqUrl) {
  const reqOrigin = `${reqUrl.protocol}//${reqUrl.host}`;

  // Strategy 1: If origin already has a sitemap.xml, proxy it with domain rewriting
  try {
    const originSitemapUrl = `https://${cfg.originHost}/sitemap.xml`;
    const resp = await fetch(originSitemapUrl, { headers: { "accept-encoding": "identity" } });
    if (resp.ok) {
      const text = await resp.text();
      if (text.includes("<urlset") || text.includes("<sitemapindex")) {
        return rewriteDomainTokens(text, reqUrl, cfg);
      }
    }
  } catch (_e) { /* origin has no sitemap, continue */ }

  // Strategy 2: Scrape homepage for internal links (no auth or third-party services needed)
  try {
    const items = await scrapeHomepageLinks(cfg, reqOrigin);
    if (items.length > 0) {
      return buildSitemapXml(items);
    }
  } catch (_e) { /* scraping failed, use fallback */ }

  // Fallback: single-entry sitemap with homepage only
  return buildSitemapXml([{ loc: reqOrigin, lastmod: new Date().toISOString().slice(0, 10) }]);
}

async function scrapeHomepageLinks(cfg, reqOrigin) {
  const homepageUrl = `https://${cfg.originHost}/`;
  const resp = await fetch(homepageUrl, { headers: { "accept-encoding": "identity" } });
  if (!resp.ok) return [];

  const html = await resp.text();
  const seen = new Set();
  const items = [];

  // Extract href from <a> tags, handling various attribute orderings
  const hrefRe = /<a\b[^>]*?\bhref\s*=\s*["']([^"']*?)["'][^>]*>/gi;
  let match;
  while ((match = hrefRe.exec(html)) !== null) {
    let href = match[1];

    // Skip anchors, javascript:, mailto:, tel:
    if (/^(#|javascript:|mailto:|tel:)/i.test(href)) continue;

    // Resolve relative URLs against the origin
    let absolute;
    try {
      absolute = new URL(href, reqOrigin);
    } catch (_e) { continue; }

    // Skip external links (different host)
    if (absolute.host !== new URL(reqOrigin).host) continue;

    // Normalize: strip query, hash, trailing slash
    absolute.search = "";
    absolute.hash = "";
    let normalized = absolute.toString().replace(/\/$/, "");

    // Skip the homepage itself (it's always included)
    if (normalized === reqOrigin.replace(/\/$/, "")) continue;

    if (!seen.has(normalized)) {
      seen.add(normalized);
      items.push({ loc: normalized });
    }
  }

  return items;
}

function buildSitemapXml(items) {
  const urls = items.map(i =>
    `  <url><loc>${escapeXml(i.loc)}</loc>${i.lastmod ? `<lastmod>${i.lastmod}</lastmod>` : ""}<changefreq>weekly</changefreq><priority>0.8</priority></url>`
  ).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
