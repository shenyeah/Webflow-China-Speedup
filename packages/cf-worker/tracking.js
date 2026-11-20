export const WEBFLOW_GOOGLE_GATEWAY_PATH_RE = /^\/9i1h7htkfq16[^/]*\//;

function trackingTagAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? (match[1] ?? match[2] ?? match[3]).replace(/&amp;/gi, "&") : "";
}

export function isGoogleTrackingUrl(value, requestUrl, gatewayRoots = []) {
  if (!value) return false;
  let url;
  try { url = new URL(value, requestUrl); } catch { return false; }
  const host = url.hostname.toLowerCase();
  const trackingHosts = ["googletagmanager.com", "google-analytics.com", "analytics.google.com",
    "googleadservices.com", "googlesyndication.com", "doubleclick.net"];
  if (trackingHosts.some((domain) => host === domain || host.endsWith(`.${domain}`))) return true;
  if ((host === "google.com" || host.endsWith(".google.com")) &&
      /^\/(?:pagead\/|ccm\/|g\/collect(?:\/|$)|ads\/ga-audiences)/.test(url.pathname)) return true;
  return url.origin === requestUrl.origin &&
    (WEBFLOW_GOOGLE_GATEWAY_PATH_RE.test(url.pathname) || gatewayRoots.some((root) => url.pathname.startsWith(root)));
}

export function stripGoogleTracking(input, requestUrl) {
  // Discover a changed gateway path only when directly paired with Webflow's
  // native bootstrap. Never classify arbitrary same-origin async scripts.
  const gatewayRoots = [];
  const pairedBootstrap = /<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?google_tags_first_party(?:(?!<\/script>)[\s\S])*?<\/script>\s*(<script\b[^>]*\bsrc\s*=[^>]*>[\s\S]*?<\/script>)/gi;
  for (const match of input.matchAll(pairedBootstrap)) {
    try {
      const url = new URL(trackingTagAttribute(match[1], "src"), requestUrl);
      if (url.origin === requestUrl.origin && url.pathname.split("/").filter(Boolean).length >= 2) {
        gatewayRoots.push(`${url.pathname.slice(0, url.pathname.lastIndexOf("/") + 1)}`);
      }
    } catch { /* Ignore malformed markup; do not guess another service's URL. */ }
  }

  let output = input.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (tag) => {
    const src = trackingTagAttribute(tag.slice(0, tag.indexOf(">") + 1), "src");
    if (src) return isGoogleTrackingUrl(src, requestUrl, gatewayRoots) ? "" : tag;
    // Consent UI may use gtag only as a local authorization queue. Preserve it
    // and the Meta bridge; no Google loader remains to consume that queue.
    if (isConsentBridgeScript(tag)) return tag;
    return /(?:google_tags_first_party|gtag\s*\(\s*["'](?:js|config)["']|GoogleAnalyticsObject|googletagmanager\.com|google-analytics\.com)/i.test(tag) ? "" : tag;
  });
  output = output.replace(/<(?:link|img|iframe)\b[^>]*>(?:\s*<\/iframe>)?/gi, (tag) => {
    const value = trackingTagAttribute(tag, /^<link\b/i.test(tag) ? "href" : "src");
    return isGoogleTrackingUrl(value, requestUrl, gatewayRoots) ? "" : tag;
  });
  return output;
}

function isConsentBridgeScript(script) {
  return /(?:cw[:_-]|consentMode|setConsent|cwOptionsPanel|consent[-_ ]updated|ad_storage|ad_user_data|analytics_storage)/i.test(script);
}
