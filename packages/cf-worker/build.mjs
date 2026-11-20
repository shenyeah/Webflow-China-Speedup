import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";

// --- Build stamp ---
let buildVersion = "dev";
let deployTime = new Date().toISOString();
try {
  buildVersion = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
} catch { /* not a git repo */ }

// --- Read user config from local edgeflow.config.js, fall back to env / defaults ---
let userConfig = {};
try {
  userConfig = (await import(new URL("./edgeflow.config.js", import.meta.url))).default || {};
} catch { /* no config file */ }

const configuredR2 = process.env.R2_PUBLIC_BASE || userConfig.r2PublicUrl || "";
const config = {
  webflowHost: process.env.ORIGIN_HOST || process.env.WEBFLOW_HOST || userConfig.webflowHost || "__WEBFLOW_HOST__",
  r2PublicUrl: configuredR2.startsWith("https://") ? configuredR2 : "",
  jqueryMirror: userConfig.mirrors?.jquery
};

// --- Read worker source ---
let workerCode = readFileSync("worker.js", "utf-8");

// --- Replace placeholders ---
workerCode = workerCode.replace(/['"]__BUILD_COMMIT__['"]/g, JSON.stringify(buildVersion));
workerCode = workerCode.replace(/['"]__BUILD_DEPLOY_TIME__['"]/g, JSON.stringify(deployTime));
workerCode = workerCode.replace(/"__WEBFLOW_HOST__"/g, JSON.stringify(config.webflowHost));
workerCode = workerCode.replace(/"__R2_PUBLIC_URL__"/g, JSON.stringify(config.r2PublicUrl));

// Also replace the new default value (worker.js now ships with webflowcn.webflow.io instead of __WEBFLOW_HOST__)
workerCode = workerCode.replace(/['"]webflowcn\.webflow\.io['"]/g, JSON.stringify(config.webflowHost));
workerCode = workerCode.replace(/"REPLACE_WITH_YOUR_WEBFLOW_HOST"/g, JSON.stringify(config.webflowHost));
workerCode = workerCode.replace(/const DEFAULT_R2_PUBLIC_BASE = '';/, `const DEFAULT_R2_PUBLIC_BASE = ${JSON.stringify(config.r2PublicUrl)};`);
if (config.jqueryMirror?.startsWith("https://")) {
  workerCode = workerCode.replace(/const JQUERY_MIRROR = '[^']*';/, `const JQUERY_MIRROR = ${JSON.stringify(config.jqueryMirror)};`);
}

// --- Write output ---
mkdirSync("dist", { recursive: true });
writeFileSync("dist/worker.js", workerCode);
for (const file of ["assets.js", "cache.js", "html.js", "tracking.js"]) copyFileSync(file, `dist/${file}`);
console.log(`✓ Built dist/worker.js (version: ${buildVersion})`);
