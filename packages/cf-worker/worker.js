import { serveAsset } from './assets.js';
import { correctSecret, hashKey, HTML_LIMIT, mark, mayCache, positiveInt, publicHtmlUrl, readBounded } from './cache.js';
import { publicUrl, rewriteHeaders, rewriteHtml } from './html.js';
import { WEBFLOW_GOOGLE_GATEWAY_PATH_RE } from './tracking.js';

export { isAllowedAssetHost, rewriteCssAssetUrls } from './html.js';

const BUILD_VERSION = '__BUILD_COMMIT__';
const BUILD_DEPLOY_TIME = '__BUILD_DEPLOY_TIME__';
const VERSION = '1.1.0';
const HTML_REWRITE_VERSION = '2026-11-20.1';
const DEMO_ORIGIN = 'webflowcn.webflow.io';
const JQUERY_MIRROR = 'https://cdn.jsdmirror.com/npm/jquery@3.5.1/dist/jquery.min.js';

function httpsOrigin(value) {
  if (!value) return null;
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && url.pathname === '/' && !url.search && !url.hash ? url : null;
  } catch {
    return null;
  }
}

function config(env, url) {
  return {
    origin: httpsOrigin(env.ORIGIN_HOST ?? env.WEBFLOW_HOST ?? DEMO_ORIGIN),
    publicOrigin: httpsOrigin(env.PUBLIC_HOST)?.origin || url.origin,
    redirectHost: httpsOrigin(env.OVERSEAS_REDIRECT_HOST),
    directAssets: env.OVERSEAS_MODE === 'direct-assets',
    cacheVersion: /^[a-z\d._-]{1,64}$/i.test(env.CACHE_VERSION || '') ? env.CACHE_VERSION : 'v1',
    htmlTtl: positiveInt(env.CACHE_TTL, 300, 3600),
    snapshotTtl: positiveInt(env.SNAPSHOT_TTL, 900, 86400),
    staleLimit: positiveInt(env.SNAPSHOT_MAX_AGE, 3600, 86400),
    assetTtl: positiveInt(env.ASSET_R2_TTL, 86400, 2592000),
    originTimeout: positiveInt(env.ORIGIN_TIMEOUT_MS, 8000, 30000),
    jqueryMirror: JQUERY_MIRROR,
    r2PublicBase: httpsOrigin(env.R2_PUBLIC_BASE)
  };
}

function diagnostic(cfg, request) {
  return Response.json({
    ok: Boolean(cfg.origin), runtime: 'cloudflare-worker', version: VERSION,
    build: BUILD_VERSION.startsWith('__') ? 'dev' : BUILD_VERSION,
    deployTime: BUILD_DEPLOY_TIME.startsWith('__') ? null : BUILD_DEPLOY_TIME,
    host: new URL(request.url).hostname,
    originMode: cfg.origin?.hostname.endsWith('.webflow.io') ? 'webflow-staging' : 'custom-domain',
    overseasMode: cfg.directAssets ? 'direct-assets' : 'proxy'
  }, { headers: { 'cache-control': 'no-store' } });
}

async function fetchOrigin(request, url, cfg) {
  const target = new URL(cfg.origin);
  target.pathname = url.pathname;
  target.search = url.search;
  const headers = new Headers(request.headers);
  for (const name of ['host', 'x-edgeflow-site-secret', 'x-edgeflow-refresh-secret', 'cf-worker', 'x-edgeflow-hop', 'x-forwarded-host', 'forwarded']) headers.delete(name);
  headers.set('x-edgeflow-hop', '1');
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  return fetch(target, {
    method: request.method, headers, body: hasBody ? request.body : undefined,
    redirect: 'manual', signal: AbortSignal.timeout(cfg.originTimeout), ...(hasBody ? { duplex: 'half' } : {})
  });
}

