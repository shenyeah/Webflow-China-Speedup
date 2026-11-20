import { isGoogleTrackingUrl, stripGoogleTracking } from './tracking.js';
import { HTML_LIMIT, readBounded } from './cache.js';

const WEBFLOW_CDN = ['website-files.com', 'uploads-ssl.webflow.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const JQUERY_HOST = 'd3e54v103j8qbb.cloudfront.net';
const JQUERY_PATH = /^\/js\/jquery-3\.5\.1(?:\.min)?\.[a-f\d]+\.js$/i;
const ASSET_URL = /(?:https:)?\/\/[a-z\d.-]+(?=[/:?#\s"')>,]|$)/gi;
const CSS_ASSET_URL = /(?:https:)?\/\/[a-z\d.-]+(?=\/)/gi;

export function isAllowedAssetHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return WEBFLOW_CDN.some(suffix => host === suffix || host.endsWith(`.${suffix}`));
}

function assetUrl(value, base, jqueryMirror) {
  if (!/^(?:https:)?\/\//i.test(value)) return value;
  try {
    const parsed = new URL(value, base);
    if (parsed.hostname === JQUERY_HOST && JQUERY_PATH.test(parsed.pathname)) return jqueryMirror;
    if (!isAllowedAssetHost(parsed.hostname) || parsed.port || parsed.username || parsed.password) return value;
    return `/_cdn/${parsed.hostname}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return value;
  }
}

export function rewriteCssAssetUrls(input) {
  return String(input).replace(CSS_ASSET_URL, match => {
    const url = new URL(match, 'https://example.invalid');
    return isAllowedAssetHost(url.hostname) ? `/_cdn/${url.hostname}` : match;
  });
}

export function publicUrl(value, cfg) {
  if (!/^(?:https:)?\/\//i.test(value)) return value;
  try {
    const url = new URL(value, cfg.origin);
    return url.origin === cfg.origin.origin ? `${cfg.publicOrigin}${url.pathname}${url.search}${url.hash}` : value;
  } catch {
    return value;
  }
}

export function rewriteHeaders(input, responseUrl, cfg, optimize, tracking) {
  const headers = new Headers(input);
  if (headers.has('location')) headers.set('location', publicUrl(headers.get('location'), cfg));
  if (headers.has('link')) {
    const link = headers.get('link');
    const items = link.split(/,(?=\s*<)/).flatMap(item => {
      const match = /^\s*<([^>]+)>/.exec(item);
      if (!match) return [item];
      if (!tracking && isGoogleTrackingUrl(match[1], responseUrl)) return [];
      const rewritten = optimize ? assetUrl(match[1], responseUrl, cfg.jqueryMirror) : publicUrl(match[1], cfg);
      const next = item.replace(match[1], rewritten);
      return [/\bas\s*=\s*"?style\b/i.test(next) && rewritten.startsWith('/_cdn/')
        ? next.replace(/;\s*integrity\s*=\s*(?:"[^"]*"|[^;\s]+)/gi, '') : next];
    });
    if (items.length) headers.set('link', items.join(','));
    else headers.delete('link');
  }
  return headers;
}

export async function rewriteHtml(response, responseUrl, cfg, optimize, tracking) {
  const headers = new Headers(response.headers);
  for (const name of ['content-length', 'content-encoding', 'etag', 'content-md5']) headers.delete(name);
  let source = response;
  const knownLength = Number(response.headers.get('content-length'));
  if (!tracking && knownLength <= HTML_LIMIT) {
    const bytes = await readBounded(response.clone(), HTML_LIMIT);
    if (bytes) {
      void response.body?.cancel().catch(() => {});
      const html = stripGoogleTracking(new TextDecoder().decode(bytes), responseUrl);
      source = new Response(html, { status: response.status, headers });
    }
  }
  const rewrite = value => {
    const published = publicUrl(value, cfg);
    return optimize ? assetUrl(published, responseUrl, cfg.jqueryMirror) : published;
  };
  const handlers = new HTMLRewriter()
    .on('.w-webflow-badge', { element(el) { el.remove(); } })
    .on('head', { element(el) { el.prepend('<style>.w-webflow-badge{display:none!important}</style>', { html: true }); } })
    .on('a[href], form[action], link[href], meta[property="og:url"][content]', {
      element(el) {
        const attribute = el.getAttribute('href') !== null ? 'href' : el.tagName === 'form' ? 'action' : 'content';
        const value = el.getAttribute(attribute);
        if (value) el.setAttribute(attribute, publicUrl(value, cfg));
      }
    });
  if (!tracking) handlers.on('script[src], iframe[src], img[src], link[href]', {
    element(el) {
      if (isGoogleTrackingUrl(el.getAttribute(el.tagName === 'link' ? 'href' : 'src'), responseUrl)) el.remove();
    }
  });
  if (optimize) handlers.on('link[href], script[src], img, source, video, [data-video-urls], [data-poster-url]', {
    element(el) {
      if (el.removed) return;
      for (const attr of ['href', 'src', 'poster', 'data-poster-url']) {
        const value = el.getAttribute(attr);
        if (!value) continue;
        const next = rewrite(value);
        if (next !== value) el.setAttribute(attr, next);
        if (attr === 'href' && next.startsWith('/_cdn/') &&
            (el.getAttribute('rel') === 'stylesheet' || el.getAttribute('as') === 'style')) el.removeAttribute('integrity');
      }
      for (const attr of ['srcset', 'imagesrcset', 'data-video-urls', 'style']) {
        const value = el.getAttribute(attr);
        if (!value) continue;
        const next = value.replace(ASSET_URL, match => {
          const url = new URL(match, responseUrl);
          return isAllowedAssetHost(url.hostname) ? `/_cdn/${url.hostname}` : match;
        });
        if (next !== value) el.setAttribute(attr, next);
      }
    }
  });
  const transformed = handlers.transform(source);
  return new Response(transformed.body, { status: response.status, headers });
}
