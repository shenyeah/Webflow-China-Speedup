---
name: webflow-china-speedup
description: >
  Webflow 中国大陆访问加速。两条路线：CF Worker + R2（无需备案，免费）和 EdgeOne Pages / Edgeflow（需备案，5-20ms）。
  触发场景：Webflow 网站速度慢、中国大陆无法访问、CF Worker 反向代理、Google 资源被屏蔽、Webflow CDN 加速、
  字体加载慢、视频加载慢、jsdmirror 替换、R2 缓存、ICP 备案、EdgeOne 国内节点、双域名双 CDN 架构、DNS 地理分流、
  多项目扩展、Geo-DNS、Webflow CMS 内容加速、Chinafy 替代方案、edgeflow、webflow-china-speedup。
  即使用户只是问"我的 Webflow 网站在中国大陆很慢怎么办"也要触发。
---

# Webflow 网站中国大陆访问加速

> 📦 **GitHub 仓库**：[Webflowcn/webflow-china-speed](https://github.com/Webflowcn/webflow-china-speed) — 统一入口，两条路线覆盖所有场景。

## 两条路线速览

| | CF Worker + R2 | EdgeOne Pages (Edgeflow) |
|---|---|---|
| **代码位置** | `packages/cf-worker/worker.js` | [github.com/Webflowcn/edgeflow](https://github.com/Webflowcn/edgeflow) |
| **国内延迟** | 50-150ms | 5-20ms |
| **ICP 备案** | 不需要 | 需要 |
| **费用** | 免费 | 免费起步 |

**决策**：有 ICP 备案 → EdgeOne。没有 → CF Worker。

以下展开 CF Worker 路线的全部细节。EdgeOne 路线见 [Edgeflow 仓库](https://github.com/Webflowcn/edgeflow)。

## ⚠️ 2025 年重要变化：Webflow 自定义域名被 GFW 封控

**2025 年 11 月起**，Webflow 自定义域名在中国大陆严重受限或完全无法访问。原因链：

1. Webflow 于 2025 年 4 月将所有自定义域名从旧基础设施（`proxy-ssl.webflow.com`，AWS 美西）迁移到 Cloudflare（`cdn.webflow.com`，IP `198.202.211.1`）
2. GFW 对该 Cloudflare 出口 IP 段实施了 SNI 层面的封控
3. **结果：所有未经反代处理的 Webflow 自定义域名在大陆不可访问或极度不稳定**
4. `*.webflow.io` 的 staging 域名走的是另一组 Cloudflare IP（`172.64.x.x`），目前仍可访问但不稳定

**这意味着**：反向代理/Worker 已不再是"优化"——而是让 Webflow 网站在中国大陆能打开的**唯一途径**。

---

## 前置条件确认

在开始前，先了解用户现有架构：
- **域名与 Webflow URL**：用户自定义域名是什么？原始 Webflow URL（`*.webflow.io`）是什么？
- **是否已有 CF Worker**：如果已有，让用户提供现有 Worker 代码；如果没有，需要从头建
- **是否已有 R2 Bucket**：R2 是持久化静态资源缓存的关键
- **CF Account ID**：部署 Worker 需要
- **是否有 ICP 备案域名**：决定能否使用国内 CDN 节点
- **网站特殊内容**：有没有视频背景、自定义字体、第三方 JS 库、CMS 动态内容？

---

## 三条可选路线及决策树

### 路线对比

| | CF Worker + R2 | VPS 反向代理 | 国内 CDN（EdgeOne 等）|
|--|---------------|------------|-------------------|
| **核心能力** | HTML 改写（HTMLRewriter）+ R2 持久缓存 | HTML 改写（sub_filter / 正则）+ 本地缓存 | 静态缓存 + 分布式节点 |
| **能否删 Google 资源** | ✅ HTMLRewriter | ✅ Nginx sub_filter / Caddy replace | ⚠️ 仅 EdgeOne 边缘函数可以 |
| **能否移除 Webflow Badge** | ✅ JS 注入 MutationObserver | ✅ sub_filter 注入 | ⚠️ 仅边缘函数可以 |
| **国内延迟** | 50-150ms（香港/新加坡节点）| 20-50ms（单台国内服务器）| 5-20ms（全国分布式节点）|
| **需要 ICP 备案** | ❌ | ✅（服务器在大陆）| ✅（加速域名必须备案）|
| **抗高并发** | ✅ 无限扩展 | ❌ 单台瓶颈 | ✅ |
| **成本** | 免费（CF 免费套餐足够）| ¥68-99/年（轻量服务器）| ¥ 按量（EdgeOne 标准版）|
| **适合** | 所有客户（无论有没有备案）| 有备案、低流量客户 | 有备案、需要极致速度或高并发 |

### 决策树

```
客户有 ICP 备案域名？
├── 否 → 只能用 CF Worker + R2（路线 A，当前方案，无需备案）
│        国内延迟 50-150ms，已是无备案最优
│
└── 是 → 需要 SEM 投放（百度、360）或高并发？
     ├── 否 → VPS 反代 + CF Worker 境外分流（路线 B，成本最低）
     │        Caddy/1Panel 可视化操作，¥68/年
     │
     └── 是 → EdgeOne 标准版 + 边缘函数 + CF Worker 境外分流（路线 C，最快）
              全国 5-20ms，抗高并发，按量付费
```

### 关于"纯 CDN 能不能解决所有问题"

**不能。** 国内 CDN（腾讯云 CDN、阿里云 CDN）只做缓存+分发，不能：
- 删除 HTML 里的 Google Fonts / preconnect 标签 → 浏览器仍请求 Google 服务器，卡 3-5s
- 替换 jQuery CDN 源 → CloudFront 无大陆节点，阻塞渲染
- 改写 CSS 里的 Fastly 绝对 URL → 字体/图片绕过缓存
- 移除 Webflow Badge → Badge 是 JS 动态注入的，必须用脚本干预
- 注入 ICP 备案号 → HTML 内容改写

**唯一例外：EdgeOne 边缘函数**——本质上是腾讯的 Serverless Worker，可以做完整 HTML 改写，等同于 CF Worker 的国产替代。但需要标准版套餐（付费）+ ICP 备案。

### 反向代理工具推荐（2026 年）

| 工具 | 推荐度 | 特点 |
|------|-------|------|
| **Caddy** | ⭐⭐⭐⭐⭐ | 自动 HTTPS、3 行配置、单文件部署、原生 HTTP/3、活跃维护 |
| **1Panel + OpenResty** | ⭐⭐⭐⭐ | 可视化面板、Docker 化、图形界面操作反代+SSL、适合不想写配置的人 |
| **Nginx** | ⭐⭐⭐ | 成熟稳定、sub_filter 可改写 HTML、但配置繁琐 |
| **Lucky（大吉）** | ⭐⭐ | 路由器/NAS 场景，不适合生产环境 |

### 国内外分流架构

```
client.cn DNS → DNSPod（免费版即可按线路分区域解析）
├── 境内线路 → 国内 VPS / EdgeOne + 边缘函数
└── 境外线路 → CF Worker（*.workers.dev 或 CNAME 接入）
```

**关键澄清**：
- **备案审的是服务器 IP，不是 DNS 在哪里**——DNS 可以放 DNSPod 也可以放 CF
- **境外线路走 CF Worker**——德国、美国用户享受原汁原味的 CF 优化版
- **域名不强制必须在国内注册商**——但后缀必须在工信部批准列表里（.com/.cn/.net 等，.design 不行）

### 多客户共享架构

| 客户类型 | 方案 | 成本分摊 |
|---------|------|---------|
| **有备案域名** | 客户 `.cn` 域名 CNAME 到你的国内 VPS/EdgeOne，你配置反代 | 客户各自独立域名，隔离性好 |
| **无备案域名** | CF Worker 方案（当前 10 项优化），香港/新加坡节点 | 免费，通过你的 CF 账号统一管理 |
| **多个无备案客户共享 Worker** | 一个 CF Worker 按 `Host` 头分流到不同 Webflow 站点 | 一个 Worker 处理多客户 |

⚠️ **不要用你自己的备案域名给客户的网站做反代**——备案主体必须与实际运营者一致，代替他人备案是违规行为。

### 多语言网站注意事项

Webflow 多语言用子目录结构（`/zh/`、`/en/`），不支持按域名分语言。分流后需注意：
- Worker / 反代必须拦截 301/302 重定向，修正 `Location` 头中的 `webflow.io` 为客户域名
- Webflow 根据 `Accept-Language` 自动跳转，国内用户通常命中 `/zh/`
- CMS Collection 页面可能不带语言前缀，需确认 Webflow 项目的 Localization 设置

---

## 诊断清单：检测哪些资源有问题

在中国大陆，以下资源**必然**被屏蔽或严重降速：

| 资源类型 | 问题根源 | 影响 |
|---------|---------|------|
| **Webflow 自定义域名本身** | GFW 封控 cdn.webflow.com 出口 | 网站完全打不开（2025.11 起） |
| Google Fonts (`fonts.googleapis.com`) | GFW 封锁 | 字体加载失败，页面渲染阻塞 |
| Google 相关 preconnect/dns-prefetch | DNS 解析超时 | 每次页面请求额外增加 2-5s |
| Google Analytics / gtag | GFW 封锁 | 统计失效（不阻塞渲染，但浪费连接） |
| WebFont Loader (`webfont.js`) | Google 相关 | 同 Google Fonts |
| Webflow CDN (Fastly + CloudFront) | 无大陆节点 | 静态资源从海外回源，RTT 高 |
| Webflow 注入的 jQuery (d3e54v103j8qbb.cloudfront.net) | CloudFront 无大陆节点 | 每次页面加载阻塞约 500ms-2s |
| 视频文件 (`.mp4`/`.webm`) | 无大陆 CDN 节点 | 视频无法起播，需要完整下载 |

**如何快速诊断**：用 `curl` 从国内 IP 测试关键资源，或让用户在国内打开浏览器 DevTools 的 Network 面板，按耗时排序。

---

## 架构方案

```
用户 (中国大陆)
    ↓
Cloudflare Worker (全球节点，含香港/日本/新加坡)
    ↓ 静态资源命中 R2 → 直接返回 (延迟极低)
    ↓ 静态资源未命中 → 回源 Webflow CDN → 异步写入 R2
    ↓ HTML/动态请求 → 回源 Webflow → HTMLRewriter 改写后返回
    ↓
{project}.webflow.io（原始 Webflow 站点）
```

**关键路径**：
- `/_cdn/{host}/{path}` — 所有 Webflow 静态资源的 R2 缓存路由
- HTMLRewriter — 流式改写 HTML，替换/删除被墙资源链接，无需等待完整 HTML
- R2 Bucket — 永久缓存静态资源（字体、图片、JS、视频），冷启动后无需再回源

---

## 12 项核心优化（已验证）

### [优化 1] HTML 响应加缓存头 + CF 边缘 cacheTtl

**问题**：Webflow 默认返回的 HTML 无缓存头，CF 每次都回源，大陆用户每次都经历完整 RTT。
**方案**：给 HTML 响应加 `cache-control: public, max-age=300, s-maxage=300`，同时在 `fetch()` 里设 `cacheTtl: 300`，让 CF 边缘节点缓存 5 分钟。
**注意**：要 `delete("set-cookie")` 避免带 cookie 的响应被缓存后污染其他用户。

### [优化 2] 移除 Google preconnect / dns-prefetch / gstatic 标签

**问题**：即使不加载 Google Fonts，HTML 里残留的 `<link rel="preconnect" href="fonts.googleapis.com">` 等标签也会让浏览器发起 DNS 查询，在大陆超时后才放弃，消耗 2-5s。
**方案**：用 HTMLRewriter 移除所有 `href` 含 `google` 或 `gstatic` 的 `preconnect`/`dns-prefetch` 标签，以及直接指向 `fonts.googleapis.com`/`fonts.gstatic.com` 的 `<link>` 标签。

### [优化 3] CSS 内 @import fonts.googleapis.com 过滤

**问题**：Webflow 有时会把 Google Fonts 的 `@import` 放进 CSS 文件里（而非 HTML `<link>`），HTMLRewriter 无法处理 CSS 内容。
**方案**：对 `text/css` 响应做文本替换，用正则删除所有 `@import url(...)` 中含 `fonts.googleapis.com` 的行。

### [优化 4] R2 objectKey 包含 query string

**问题**：某些静态资源 URL 带有版本参数（如 `?v=xxx`），如果 R2 key 只用路径，不同版本会映射到同一个 key，导致缓存错乱。
**方案**：objectKey 格式为 `assets/{host}/{path}_{base64(queryString)}`，有 query 时包含编码后的 query 部分。

### [优化 5] jQuery 直接替换为 jsdmirror

**背景**：Webflow 在所有网站的 `</body>` 前自动注入 jQuery 3.5.1，源固定来自 `d3e54v103j8qbb.cloudfront.net`（所有 Webflow 网站共用，URL 中的哈希前缀固定不变）。
**问题**：CloudFront 在大陆没有节点，这个 script 标签会阻塞页面完成渲染。
**方案**：用 HTMLRewriter 将该 `<script src>` 替换为 jsdmirror URL。
**验证**：三个源（CloudFront、cdnjs、jsdmirror）提供的字节完全一致，SHA256 相同，所以标签上原有的 `integrity` SRI 属性仍然能通过校验，无需修改。
```javascript
// HTMLRewriter 里的替换规则
.on('script[src*="d3e54v103j8qbb.cloudfront.net"][src*="jquery"]', {
  element(el) {
    el.setAttribute("src", "https://cdn.jsdmirror.com/npm/jquery@3.5.1/dist/jquery.min.js");
    // crossorigin 属性保留，SRI 跨域校验必须
  }
})
```

### [优化 6] 重写 data-video-urls 属性（背景视频）

**问题**：Webflow 背景视频用 `data-video-urls="url1.mp4,url2.webm"` 属性存储视频地址，这个属性是自定义 attribute，不是标准 `src`，普通的资产 URL 重写（`link/script/img/source`）会遗漏它。
**方案**：单独加一个 HTMLRewriter 规则匹配 `[data-video-urls]`，把属性值按逗号分割后逐个重写到 `/_cdn/` 路径。

### [优化 7] /_cdn/ 支持 HTTP Range 请求

**问题**：视频文件需要 Range 请求才能边加载边播放（206 Partial Content）。如果不处理 Range，R2 会返回整个文件，视频播放器会等待完整下载，首帧延迟高。
**方案**：
- R2 命中时：用 `env.MY_BUCKET.get(key, { range: { offset, length } })` 返回 206
- R2 未命中时：将 Range 头转发给上游，但不缓存分段响应到 R2（只缓存完整 200 响应）

### [优化 8] /_cdn/ CSS 文件缓存前先改写内部 URL

**问题**：`/_cdn/` 处理器默认把资源原样透传并缓存。CSS 文件内部的 `@font-face src: url(https://cdn.prod.website-files.com/...)` 和背景图片等绝对 URL 不会被改写，浏览器加载 CSS 后直接向 Fastly 拉取字体/图片，完全绕过 R2 缓存。这个问题不容易被发现——DevTools 里字体确实是 `.woff2`，但实际走的是 Fastly 而非 R2。
**诊断方法**：`curl` 拉取 `/_cdn/...min.css`，用 `grep -oP 'https?://[^")\\s,]+'` 查找其中所有绝对 URL，看是否仍指向 `cdn.prod.website-files.com`。
**方案**：在 `/_cdn/` 处理器的 R2 未命中回源路径里，对 CSS 文件（`content-type: text/css` 或路径以 `.css` 结尾）先做 URL 改写，再写入 R2 缓存。

### [优化 9] 移除 stylesheet `<link>` 的 SRI integrity 属性

**问题**：Webflow 生成的 HTML 里，CSS `<link>` 标签带有 `integrity="sha384-..."` 属性（Subresource Integrity）。Worker 改写了 CSS 文件内部 URL（优化 8），导致文件内容变化，SHA-384 哈希不再匹配。浏览器会静默拒绝加载该 CSS，**页面彻底失去样式**，且控制台报错容易被忽略。
**方案**：HTMLRewriter 里加一条规则，移除所有 `<link rel="stylesheet">` 上的 `integrity` 属性。
**注意**：jQuery 的 `<script integrity>` 不需要处理，因为我们只是换了 URL 而没有修改文件内容，字节完全一致，SRI 仍然通过。
```javascript
.on('link[rel="stylesheet"][integrity]', {
  element(el) { el.removeAttribute("integrity"); }
})
```
**R2 旧缓存处理**：部署新 Worker 后，R2 里已缓存的 CSS 文件（未经改写的版本）仍然会被命中返回，导致问题持续。需要在 CF Dashboard → R2 → Bucket 里手动删除对应的 CSS 对象，强制下次请求走回源流程重新处理。

### [优化 10] 补全视频 poster 及 `<source src>` 的改写

**问题**：Webflow 背景视频在 HTML 里同时存在三条并行路径，[优化 6] 只处理了其中一条：

| 属性 | 谁读取 | 优化 6 前 |
|------|-------|---------|
| `data-video-urls` | Webflow JS 运行时 | ✅ 已改写 |
| `<source src>` | 浏览器原生回退 | ❌ 漏网 |
| `data-poster-url` | Webflow JS 设置海报帧 | ❌ 漏网 |
| `<video style="background-image:url(...)">` | 浏览器直接渲染海报 | ❌ 漏网 |

前三条会导致视频/海报仍从 Fastly 加载；`video[style]` 是最隐蔽的——poster 作为内联 CSS 背景图注入，不走任何 src 属性，普通属性扫描完全看不到。

**诊断方法**：`curl` 拉 HTML，搜索 `data-poster-url` 和 `video[style]`，看是否仍有 `https://cdn.prod.website-files.com` 地址。

**方案**：
- 将 `source[srcset]` 改为 `source[src], source[srcset]`，同时覆盖视频源和图片多分辨率
- 新增 `[data-poster-url]` handler 改写 poster URL
- 新增 `video[style]` handler，用正则替换 `background-image:url(...)` 里的绝对地址

### [优化 11] redirect: "manual" 拦截 Webflow 301/302 重定向

**问题**：Webflow 在语言路由（`/` → `/zh/`）和 URL 规范化时返回 301/302 重定向，`Location` 头含 `*.webflow.io` 域名。如果 Worker 使用 `redirect: "follow"`（默认），fetch 会静默跟随重定向，最终返回的页面 URL 可能暴露 `webflow.io`（在大陆被 GFW 封控），导致后续资源加载失败。
**方案**：`fetch()` 使用 `redirect: "manual"`，Worker 拦截 301/302 响应，将 `Location` 头中的 `webflow.io` 域名替换为用户自定义域名后返回。
```javascript
const originResp = await fetch(proxyURL.toString(), {
  method: req.method,
  headers: req.headers,
  redirect: "manual", // 关键：不自动跟随重定向
  cf: { cacheEverything: true, cacheTtl: 300 }
});
if (originResp.status === 301 || originResp.status === 302) {
  const location = originResp.headers.get("Location");
  // 将 webflow.io 替换为自定义域名
  const fixedLocation = location.replace(/webflow\.io/, CUSTOM_DOMAIN);
  // ... 返回修正后的重定向
}
```

### [优化 12] Webflow Badge CSS + MutationObserver 双重移除

**问题**：Webflow Badge（`.w-webflow-badge`）是 Webflow JS 在页面加载完成后**动态注入**到 DOM 的。HTMLRewriter 处理 HTML 时，Badge 的 DOM 节点还不存在，`.on(".w-webflow-badge", el.remove())` 永远匹配不到。
**方案**：双管齐下：
1. **CSS 注入 `<head>`**：`display:none!important`，防止 Badge 闪现（即使 JS 延迟执行，用户也看不到）
2. **MutationObserver 注入 `<body>`**：监听 DOM 变化，Badge 一旦被 Webflow JS 插入就立即 `.remove()` 彻底删除节点
```javascript
.on("head", {
  element(el) {
    el.append(`<style>.w-webflow-badge,[class*="webflow-badge"]{display:none!important}</style>`, { html: true });
  }
})
.on("body", {
  element(el) {
    el.append(`<script>(function(){function r(){var e=document.querySelector('.w-webflow-badge,[class*="webflow-badge"]');if(e)e.remove()}r();new MutationObserver(r).observe(document.documentElement,{childList:true,subtree:true})})()</script>`, { html: true });
  }
})
```

---

## Webflow CMS 内容加速

### CMS 资源与普通资源的关键区别

Webflow CMS 上传的图片和文件与站点静态资源使用**同一个 CDN 域名**（`cdn.prod.website-files.com`），但路径前缀不同：

| 类型 | CDN 路径格式 | 例子 |
|------|------------|------|
| 站点静态资源（设计稿图片、字体等）| `cdn.prod.website-files.com/{site-id}/...` | `cdn.prod.website-files.com/62d7884.../logo.svg` |
| CMS 集合项目图片（文章封面、产品图等）| `cdn.prod.website-files.com/{cms-collection-id}/...` | `cdn.prod.website-files.com/648fac5e.../post-cover.webp` |

**结论：Worker 现有的 `ASSET_HOSTS` 正则匹配的是域名而非路径，CMS 图片与普通资源走完全相同的 `/_cdn/` 路由，自动得到 R2 缓存加速，无需任何额外改动。**

经过实测（`webflow-cms-demo.webflow.io`）：一个典型 CMS 站 113 个 CDN 引用中，44 个来自 site-id 路径（静态资源），73 个来自 collection-id 路径（CMS 项目图片），全部命中 `cdn.prod.website-files.com` 域名匹配规则。

### 已覆盖的 CMS 场景 ✅

- **CMS Collection List**（列表页）：Webflow 服务端渲染，图片出现在初始 HTML 里，HTMLRewriter 全部改写
- **CMS Collection Item**（详情页）：同上，完整服务端渲染
- **Webflow CMS 富文本字段**：内嵌图片也是 `cdn.prod.website-files.com` 域名，自动覆盖
- **Finsweet fs-cmsload（动态加载更多）**：fs-cmsload 通过 fetch 请求站点自身 URL（如 `/blog?page=2`），Worker 拦截并处理响应 HTML，图片 URL 同样被改写 ✅

### 未覆盖的 CMS 场景 ⚠️

| 场景 | 原因 | 是否影响大 |
|------|------|----------|
| 客户端直接调用 Webflow CMS API (`api.webflow.com`) | 请求绕过 Worker，JSON 响应里的 CDN URL 不被改写 | 中等（取决于是否有自定义 JS 调 API） |
| 第三方 CMS 渲染工具（Wized、Memberstack 等）| 同上，Ajax 响应不经过 Worker | 中等 |
| Webflow 原生搜索结果（动态返回 HTML 片段）| XHR 响应走 `/search` API，Worker 能拦截但要确认路径 | 低（搜索流量占比小） |

### Chinafy / 21YunBox 对 CMS 的处理方式（研究结论）

通过对 Chinafy 演示站（`luma-light-49bcf2webflowio.china.chinafy.com`）的实测分析：

- Chinafy 同样使用**代理层拦截** + **服务端 HTML 改写**，技术路径与 CF Worker 方案一致
- CMS 图片同样依赖服务端渲染的 HTML 被代理层捕获，**不处理纯客户端 API 调用**
- Chinafy 的所谓"Smart Optimization"对于 CMS 图片与普通图片没有区别对待
- **我们的方案与 Chinafy/21YunBox 在 CMS 覆盖范围上等价**，差异在于他们有 ICP 备案的国内 CDN 节点

### 诊断 CMS 加速是否生效

```bash
# 抓 CMS 列表页 HTML，看 CMS 集合图片 URL 是否已被改写为 /_cdn/
curl -s https://your-site.com/blog | grep -oP 'src="[^"]*"' | grep -E "/_cdn/|cdn\.prod"

# 如果输出全是 /_cdn/ → 已覆盖 ✅
# 如果仍有 cdn.prod.website-files.com → 未被 Worker 处理 ❌
```

---

## 字体优化建议

字体是另一个重要的加速点，与 Worker 改动独立：

1. **格式**：TTF 未压缩，WOFF2 约小 40-60%。在 Webflow Project Settings → Fonts 里，删除 TTF 字体文件，重新上传同一字体的 WOFF2 版本。（转换工具：`woff2_compress` 命令行，或在线工具）
2. **排查无用字体**：在 Webflow 里上传了字体不一定实际用到了。先用 `curl` 拉取网站 HTML，搜索每个字体名，确认实际有被 CSS `font-family` 或 Webflow 样式引用后再保留。未使用的字体是纯负担（169KB/字体的典型值），直接删除。
3. **Adobe Fonts**：Webflow 有 Adobe Fonts 集成入口，但只要没有实际激活的 Kit，不会产生任何网络请求，不需要处理。

---

## 第三方 JS 库注意事项

### 使用 jsdmirror 的正确姿势

jsdmirror (`cdn.jsdmirror.com`) 是 jsDelivr 的镜像，由腾讯 EdgeOne 提供大陆 CDN 节点。URL 格式：
```
https://cdn.jsdmirror.com/npm/{package}@{version}/dist/{file}.min.js
```

**必须**指定版本号和具体文件路径，否则 URL 无效。例：
- ✅ `https://cdn.jsdmirror.com/npm/lenis@1.0.27/dist/lenis.min.js`
- ❌ `https://cdn.jsdmirror.com/npm/lenis`（缺版本和路径，404）

### Lenis 平滑滚动（特别注意）

Webflow 社区流行的 Lenis 集成方案通常是一个**定制 bundle**，包含：
- Lenis 核心库（特定版本）
- Webflow 专属初始化层：读取 `[data-id-scroll]` 元素上的 `data-*` 属性作为配置
- 全局 `window.SScroll` 实例化
- `useAnchor`、`useOverscroll`、`useControls` 等扩展功能

这个定制 bundle **不在 npm 上**，因此 jsdmirror 没有它。如果用户在 Webflow 里自托管了这个 bundle（`.txt` 文件），正确做法是继续使用原有的 Webflow CDN URL——该 URL 属于 `cdn.prod.website-files.com`，Worker 会自动将其重写到 `/_cdn/` 路径并缓存到 R2，无需手动迁移。

**诊断方法**：检查 `.txt` 文件内容，看是否含有 `window.SScroll`、`I("[data-id-scroll]"` 等 Webflow 专属代码，如果有，就不能用 npm 版替换。

---

## Worker 代码模板

完整的可直接部署的 Worker 代码见本仓库的 [`references/worker-template.js`](https://github.com/Webflowcn/webflow-china-speed/blob/main/references/worker-template.js)。

也可以直接从 [GitHub Releases](https://github.com/Webflowcn/webflow-china-speed/releases) 下载完整压缩包（含 SKILL.md + Worker 模板 + 配置示例），解压后作为参考直接使用。

### 命名规范

为每个客户项目生成 Worker 时，使用以下命名格式：
- **Worker 名称**（wrangler.toml 里的 `name`）：`wf-cn-{project}`，如 `wf-cn-acme-brand`
- **JS 文件名**：`wf-cn-{project}-worker.js`，如 `wf-cn-acme-brand-worker.js`
- **R2 Bucket**：`wf-cn-{project}-assets`，如 `wf-cn-acme-brand-assets`

其中 `{project}` 取自客户域名的主体部分（如 `acme-brand.com` → `acme-brand`）。
不要使用个人名称（如 `shenye-design`）作为模板输出名，这是社区共享技能。

### 使用前需要替换的变量

- `WEBFLOW_HOST` → 用户的 Webflow 内部 URL（如 `mysite.webflow.io`）
- `R2_PUBLIC_BASE` → R2 Bucket 的公开访问 URL（如 `https://pub-xxxx.r2.dev`）
- `MY_BUCKET` → Worker 绑定的 R2 Bucket 名称（在 wrangler.toml 里配置）

其余代码可直接使用，12 项优化已内置。

---

## 常见"坑"汇总

| 坑 | 说明 |
|----|------|
| `new URL(u, "https://dummy.base")` | 用假域名作 base 是为了让 `new URL()` 能解析相对路径而不报错；对绝对 URL 没有影响 |
| jQuery SRI integrity 属性 | 替换 src 后不需要修改 integrity；三源字节完全相同，SHA256 一致 |
| CloudFront 哈希前缀 | `d3e54v103j8qbb` 对所有 Webflow 网站都是固定的，不是每个项目唯一 |
| R2 缓存残片 | 只缓存完整 200 响应，Range 请求（206）不写 R2，避免缓存片段数据 |
| CSS @import 位置 | Google Fonts 可能在 `<link>` 里也可能在 CSS `@import` 里，两处都要处理 |
| data-video-urls | 背景视频不走 `src` 属性，单独用 HTMLRewriter 规则处理 |
| Lenis 定制 bundle | npm 版 Lenis 没有 Webflow 自动初始化层，不能直接用 jsdmirror 替换 |
| set-cookie 与 HTML 缓存 | 给 HTML 加缓存时必须删 set-cookie 头，否则有 cookie 的响应被缓存后会污染其他用户 |
| CSS 内绝对 URL 绕过 R2 | `/_cdn/` 处理器默认透传原始内容，CSS 里的 `@font-face`/背景图等绝对地址不会被自动改写，需在写入 R2 前先处理 |
| CSS SRI 校验导致无样式 | 改写 CSS 内容后文件哈希变化，HTML 里的 `integrity` 属性会导致浏览器静默拒绝 CSS，页面失去所有样式；需用 HTMLRewriter 移除 stylesheet link 的 integrity 属性 |
| R2 旧缓存需手动清除 | Worker 逻辑更新后，R2 里已缓存的旧版本不会自动失效；若修改了 CSS/JS 的处理逻辑，需在 CF Dashboard 手动删除对应 R2 对象 |
| video[style] 里的 poster | Webflow 把 poster 写成 `style="background-image:url(...)"` 内联样式，不走任何 src 属性，必须单独用 `video[style]` handler + 正则处理 |
| `<source src>` 被标记 data-wf-ignore | Webflow 在 `<source>` 上加 `data-wf-ignore="true"` 表示 JS 会接管，但浏览器在 JS 加载前仍会读取这些标签作为回退，必须改写 |
| ICP 备案 | 如需使用腾讯 EdgeOne 国内节点（更低延迟），需要 ICP 备案；CF Worker 本身无需备案 |
| CMS 图片与 site-id 不同 | CMS 集合项图片的 CDN 路径前缀是 collection-id（非 site-id），但域名相同，Worker 的域名匹配规则自动覆盖，无需额外处理 |
| 客户端 CMS API 调用 | 第三方工具（Wized、自定义 JS 调 api.webflow.com）绕过 Worker 直接请求，其响应中的 CDN URL 不被改写，CMS 图片仍从 Fastly 加载；这是当前方案的已知边界，与 Chinafy/21YunBox 等价 |
| Webflow 自定义域名 GFW 封控 | 2025.11 起 Webflow 迁移到 Cloudflare 后，`cdn.webflow.com`（198.202.211.1）出口被 GFW SNI 封控，自定义域名在大陆完全不可访问；必须通过反代/Worker 绕过 |
| `*.webflow.io` 仍可访问但不稳定 | staging 域名走 Cloudflare 的 `172.64.x.x` IP 段，目前未被封，但不能依赖它作为生产方案 |
| 纯 CDN 无法解决核心问题 | 国内 CDN 只做缓存分发，不能删除 Google 资源标签、替换 jQuery CDN、改写 CSS URL、移除 Badge；必须有 HTML 改写层（Worker / 反代 / EdgeOne 边缘函数）|