async function fetchPage(request, url, cfg, country) {
  const start = Date.now();
  const upstream = await fetchOrigin(request, url, cfg);
  const foreign = country && country !== 'CN';
  const optimize = !(foreign && cfg.directAssets);
  const headerUrl = new URL(cfg.publicOrigin);
  headerUrl.pathname = url.pathname;
  headerUrl.search = url.search;
  const headers = rewriteHeaders(upstream.headers, headerUrl, cfg, optimize, foreign);
  headers.set('x-edgeflow-content-mode', optimize ? 'china-optimized' : 'overseas-direct-assets');
  headers.set('server-timing', `origin;dur=${Date.now() - start}`);
  const response = new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
  if (request.method === 'HEAD' || !headers.get('content-type')?.includes('text/html') || upstream.status >= 300) return response;
  // Public HTML is cached only by the explicit country-aware policy below.
  const rewritten = await rewriteHtml(response, headerUrl, cfg, optimize, foreign);
  return mark(rewritten, { 'cache-control': 'private, no-cache', 'x-edgeflow-cache-eligible': mayCache(upstream) ? '1' : '0' });
}

function eligible(html) {
  return html.headers.get('x-edgeflow-cache-eligible') === '1';
}

async function saveHtml(response, key, cacheRequest, cfg, bucket, cache) {
  const bytes = await readBounded(response, HTML_LIMIT);
  if (!bytes) return;
  const headers = new Headers(response.headers);
  headers.delete('set-cookie');
  headers.delete('x-edgeflow-cache-eligible');
  headers.set('cache-control', `public, max-age=${cfg.htmlTtl}`);
  await Promise.allSettled([
    cache?.put(cacheRequest, new Response(bytes, { headers })),
    bucket?.put(key, bytes, { customMetadata: { headers: JSON.stringify([...headers]) } })
  ]);
}

function fromSnapshot(snapshot, age, state) {
  const headers = new Headers(JSON.parse(snapshot.customMetadata.headers));
  headers.set('cache-control', 'private, no-cache');
  headers.set('x-edgeflow-snapshot-age', String(age));
  headers.set('x-edgeflow-cache', state);
  return new Response(snapshot.body, { headers });
}

async function htmlDelivery(request, url, cfg, country, env, ctx, force = false) {
  const normalized = publicHtmlUrl(request, country);
  if (!normalized || /\bno-store\b/i.test(request.headers.get('cache-control') || '')) {
    return mark(await guardedPage(request, url, cfg, country), { 'x-edgeflow-cache': 'BYPASS' });
  }
  const hash = await hashKey(`${HTML_REWRITE_VERSION}\n${cfg.cacheVersion}\n${country}\n${normalized.href}\n${cfg.origin.href}\n${cfg.publicOrigin}`);
  const key = `snapshots/html/${hash}`;
  const cacheRequest = new Request(`${url.origin}/__proxy/internal-cache/${hash}`);
  const cache = globalThis.caches?.default;
  const bucket = env.SNAPSHOT_R2 === 'off' ? null : env.MY_BUCKET;
  const requestNoCache = /\bno-cache\b/i.test(request.headers.get('cache-control') || '');
  let snapshot;
  let age;
  if (!force && !requestNoCache) {
    try {
      const hit = await cache?.match(cacheRequest);
      if (hit) return mark(hit, { 'cache-control': 'private, no-cache', 'x-edgeflow-cache': 'HIT' });
    } catch { /* keep serving if zone caching is unavailable */ }
    try {
      snapshot = await bucket?.get(key);
      if (snapshot?.customMetadata?.headers) {
        age = (Date.now() - snapshot.uploaded.getTime()) / 1000;
        if (age < cfg.snapshotTtl && age < cfg.staleLimit) return fromSnapshot(snapshot, Math.trunc(age), 'HIT-R2-HTML');
      }
    } catch { snapshot = undefined; }
  }
  const result = await guardedPage(request, url, cfg, country);
  if (result.status >= 500 && snapshot && age < cfg.staleLimit) {
    await result.body?.cancel();
    return fromSnapshot(snapshot, Math.trunc(age), 'STALE-R2-HTML');
  }
  if (snapshot?.body) void snapshot.body.cancel().catch(() => {});
  const output = mark(result, { 'x-edgeflow-cache': 'MISS' });
  output.headers.delete('x-edgeflow-cache-eligible');
  if (eligible(result)) {
    const save = saveHtml(output.clone(), key, cacheRequest, cfg, bucket, cache).catch(error => console.warn('HTML cache write failed', error?.name));
    if (force) await save;
    else ctx.waitUntil(save);
  }
  return output;
}

