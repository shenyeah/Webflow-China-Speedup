# Webflow-China-Speedup

> Webflow 网站在中国大陆打不开？两条路线，一份方案，5 分钟恢复访问。

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/shenyeah/webflow-china-speedup/tree/main/packages/cf-worker)
[![使用 EdgeOne Pages 部署](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://console.cloud.tencent.com/edgeone/pages/new?repository-url=https%3A%2F%2Fgithub.com%2Fshenyeah%2Fwebflow-china-speedup) — 🇨🇳 中国版
[![Deploy to EdgeOne Pages](https://raw.githubusercontent.com/shenyeah/webflow-china-speedup/refs/heads/main/assets/deploy-edgeone-pages.svg)](https://edgeone.ai/pages/new?repository-url=https%3A%2F%2Fgithub.com%2Fshenyeah%2Fwebflow-china-speedup) — 🌐 国际版

***

## 问题

2025 年 11 月起，Webflow 自定义域名(绑定的域名)在中国大陆被 GFW 封控 — **不是慢，是完全打不开**。这并不代表Webflow的服务被禁止，而是GFW常规的批次限制， Webflow 所用的IP刚好在这个批次中。

| 问题 | 影响 |
|------|------|
| GFW 封控 `cdn.webflow.com` | 自定义域名完全不可访问 |
| Google Fonts / Analytics 被墙 | 字体空白，页面阻塞 2-5 秒 |
| Webflow CDN 无大陆节点 | CSS/JS/图片从海外回源，极慢 |
| jQuery 走 CloudFront（亚马逊的CDN） | 每次页面加载阻塞 500ms-2s |

**反向代理不是"优化"——是让网站在大陆能打开的唯一途径。**

***


## 两条路线

| | CF Worker + R2 | EdgeOne Pages |
| --- | --- | --- |
| **国内延迟** | 50-150ms | 5-20ms |
| **ICP 备案** | 不需要 | 需要 |
| **费用** | 免费 | 免费起步（300万次/月） |
| **节点** | 香港/新加坡 | 国内 2800+ |
| **部署方式** | 点按钮，自动创建 Worker + R2 | EdgeOne 控制台 Git 导入 |
| **HTML 改写** | HTMLRewriter（流式） | 边缘函数（全量替换） |
| **静态资源缓存** | R2 永久缓存 | EdgeOne 节点缓存 |
| **方案教程** | [→ CF Worker 部署指南](packages/cf-worker/README.md) | [→ EdgeOne Pages 部署指南](packages/edgeone/README.md) |

**怎么选？** 有 ICP 备案 → EdgeOne（延迟最低）。没有备案 → CF Worker（免费，够用）。

***

## 5 分钟上手

### 路线 A：CF Worker + R2（无需备案，点按钮一键部署）

点击上方 **Deploy to Cloudflare Workers** 按钮，Cloudflare 会自动：

1. 创建 Worker 项目
2. 创建 R2 Bucket 并自动绑定到 Worker
3. 跳转到配置页面，**只需填写一个环境变量**：`WEBFLOW_HOST` = 你的 `xxx.webflow.io`

填写后 Deploy → 绑定自定义域名 → 完成。不再需要手动创建 R2、手动绑定。

> 如果对稳定性要求较高，建议先 Fork 本仓库，然后从自己的 Fork 部署。方法见 [→ 完整部署指南](packages/cf-worker/README.md)

### 路线 B：EdgeOne Pages（需要 ICP 备案，Git 导入）

点击上方 **使用 EdgeOne Pages 部署** 按钮，跳转 EdgeOne 控制台：

1. 选择「从 Git 导入」，授权 GitHub，选择 `shenyeah/webflow-china-speedup`
2. Root directory 设置为 `packages/edgeone/`，点击创建
3. 部署完成后 → 环境变量 → 添加 `WEBFLOW_ORIGIN_HOST` = `你的项目.webflow.io`
4. 重新部署 → 绑定自定义域名

部署约 30 秒完成，不需要本地操作。

[→ 完整部署指南（含环境变量说明）](packages/edgeone/README.md)

***

## 项目结构

```
webflow-china-speedup/
├── README.md                      # 你在这里
├── packages/
│   ├── cf-worker/                 # 路线 A：CF Worker + R2（完全自包含，Deploy 按钮入口）
│   │   ├── README.md              # 部署指南
│   │   ├── wrangler.toml          # CF 部署配置（含 R2 自动创建）
│   │   ├── edgeflow.config.js     # 用户配置
│   │   ├── worker.js              # Worker 代码（12 项优化）
│   │   ├── build.mjs              # 构建脚本
│   │   └── scripts/sync-check.mjs # 线上/本地版本一致性检查
│   └── edgeone/                   # 路线 B：EdgeOne Pages
│       ├── README.md              # 部署指南（含环境变量 + CDN 失效排查）
│       ├── edge-functions/_shared/proxy.js  # 边缘函数代理逻辑
│       └── build.mjs              # 构建脚本
```

***
## 为什么要用 webflow.io 地址而不是发布域名

Webflow 自定义域名的 DNS 指向 `cdn.webflow.com`（Cloudflare IP），这个出口被 GFW 封锁，这也是为什么你的网站在大陆打不开的根本原因。详见 [Webflow 官方文档](https://help.webflow.com/hc/en-us/articles/33961315914515-Connect-your-Cloudflare-domain-to-Webflow)。

反向代理方案通过 `xxx.webflow.io` 地址访问源站——这个域名走的是另一组 IP，目前在大陆仍可访问。代理负责从 `webflow.io` 拉取内容、改写被墙的资源、通过国内节点返回给用户。

**⚠️ 关于 Webflow 使用条款**

Webflow 的 [Terms of Service](https://webflow.com/legal/terms) 要求发布到自定义域名的站点使用付费计划。通过反向代理绕过 `cdn.webflow.com` 在技术上可行，但如果你使用的是 **Webflow 免费版 (Starter Plan)** 并通过本方案发布到自定义域名，这可能违反 Webflow 的服务条款。建议：

- 购买至少一个 **Site Plan**（Basic / CMS / Business），这是合规使用 Webflow 的基础
- 本方案的目的是绕过 GFW 的**地理限制**，不是绕过 Webflow 的**收费机制**
- 如果使用免费版 + 反向代理，风险自负：Webflow 可能暂停你的账号或站点

***

## 覆盖的优化

两种路线均自动覆盖以下优化（具体实现方式不同）：

| # | 优化项 | 说明 |
|---|--------|------|
| 1 | HTML 缓存头 | 边缘缓存 5 分钟，避免每次回源 |
| 2 | Google 资源清理 | 移除 preconnect/dns-prefetch/GTM/GA |
| 3 | CSS @import 过滤 | 删除 CSS 内的 Google Fonts 引用 |
| 4 | R2 query string 键 | 带版本参数的资源正确缓存 |
| 5 | jQuery 镜像替换 | CloudFront → 国内 CDN |
| 6 | 视频 URL 重写 | data-video-urls 纳入缓存 |
| 7 | HTTP Range 支持 | 视频分段加载、立即起播 |
| 8 | CSS 内部 URL 改写 | @font-face/背景图不走 Fastly |
| 9 | SRI integrity 移除 | CSS 改写后防止哈希校验失败 |
| 10 | 视频 poster 补全 | source/srcset/poster-url/style 全覆盖 |
| 11 | 301/302 拦截 | 修正 Location 头，防止 webflow.io 泄露 |

***

## 常见问题

### 第三方统计/检测服务（如 Fathom、GA4）在大陆不工作怎么办？

这类服务通常分两步：① 从海外 CDN 加载 JS 脚本；② 浏览器将数据上报到海外服务器。代理只能解决第①步（让脚本加载更快），第②步的数据上报仍然会因网络问题失败。

**建议**：如果有 analytics 需求，直接替换为国内可访问的服务（如百度统计、CNZZ 等），或自建开源方案（如 Plausible），确保脚本加载和数据上报都在国内网络下畅通。
