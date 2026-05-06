# 两条路线详细对比

## 架构差异

### CF Worker + R2

```
大陆用户 → 自定义域名
  → Cloudflare Worker（香港/新加坡边缘节点）
    ├── HTML 请求 → 回源 Webflow → HTMLRewriter 流式改写 → 返回
    ├── 静态资源 → R2 Bucket 查找
    │   ├── 命中 → 直接返回（1-5ms）
    │   └── 未命中 → 回源 Webflow CDN → 写入 R2 → 返回
    └── 视频 → Range 请求支持，分段返回
```

### EdgeOne Pages（EdgeOne Pages）

```
大陆用户 → 自定义域名
  → EdgeOne 国内节点（2800+）
    → EdgeOne 边缘函数 代理函数
      ├── rewriteDomainTokens() → URL 域名替换
      ├── applyChinaSpeedRewrites() → Google Fonts/GA/jQuery/CDN 替换
      ├── stripWebflowBranding() → Badge/水印移除
      └── injectOptimizations() → lazy loading/dns-prefetch
    → Webflow 源站

海外用户 → EdgeOne Geo 检测 → 301 重定向 → Webflow 源站直连
```

## 改写能力对比

| 改写项 | CF Worker | EdgeOne (EdgeOne Pages) |
|--------|-----------|-------------------|
| Google Fonts → 国内镜像 | ✅ `fonts.googleapis.cn` | ✅ `fonts.googleapis.cn` |
| GA/GTM 移除 | ✅ HTMLRewriter | ✅ 文本替换 |
| jQuery → 国内镜像 | ✅ jsdmirror | ✅ lib.baomitu.com |
| jsDelivr → 镜像 | ❌（不处理 jsDelivr） | ✅ cdn.jsdmirror.com |
| GSAP → 代理路径 | ❌ | ✅ 代理改写 |
| Webflow Badge 移除 | ✅ CSS + MutationObserver | ✅ CSS + JS 注入 |
| 图片 lazy loading | ❌ | ✅ 自动注入 |
| CSS @font-face 改写 | ✅ 文本替换 | ✅ 文本替换 |
| 视频 Range 支持 | ✅ 206 Partial | ⚠️ 取决于 EdgeOne 配置 |
| robots.txt / sitemap | ❌（R2 静态文件） | ✅ 自动生成 |
| 海外用户 Geo 分流 | 需手动配置 | ✅ 自动检测 |
| SRI 处理 | ✅ 移除 integrity | ✅ 保留（内容不变） |

## 多域名场景

### 双域名策略（场景 D）

当你有一个无法备案的主品牌域名（如 `.io`/`.design`）和一个可备案的 `.cn` 域名：

- `brand.cn` → EdgeOne 国内版 → Webflow 源站（大陆用户）
- `brand.io` → Webflow 原生 Hosting（海外用户）

**两条路线都支持这个架构。** CF Worker 版本：`brand.cn` 走 CF Worker，`brand.io` 走 Webflow 直连。

### SEO 配置

两个域名都需要设置 canonical + hreflang，防止搜索引擎判定为重复内容：

```html
<!-- 在 brand.cn 页面 -->
<link rel="canonical" href="https://www.brand.io">
<link rel="alternate" hreflang="zh-Hans" href="https://www.brand.cn">

<!-- 在 brand.io 页面 -->
<link rel="alternate" hreflang="zh-Hans" href="https://www.brand.cn">
```