async function guardedPage(request, url, cfg, country) {
  try {
    return await fetchPage(request, url, cfg, country);
  } catch (error) {
    const status = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 504 : 502;
    return new Response('Webflow origin unavailable', { status, headers: { 'cache-control': 'no-store' } });
  }
}

async function sitemap(url, cfg) {
  try {
    const fetchSitemap = base => {
      const target = new URL(base);
      target.pathname = url.pathname;
      return fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(cfg.originTimeout) });
    };
    let response;
    if (cfg.r2PublicBase) {
      try { response = await fetchSitemap(cfg.r2PublicBase); } catch { /* use Webflow sitemap */ }
    }
    if (!response?.ok) {
      void response?.body?.cancel().catch(() => {});
      response = await fetchSitemap(cfg.origin);
    }
    if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
      return new Response(null, { status: response.status, headers: { location: publicUrl(response.headers.get('location'), cfg), 'cache-control': 'no-store' } });
    }
    if (!response.ok) return response;
    const bytes = await readBounded(response, HTML_LIMIT);
    if (!bytes) return new Response('Sitemap too large', { status: 502 });
    const xml = new TextDecoder().decode(bytes).replace(/<loc>\s*([^<]+?)\s*<\/loc>/gi, (_, value) => {
      try {
        const loc = new URL(value, cfg.origin);
        return `<loc>${cfg.publicOrigin}${loc.pathname}${loc.search}</loc>`;
      } catch { return `<loc>${value}</loc>`; }
    });
    return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  } catch {
    return new Response('Sitemap unavailable', { status: 502, headers: { 'cache-control': 'no-store' } });
  }
}

async function discoverPaths(url, cfg, maxPaths) {
  const paths = new Set();
  const seen = new Set();
  const pending = ['/sitemap.xml'];
  while (pending.length && paths.size < maxPaths && seen.size < 5) {
    const path = pending.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    const result = await sitemap(new URL(path, url.origin), cfg);
    const xml = await result.text();
    for (const [, loc] of xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)) {
      let link;
      try { link = new URL(loc); } catch { continue; }
      if (link.origin !== cfg.publicOrigin) continue;
      if (/\/sitemap[^/]*\.xml$/i.test(link.pathname)) pending.push(link.pathname);
      else if (!link.search) paths.add(link.pathname);
      if (paths.size === maxPaths) break;
    }
  }
  return [...paths];
}

async function refresh(request, url, cfg, env, ctx) {
  const headers = { 'cache-control': 'no-store' };
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...headers, allow: 'POST' } });
  const bearer = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!await correctSecret(bearer, env.SNAPSHOT_REFRESH_SECRET)) return new Response(null, { status: 401, headers });
  const raw = await readBounded(request, 8192);
  if (raw === null) return new Response('Request too large', { status: 413, headers });
  let payload;
  try { payload = raw.length ? JSON.parse(new TextDecoder().decode(raw)) : {}; } catch {
    return new Response('Invalid JSON', { status: 400, headers });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return new Response('Invalid JSON', { status: 400, headers });
  const limit = positiveInt(payload.limit, 20, 20);
  const offset = Math.min(180, Math.max(0, Number.parseInt(payload.offset, 10) || 0));
  const manual = Array.isArray(payload.paths);
  const discovered = manual ? payload.paths : await discoverPaths(url, cfg, offset + limit + 1);
  const fallback = (env.SNAPSHOT_PATHS || '/').split(',');
  const paths = (discovered.length || manual ? discovered : fallback).slice(manual ? 0 : offset, (manual ? 0 : offset) + limit);
  if (paths.some(path => typeof path !== 'string' || !/^\/(?!\/)[a-z\d\/_%.-]*$/i.test(path))) return new Response('Invalid paths', { status: 400, headers });
  const results = [];
  for (const path of new Set(paths)) {
    const target = new URL(path, url.origin);
    const refreshRequest = new Request(target);
    if (!publicHtmlUrl(refreshRequest, 'CN')) {
      results.push({ path, status: 400 });
      continue;
    }
    const response = await htmlDelivery(refreshRequest, target, cfg, 'CN', env, ctx, true);
    results.push({ path, status: response.status });
    await response.body?.cancel();
  }
  const ok = results.every(result => result.status === 200);
  return Response.json({ ok, offset, limit, hasMore: !manual && discovered.length > offset + limit, results }, { status: ok ? 200 : 502, headers });
}

