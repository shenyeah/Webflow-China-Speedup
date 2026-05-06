# webflow-china-speedup

> Webflow 网站在中国大陆打不开？两条路线，一份方案，5 分钟恢复访问。

[![License](https://img.shields.io/github/license/shenyeah/webflow-china-speedup)](LICENSE)
[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/shenyeah/webflow-china-speedup)
[![使用 EdgeOne Pages 部署](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://console.cloud.tencent.com/edgeone/pages/new?repository-url=https%3A%2F%2Fgithub.com%2FWebflowcn%2Fedgeflow)

---

## 问题

2025 年 11 月起，Webflow 自定义域名在中国大陆被 GFW 封控 — **不是慢，是完全打不开**。

| 问题 | 影响 |
|------|------|
| GFW 封控 `cdn.webflow.com` | 自定义域名完全不可访问 |
| Google Fonts / Analytics 被墙 | 字体空白，页面阻塞 2-5 秒 |
| Webflow CDN 无大陆节点 | CSS/JS/图片从海外回源，极慢 |
| jQuery 走 CloudFront | 每次页面加载阻塞 500ms-2s |
| Webflow 水印 | 免费版右下角 Badge |

**反向代理不是"优化"——是让网站在大陆能打开的唯一途径。**

---

## 两条路线

| | CF Worker + R2 | EdgeOne Pages |
|---|---|---|
| **国内延迟** | 50-150ms | 5-20ms |
| **ICP 备案** | 不需要 | 需要 |
| **费用** | 免费 | 免费起步（300万次/月） |
| **节点** | 香港/新加坡 | 国内 2800+ |
| **部署方式** | 浏览器操作，无需安装 | EdgeOne 控制台 Git 导入 |
| **HTML 改写** | HTMLRewriter（流式） | 边缘函数（全量替换） |
| **静态资源缓存** | R2 永久缓存 | EdgeOne 节点缓存 |
| **多站点** | 一个 Worker 按 Host 分流 | 需多个 Pages 项目 |

**怎么选？** 有 ICP 备案 → EdgeOne（延迟最低）。没有备案 → CF Worker（免费，够用）。

> 还有一种 VPS 反代方案（Caddy/Nginx，¥68/年，20-50ms），适合手头已有国内服务器的场景。详见 [docs/vps.md](docs/vps.md)。

---

## 5 分钟上手

### 路线 A：CF Worker + R2（无需备案，浏览器操作）

点击上方 **Deploy to Cloudflare Workers** 按钮，Cloudflare Dashboard 会自动创建 Worker 项目，然后：

1. **创建 R2 Bucket** — Dashboard → R2 → Create Bucket，命名如 `webflow-assets`
2. **粘贴 Worker 代码** — Worker → Quick Edit，复制 [`packages/cf-worker/worker.js`](packages/cf-worker/worker.js) 的全部内容粘贴进去 → Save and Deploy
3. **绑定 R2** — Worker → Settings → Variables → R2 Bucket Bindings → 添加绑定 `MY_BUCKET` → 选择刚创建的 Bucket
4. **设置环境变量** — Worker → Settings → Variables → 添加 `WEBFLOW_HOST`（你的 `xxx.webflow.io`）
5. **绑定域名** — Worker → Triggers → Custom Domains → 添加你的域名

不需要安装任何东西，全程浏览器操作。

[→ 完整部署指南（截图级步骤）](packages/cf-worker/README.md)

### 路线 B：EdgeOne Pages（需要 ICP 备案，Git 导入）

点击上方 **使用 EdgeOne Pages 部署** 按钮，跳转 EdgeOne 控制台：

1. 选择「从 Git 导入」，授权 GitHub，选择 `Webflowcn/edgeflow` 仓库
2. 构建配置全部留空，直接点击创建
3. 部署完成后 → 环境变量 → 添加 `WEBFLOW_ORIGIN_HOST` = `你的项目.webflow.io`
4. 重新部署 → 绑定自定义域名

部署约 30 秒完成，不需要本地操作。

---

## 不确定选哪个？

用 **[交互式规划器](https://shenyeah.github.io/webflow-china-speedup)** 填写你的域名信息，实时检测 ICP 可行性，自动推荐最佳路线。

---

## 项目结构

```
webflow-china-speedup/
├── README.md                      # 你在这里
├── SKILL.md                       # AI Agent 指令（给 Claude/Cursor 读的）
├── packages/
│   └── cf-worker/                 # 路线 A：CF Worker + R2
│       ├── README.md              # Dashboard 部署指南
│       ├── worker.js              # Worker 代码（12 项优化）
│       └── wrangler.toml.example  # 配置参考
├── docs/
│   ├── comparison.md              # 两条路线详细对比
│   └── vps.md                     # VPS 方案简述
├── interactive-guide/             # 交互式规划器（即将上线）
└── references/
    └── worker-template.js         # Worker 代码（历史版本）
```

---

## 覆盖的优化（12 项）

| # | 优化项 | 说明 |
|---|--------|------|
| 1 | HTML 缓存头 | 边缘缓存 5 分钟，避免每次回源 |
| 2 | Google 资源清理 | 移除 preconnect/dns-prefetch/GTM/GA |
| 3 | CSS @import 过滤 | 删除 CSS 内的 Google Fonts 引用 |
| 4 | R2 query string 键 | 带版本参数的资源正确缓存 |
| 5 | jQuery 镜像替换 | CloudFront → jsdmirror（国内 CDN） |
| 6 | 视频 URL 重写 | data-video-urls 纳入 R2 缓存 |
| 7 | HTTP Range 支持 | 视频分段加载、立即起播 |
| 8 | CSS 内部 URL 改写 | @font-face/背景图不走 Fastly |
| 9 | SRI integrity 移除 | CSS 改写后防止哈希校验失败 |
| 10 | 视频 poster 补全 | source/srcset/poster-url/style 全覆盖 |
| 11 | 301/302 拦截 | 修正 Location 头，防止 webflow.io 泄露 |
| 12 | Badge 双重移除 | CSS 隐藏 + MutationObserver 删除 |

---

## 许可证

MIT
