import { execSync } from "node:child_process";

const target = process.argv[2];
if (!target) {
  console.error("用法: node packages/cf-worker/scripts/sync-check.mjs https://your-domain.com");
  console.error("  或: node packages/cf-worker/scripts/sync-check.mjs https://your-domain.workers.dev");
  process.exit(1);
}

async function main() {
  // 1. Get local git HEAD
  let localHead = "(unknown)";
  let localTime = "(unknown)";
  try {
    localHead = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
    localTime = execSync("git log -1 --format=%ci", { encoding: "utf-8" }).trim();
  } catch { /* not a git repo */ }

  // 2. Get remote HEAD (origin/main)
  let remoteHead = "(unknown)";
  try {
    remoteHead = execSync("git rev-parse --short origin/main", { encoding: "utf-8" }).trim();
  } catch { /* no remote */ }

  // 3. Fetch deployed version
  console.log(`\n目标: ${target}`);
  console.log(`本地: ${localHead} (${localTime})`);
  console.log(`远端: ${remoteHead}\n`);

  let deployed;
  try {
    const resp = await fetch(`${target.replace(/\/+$/, "")}/_debug`);
    if (!resp.ok) {
      console.error(`❌ /_debug 返回 ${resp.status} ${resp.statusText}`);
      process.exit(1);
    }
    deployed = await resp.json();
    console.log(`线上: ${deployed.version} (${deployed.deployTime || "N/A"})`);
  } catch (err) {
    console.error(`❌ 无法访问 /_debug 端点: ${err.message}`);
    process.exit(1);
  }

  // 4. Comparison
  const deployedVer = deployed.version || "";
  if (deployedVer === "dev") {
    console.log("\n⚠️  线上版本为 'dev'——未运行构建步骤，无法验证同步性。");
    console.log("   建议: node build.mjs 然后重新部署 dist/worker.js");
    process.exit(0);
  }

  if (deployedVer === localHead) {
    console.log("\n✅ 线上代码与本地一致 (匹配)");
  } else if (deployedVer === remoteHead) {
    console.log("\n⚠️  线上代码与本地 HEAD 不一致，但与远端 origin/main 一致。");
    console.log("   本地可能还有未推送的提交。");
  } else {
    console.log("\n❌ 线上代码与本地和远端均不匹配！");
    console.log(`   线上: ${deployedVer}`);
    console.log(`   本地: ${localHead}`);
    console.log(`   远端: ${remoteHead}`);
    process.exit(1);
  }
}

main().catch(console.error);