export async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const value = String(request.cf?.country || '').toUpperCase();
  const country = value === 'XX' || value === 'T1' ? '' : value;
  const cfg = config(env, url);
  const front = httpsOrigin(env.SITE_ACCELERATION_PUBLIC_HOST);
  if (front && await correctSecret(request.headers.get('x-edgeflow-site-secret'), env.SITE_ACCELERATION_SECRET)) {
    cfg.publicOrigin = front.origin;
  }
  if (url.protocol === 'http:') {
    url.protocol = 'https:';
    return Response.redirect(url, 301);
  }
  if (url.pathname === '/_debug' || url.pathname === '/__proxy/health') return diagnostic(cfg, request);
  if (!cfg.origin || cfg.origin.origin === url.origin || cfg.origin.origin === cfg.publicOrigin) return new Response('Invalid proxy origin', { status: 502 });
  if (url.pathname.startsWith('/__proxy/internal-cache/')) return new Response('Not found', { status: 404 });
  if (country === 'CN' && WEBFLOW_GOOGLE_GATEWAY_PATH_RE.test(url.pathname)) {
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store', 'x-edgeflow-google-tracking': 'disabled-cn' } });
  }
  if (url.pathname.startsWith('/_cdn/')) return serveAsset(request, url, cfg, env, ctx);
  if (url.pathname === '/__proxy/refresh') return refresh(request, url, cfg, env, ctx);
  if (/\/(?:sitemap[^/]*\.xml)$/i.test(url.pathname) && ['GET', 'HEAD'].includes(request.method)) {
    const response = await sitemap(url, cfg);
    return request.method === 'HEAD' ? new Response(null, response) : response;
  }
  if (url.pathname === '/robots.txt') {
    const body = `User-agent: *\nAllow: /\nSitemap: ${cfg.publicOrigin}/sitemap.xml\n`;
    return new Response(request.method === 'HEAD' ? null : body, { headers: { 'content-type': 'text/plain', 'cache-control': 'public, max-age=300' } });
  }
  if (country && country !== 'CN' && cfg.redirectHost && cfg.redirectHost.origin !== url.origin && ['GET', 'HEAD'].includes(request.method)) {
    return new Response(null, { status: 302, headers: { location: `${cfg.redirectHost.origin}${url.pathname}${url.search}`, 'cache-control': 'no-store' } });
  }
  return htmlDelivery(request, url, cfg, country, env, ctx);
}

export default {
  async fetch(request, env, ctx) {
    const response = await handleRequest(request, env, ctx);
    const tagged = mark(response, { 'x-proxy-version': `webflow-china-speedup-cf/${VERSION}` });
    tagged.headers.delete('x-edgeflow-cache-eligible');
    return env.NOINDEX_ALL === '1' ? mark(tagged, { 'x-robots-tag': 'noindex, nofollow' })
      : applySeoIsolation(tagged, new URL(request.url).hostname, env.NOINDEX_HOSTS);
  }
};
export function applySeoIsolation(response, requestHostname, configuredHosts) {
  const noindexHosts = parseNoindexHosts(configuredHosts);
  const hostname = normalizeSeoHostname(requestHostname);
  if (!hostname || !noindexHosts.has(hostname)) return response;

  const headers = new Headers(response.headers);
  headers.set("x-robots-tag", "noindex, nofollow");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function parseNoindexHosts(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map(normalizeSeoHostname)
      .filter(Boolean)
  );
}

function normalizeSeoHostname(value) {
  const input = String(value || "").trim();
  if (!input) return "";
  try {
    const parsed = new URL(input.includes("://") ? input : `https://${input}`);
    return parsed.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}
