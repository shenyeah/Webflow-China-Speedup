export const HTML_LIMIT = 2 * 1024 * 1024;
export const ASSET_LIMIT = 8 * 1024 * 1024;
const TRACKING_QUERY = /^(?:utm_[\w-]+|gclid|dclid|fbclid|msclkid|gbraid|wbraid)$/i;
const PRIVATE_PATH = /^\/(?:api|admin|account|checkout|cart|login|logout|member|members|preview|search|settings|__proxy|_debug|\.well-known)(?:\/|$)/i;
const STATIC_PATH = /\.[a-z\d]{2,10}$/i;

export function publicHtmlUrl(request, country) {
  if (request.method !== 'GET' || country !== 'CN') return null;
  if (['cookie', 'authorization', 'range'].some(name => request.headers.has(name))) return null;
  const url = new URL(request.url);
  if (PRIVATE_PATH.test(url.pathname) || STATIC_PATH.test(url.pathname)) return null;
  for (const key of url.searchParams.keys()) {
    if (!TRACKING_QUERY.test(key)) return null;
  }
  url.search = '';
  return url;
}

export function mayCache(response) {
  if (response.status !== 200 || !response.headers.get('content-type')?.includes('text/html')) return false;
  if (/\b(?:no-store|private|no-cache)\b/i.test(response.headers.get('cache-control') || '')) return false;
  const vary = (response.headers.get('vary') || '').toLowerCase().split(',').map(value => value.trim());
  if (vary.some(value => value && value !== 'accept-encoding')) return false;
  return (response.headers.getSetCookie?.() || [response.headers.get('set-cookie')].filter(Boolean))
    .every(cookie => /^_cfuvid=/.test(cookie));
}

// Stop at the limit even if the source omitted Content-Length. The other tee
// branch remains available to the visitor when an object is too large to store.
export async function readBounded(response, limit) {
  if (!response.body) return new Uint8Array();
  if (Number(response.headers.get('content-length')) > limit) {
    void response.body.cancel().catch(() => {});
    return null;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      void reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export async function hashKey(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function correctSecret(actual, expected) {
  if (!expected || !actual || actual.length > 1024) return false;
  const [a, b] = await Promise.all([hashKey(actual), hashKey(expected)]);
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

export function positiveInt(value, fallback, max) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, max) : fallback;
}

export function mark(response, headers) {
  const result = new Response(response.body, response);
  for (const [key, value] of Object.entries(headers)) result.headers.set(key, String(value));
  return result;
}
