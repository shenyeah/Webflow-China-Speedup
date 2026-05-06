# CF Worker + R2 — Webflow 中国大陆加速

无需 ICP 备案，免费，5 分钟部署。利用 Cloudflare 香港/新加坡节点 + R2 持久缓存。

## 架构

```
大陆用户 → 自定义域名 → CF Worker（香港/新加坡）
  ├── 静态资源 → R2 缓存命中 → 直接返回
  ├── 静态资源未命中 → 回源 Webflow CDN → 异步写入 R2
  └── HTML/动态 → 回源 Webflow → HTMLRewriter 流式改写 → 返回
```

## 部署

### 前置条件

- Cloudflare 账号
- 域名托管在 Cloudflare（或 NS 指向 Cloudflare）
- Node.js 18+

### 第 1 步：安装 Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 第 2 步：创建 R2 Bucket

Cloudflare Dashboard → R2 → Create Bucket，命名为 `webflow-assets`。

### 第 3 步：配置

```bash
cp wrangler.toml.example wrangler.toml
```

编辑 `wrangler.toml`，修改：

- `WEBFLOW_HOST` → 你的 Webflow 项目地址（如 `my-site.webflow.io`）
- `R2_PUBLIC_BASE` → R2 Bucket 公开访问 URL（在 R2 → Settings → Public Access 获取）
- `MY_BUCKET` → R2 Bucket 名称（与第 2 步创建的保持一致）

### 第 4 步：部署

```bash
npx wrangler deploy
```

### 第 5 步：绑定域名

Cloudflare Dashboard → Workers & Pages → 你的 Worker → Triggers → Custom Domains → 添加你的域名。

在 Cloudflare DNS 中将域名 CNAME 到 Worker 地址（或开代理橙色云）。

### 第 6 步：验证

在国内网络环境访问你的域名：

- 网站能正常打开 ✅
- 字体正常加载（无 Google Fonts 超时）✅
- 无 Webflow Badge ✅
- DevTools Network 中无 `googleapis.com` 请求 ✅

## 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `WEBFLOW_HOST` | Webflow 项目地址 | `my-site.webflow.io` |
| `R2_PUBLIC_BASE` | R2 公开访问 URL | `https://pub-xxx.r2.dev` |

## Worker 代码中的替换变量

在 `worker.js` 中搜索 `REPLACE_WITH_` 并替换：

- `REPLACE_WITH_YOUR_WEBFLOW_HOST` → Webflow 项目地址
- `REPLACE_WITH_YOUR_R2_PUBLIC_URL` → R2 公开 URL

或直接在 `wrangler.toml` 中通过 `[vars]` 设置环境变量，在 Worker 中通过 `env.WEBFLOW_HOST` 读取。

## 12 项自动优化

部署后自动生效：Google Fonts 替换、GA/GTM 移除、jQuery 镜像、视频分段加载、R2 永久缓存、CSS 内部 URL 改写、SRI 处理、Badge 移除、301/302 拦截。
