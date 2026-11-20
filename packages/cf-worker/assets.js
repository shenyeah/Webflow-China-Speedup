import { ASSET_LIMIT, hashKey, mark, readBounded } from './cache.js';
import { isAllowedAssetHost, rewriteCssAssetUrls } from './html.js';

const IMMUTABLE = /[a-f\d]{8,}\.(?:min\.)?(?:js|css)$|\/[a-f\d]{24}[_-]/i;
const CSS_REVISION = 'css-rewrite-2';

function rangeFor(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  const start = match[1] ? Number(match[1]) : Math.max(size - Number(match[2]), 0);
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return null;
  return { offset: start, length: end - start + 1 };
}

async function serveExisting(bucket, key, request, cacheControl, ttl) {
  const requestedRange = request.headers.get('range');
  const needMetadata = requestedRange || request.method === 'HEAD' || request.headers.has('if-none-match');
  const metadata = await (needMetadata ? bucket.head(key) : bucket.get(key));
  if (!metadata || (ttl && Date.now() - metadata.uploaded.getTime() >= ttl * 1000)) {
    if (metadata?.body) void metadata.body.cancel().catch(() => {});
    return null;
  }
  const headers = new Headers({ 'cache-control': cacheControl, 'accept-ranges': 'bytes', etag: metadata.httpEtag });
  metadata.writeHttpMetadata(headers);
  headers.set('cache-control', cacheControl);
  const ifRange = request.headers.get('if-range');
  const range = requestedRange && (!ifRange || ifRange === metadata.httpEtag)
    ? rangeFor(requestedRange, metadata.size) : undefined;
  if (range === null) {
    headers.set('content-range', `bytes */${metadata.size}`);
    return new Response(null, { status: 416, headers });
  }
  if (!range && request.headers.get('if-none-match')?.split(/\s*,\s*/).some(tag => tag === '*' || tag.replace(/^W\//, '') === metadata.httpEtag)) {
    return new Response(null, { status: 304, headers });
  }
  headers.set('content-length', String(range?.length ?? metadata.size));
  if (range) headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${metadata.size}`);
  headers.set('x-cache', range ? 'HIT-R2-RANGE' : 'HIT-R2');
  if (request.method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers });
  const object = needMetadata
    ? await bucket.get(key, { ...(range ? { range } : {}), onlyIf: { etagMatches: metadata.etag } })
    : metadata;
  if (!object?.body) return null;
  return new Response(object.body, { status: range ? 206 : 200, headers });
}

async function persistAsset(response, bucket, key, contentType, cacheControl) {
  const httpMetadata = { contentType, cacheControl };
  const length = Number(response.headers.get('content-length'));
  const identity = !response.headers.has('content-encoding') || response.headers.get('content-encoding') === 'identity';
  if (identity && Number.isSafeInteger(length) && length > ASSET_LIMIT && typeof FixedLengthStream !== 'undefined') {
    const { readable, writable } = new FixedLengthStream(length);
    await Promise.all([response.body.pipeTo(writable), bucket.put(key, readable, { httpMetadata })]);
    return;
  }
  const bytes = await readBounded(response, ASSET_LIMIT);
  if (bytes) await bucket.put(key, bytes, { httpMetadata });
}

export async function serveAsset(request, url, cfg, env, ctx) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  const match = /^\/_cdn\/([\w.-]+)(\/.*)$/.exec(url.pathname);
  if (!match || !isAllowedAssetHost(match[1])) return new Response('Invalid CDN path', { status: 400 });
  const [, host, path] = match;
  const upstreamUrl = new URL(`https://${host}${path}${url.search}`);
  const immutable = IMMUTABLE.test(path);
  const css = /\.css$/i.test(path) || host === 'fonts.googleapis.com';
  const cacheControl = immutable ? 'public, max-age=31536000, immutable' : `public, max-age=${cfg.assetTtl}`;
  const legacySuffix = !url.search ? '' : `_${btoa(url.search).replace(/[^a-z0-9]/gi, '')}`;
  const legacyKey = `assets/${host}${path}${legacySuffix}`;
  const variant = host === 'fonts.googleapis.com' ? `${CSS_REVISION}:${request.headers.get('user-agent') || ''}` : css ? CSS_REVISION : 'asset';
  const key = !css && !url.search && cfg.cacheVersion === 'v1' ? legacyKey
    : `assets/${cfg.cacheVersion}/${await hashKey(`${variant}\n${upstreamUrl.href}`)}`;
  const bucket = env.MY_BUCKET;
  const cache = globalThis.caches?.default;
  const safeToCache = request.method === 'GET' && !['range', 'if-range', 'if-none-match', 'if-modified-since'].some(name => request.headers.has(name)) && !/\.(?:mp4|webm|mov|mp3|m4a|wav|pdf)$/i.test(path);
  const cacheUrl = safeToCache && cache ? new Request(`${url.origin}/__proxy/internal-cache/asset/${await hashKey(key)}`) : null;
  const putEdge = response => {
    if (!cacheUrl || response.status !== 200) return;
    const store = cache.put(cacheUrl, response.clone()).catch(error => console.warn('Edge asset cache write failed', error?.name));
    ctx.waitUntil(store);
  };
  if (cacheUrl) {
    try {
      const hit = await cache.match(cacheUrl);
      if (hit) return mark(hit, { 'x-cache': 'HIT-EDGE-ASSET' });
    } catch { /* R2 remains available */ }
  }
  if (bucket) {
    try {
      const cached = await serveExisting(bucket, key, request, cacheControl, immutable ? 0 : cfg.assetTtl);
      if (cached) {
        putEdge(cached);
        return cached;
      }
    } catch (error) {
      console.warn('R2 asset read failed', error?.name);
    }
  }
  const headers = new Headers({ 'accept-encoding': 'identity' });
  const range = request.headers.get('range');
  // CSS ranges are representation-dependent after rewriting. Return the whole CSS.
  if (range && !css) headers.set('range', range);
  if (range && !css && request.headers.has('if-range')) headers.set('if-range', request.headers.get('if-range'));
  if (host === 'fonts.googleapis.com' && request.headers.has('user-agent')) headers.set('user-agent', request.headers.get('user-agent'));
  let upstream;
  try {
    upstream = await fetch(upstreamUrl, { method: request.method, headers, redirect: 'manual', signal: AbortSignal.timeout(cfg.originTimeout) });
  } catch {
    return new Response('Asset source unavailable', { status: 502, headers: { 'cache-control': 'no-store' } });
  }
  if (upstream.status >= 300 && upstream.status < 400) {
    const target = upstream.headers.get('location');
    if (!target) return upstream;
    const location = new URL(target, upstreamUrl);
    if (location.protocol !== 'https:' || location.port || location.username || location.password || !isAllowedAssetHost(location.hostname)) {
      return new Response('Asset redirect unavailable', { status: 502, headers: { 'cache-control': 'no-store' } });
    }
    return mark(upstream, { location: `/_cdn/${location.host}${location.pathname}${location.search}` });
  }
  const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
  if (upstream.status !== 200 || request.method === 'HEAD' || (range && !css)) {
    return mark(upstream, { 'x-cache': range ? 'MISS-R2-RANGE-PASS' : 'MISS-R2', ...(upstream.ok ? {} : { 'cache-control': 'no-store' }) });
  }
  const upstreamCacheControl = upstream.headers.get('cache-control') || '';
  const cacheable = !upstream.headers.has('set-cookie') && !/\b(?:private|no-store|no-cache)\b/i.test(upstreamCacheControl);
  if (css || contentType.includes('text/css')) {
    const bytes = await readBounded(upstream.clone(), ASSET_LIMIT);
    if (bytes) {
      void upstream.body?.cancel().catch(() => {});
      const body = rewriteCssAssetUrls(new TextDecoder().decode(bytes));
      const result = new Headers(upstream.headers);
      for (const name of ['content-length', 'content-encoding', 'etag', 'content-md5']) result.delete(name);
      if (cacheable) result.set('cache-control', cacheControl);
      result.set('x-cache', 'MISS-R2-FETCHED-CSS-REWRITTEN');
      if (bucket && cacheable) ctx.waitUntil(bucket.put(key, body, { httpMetadata: { contentType, cacheControl } }).catch(error => console.warn('R2 CSS write failed', error?.name)));
      const rewritten = new Response(body, { headers: result });
      if (cacheable) putEdge(rewritten);
      return rewritten;
    }
    return mark(upstream, { 'x-cache': 'BYPASS-CSS-SIZE' });
  }
  if (bucket && cacheable) {
    ctx.waitUntil(persistAsset(upstream.clone(), bucket, key, contentType, cacheControl)
      .catch(error => console.warn('R2 asset write failed', error?.name)));
  }
  const response = mark(upstream, { 'x-cache': 'MISS-R2-FETCHED', ...(cacheable ? { 'cache-control': cacheControl } : {}) });
  if (cacheable) putEdge(response);
  return response;
}
