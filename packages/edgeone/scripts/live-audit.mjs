const base = process.argv[2];

if (!base) {
  console.error("Usage: node scripts/live-audit.mjs https://YOUR_DOMAIN_HERE");
  process.exit(1);
}

const res = await fetch(base, {
  headers: { "user-agent": "live-audit-script" }
});
const html = await res.text();

const checks = [
  { name: "Has asset proxy prefix", pass: html.includes("__eo_asset_v3__") },
  { name: "Google analytics removed", pass: !/googletagmanager|google-analytics/i.test(html) },
  { name: "Google webfont loader replaced", pass: html.includes("cdn.jsdmirror.com/npm/webfontloader@1.6.26/webfontloader.js") },
  { name: "Inline Google WebFont config removed", pass: !/WebFont\.load\(\s*\{\s*google\s*:/i.test(html) },
  { name: "GSAP uses EO asset proxy", pass: /__eo_asset_v3__\/cdn\.prod\.website-files\.com\/gsap\/3\.15\.0\/gsap\.min\.js/i.test(html) },
  { name: "SRI CSS proxied via EO", pass: /href="https:\/\/[^"']+__eo_asset_v3__\/cdn\.prod\.website-files\.com\/[^"']+\.css"[^>]*integrity=/i.test(html) },
  { name: "No ix3 hidden-content style", pass: !/html\.w-mod-js:not\(\.w-mod-ix3\)[^<]*post_collection-item/i.test(html) }
];

console.log(`Audit target: ${base}`);
for (const c of checks) {
  console.log(`${c.pass ? "PASS" : "FAIL"} - ${c.name}`);
}

const failed = checks.filter((c) => !c.pass).length;
process.exit(failed > 0 ? 2 : 0);
