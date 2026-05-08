import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";

// --- Build stamp ---
let buildVersion = "dev";
let deployTime = new Date().toISOString();
try {
  buildVersion = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
} catch { /* not a git repo */ }

// --- Read user config from repo root, fall back to env / defaults ---
let userConfig = {};
const repoRoot = new URL("../../", import.meta.url);
try {
  userConfig = (await import(new URL("edgeflow.config.js", repoRoot))).default || {};
} catch {
  try {
    userConfig = (await import(new URL("edgeflow.config.js", import.meta.url))).default || {};
  } catch { /* no config file */ }
}

const config = {
  webflowHost: process.env.WEBFLOW_HOST || userConfig.webflowHost || "__WEBFLOW_HOST__",
  r2PublicUrl: process.env.R2_PUBLIC_BASE || userConfig.r2PublicUrl || "__R2_PUBLIC_URL__"
};

// --- Read worker source ---
let workerCode = readFileSync("worker.js", "utf-8");

// --- Replace placeholders ---
workerCode = workerCode.replace(/"__BUILD_VERSION__"/g, JSON.stringify(buildVersion));
workerCode = workerCode.replace(/"__DEPLOY_TIME__"/g, JSON.stringify(deployTime));
workerCode = workerCode.replace(/"__WEBFLOW_HOST__"/g, JSON.stringify(config.webflowHost));
workerCode = workerCode.replace(/"__R2_PUBLIC_URL__"/g, JSON.stringify(config.r2PublicUrl));
// Also replace the old-style placeholders (for backward compatibility)
workerCode = workerCode.replace(/"REPLACE_WITH_YOUR_WEBFLOW_HOST"/g, JSON.stringify(config.webflowHost));
workerCode = workerCode.replace(/"REPLACE_WITH_YOUR_R2_PUBLIC_URL"/g, JSON.stringify(config.r2PublicUrl));

// --- Write output ---
mkdirSync("dist", { recursive: true });
writeFileSync("dist/worker.js", workerCode);

console.log(`✓ Built dist/worker.js (version: ${buildVersion})`);
