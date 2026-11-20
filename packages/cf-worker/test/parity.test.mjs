import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker.js';
import { publicHtmlUrl, mayCache, readBounded } from '../cache.js';
import { rewriteHeaders } from '../html.js';
import { stripGoogleTracking } from '../tracking.js';

const host = 'https://proxy.example';
const origin = new URL('https://origin.example');
const cfg = { origin, publicOrigin: host, jqueryMirror: 'https://mirror.example/jquery.js' };
const gateway = '/9i1h7htkfq16site/token';
const fixture = `<script>window.google_tags_first_party=['GTM-EXAMPLE']</script><script async src="${gateway}"></script>
  <script src="https://www.googletagmanager.com/gtm.js"></script>
  <script>window.cwOptionsPanel={};gtag('consent','default',{});</script>
  <script>window.__chinashopMetaBridge={};</script><script src="https://www.google.com/recaptcha/api.js"></script>
  <img src="https://googleads.g.doubleclick.net/pagead/pixel"><iframe src="https://www.google.com/maps/embed"></iframe>`;

function req(path, country = 'CN', init) {
  const request = new Request(`${host}${path}`, init);
  Object.defineProperty(request, 'cf', { value: { country } });
  return request;
}

function context() {
  const tasks = [];
  return { tasks, waitUntil(promise) { tasks.push(promise); } };
}

test('China tracking removes direct and paired gateway scripts while preserving consent, Meta and Google services', () => {
  for (const path of [gateway, '/new-gateway/token']) {
    const html = stripGoogleTracking(fixture.replace(gateway, path), new URL(host));
    assert.doesNotMatch(html, /google_tags_first_party|googletagmanager|doubleclick|gateway\/token|9i1h7/);
    assert.match(html, /cwOptionsPanel/);
    assert.match(html, /__chinashopMetaBridge/);
    assert.match(html, /recaptcha\/api\.js/);
    assert.match(html, /google\.com\/maps/);
  }
});

test('HTML cache accepts only anonymous mainland public GET and normalizes only analytics queries', () => {
  assert.equal(publicHtmlUrl(req('/news?utm_source=test&gclid=1'), 'CN').href, `${host}/news`);
  for (const request of [req('/news?filter=3'), req('/search'), req('/api'), req('/news', 'CN', { headers: { cookie: 'session=1' } }), req('/news', 'CN', { headers: { authorization: 'Bearer token' } }), req('/news', 'CN', { headers: { range: 'bytes=1-' } }), req('/news', 'CN', { method: 'POST' })]) {
    assert.equal(publicHtmlUrl(request, 'CN'), null);
  }
  assert.equal(publicHtmlUrl(req('/news', 'US'), 'US'), null);
});

test('shared HTML rejects private, varying and personalized responses', () => {
  const html = headers => new Response('test', { headers: { 'content-type': 'text/html', ...headers } });
  assert.ok(mayCache(html({ vary: 'Accept-Encoding', 'set-cookie': '_cfuvid=test' })));
  assert.equal(mayCache(html({ vary: 'Cookie' })), false);
  assert.equal(mayCache(html({ 'set-cookie': 'session=test' })), false);
  assert.equal(mayCache(html({ 'cache-control': 'private' })), false);
});

test('Link preloads rewrite only mainland assets, remove changed CSS integrity, and preserve crossorigin', () => {
  const headers = new Headers({ link: `<https://cdn.prod.website-files.com/file.css>; rel=preload; as=style; integrity="sha384-test"; crossorigin, <${gateway}>; rel=preload; as=script` });
  const china = rewriteHeaders(headers, new URL(host), cfg, true, false).get('link');
  assert.match(china, /\/_cdn\/cdn\.prod\.website-files\.com\/file\.css/);
  assert.match(china, /crossorigin/);
  assert.doesNotMatch(china, /integrity|9i1h7/);
  assert.equal(rewriteHeaders(headers, new URL(host), cfg, false, true).get('link'), headers.get('link'));
});

test('bounded writes refuse an unknown-length body beyond the limit', async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(10)); controller.close(); } });
  assert.equal(await readBounded(new Response(stream), 2), null);
});

test('mainland legacy gateway stops before fetch; overseas keeps upstream and POST keeps its body', async () => {
  const saved = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url.origin, origin.origin);
    if (options.method === 'POST') assert.equal(await new Response(options.body).text(), 'test');
    return new Response('upstream');
  };
  try {
    const env = { ORIGIN_HOST: origin.hostname, WEBFLOW_HOST: 'ignored.webflow.io', OVERSEAS_MODE: 'direct-assets' };
    const cn = await worker.fetch(req(gateway), env, context());
    assert.equal(cn.status, 204);
    assert.equal(cn.headers.get('cache-control'), 'no-store');
    assert.equal(calls, 0);
    assert.equal(await (await worker.fetch(req(gateway, 'US'), env, context())).text(), 'upstream');
    await worker.fetch(req('//example.invalid/api', 'US', { method: 'POST', body: 'test' }), env, context());
    assert.equal(calls, 2);
    const loop = await worker.fetch(req('/'), { ORIGIN_HOST: 'proxy.example' }, context());
    assert.equal(loop.status, 502);
  } finally { globalThis.fetch = saved; }
});

test('R2 range hit supports suffix, clamp and 416, and HEAD never reads the body', async () => {
  let reads = 0;
  const metadata = { size: 100, etag: 'test', httpEtag: '"test"', uploaded: new Date(), writeHttpMetadata(headers) { headers.set('content-type', 'video/mp4'); } };
  const bucket = { async head() { return metadata; }, async get(_, options) { reads++; return { body: new Uint8Array(options.range?.length ?? 100) }; } };
  const path = '/_cdn/cdn.prod.website-files.com/movie.mp4';
  const get = (range, method = 'GET') => worker.fetch(req(path, 'CN', { method, headers: { range } }), { MY_BUCKET: bucket }, context());
  const clip = await get('bytes=-10');
  assert.equal(clip.status, 206);
  assert.equal(clip.headers.get('content-range'), 'bytes 90-99/100');
  assert.equal((await clip.arrayBuffer()).byteLength, 10);
  assert.equal((await get('bytes=90-1000', 'HEAD')).headers.get('content-range'), 'bytes 90-99/100');
  const invalid = await get('bytes=100-101');
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get('content-range'), 'bytes */100');
  assert.equal(reads, 1);
});

test('refresh cannot proceed without a secret and rejects private paths', async () => {
  const endpoint = '/__proxy/refresh';
  const cf = context();
  assert.equal((await worker.fetch(req(endpoint), {}, cf)).status, 405);
  assert.equal((await worker.fetch(req(endpoint, 'CN', { method: 'POST' }), {}, cf)).status, 401);
  const response = await worker.fetch(req(endpoint, 'CN', {
    method: 'POST', headers: { authorization: 'Bearer test' }, body: '{"paths":["/api/account"]}'
  }), { SNAPSHOT_REFRESH_SECRET: 'test' }, cf);
  assert.deepEqual((await response.json()).results, [{ path: '/api/account', status: 400 }]);
});
