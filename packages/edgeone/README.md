# Webflow China Speedup — EdgeOne Pages

> EdgeOne 部署路径。与 `packages/cf-worker/`（Cloudflare Worker 路径）并列，用户可按需选择。
>
> 本路径深度利用 EdgeOne 的 3200+ 国内边缘节点和内置 CDN 缓存，提供更低的国内延迟和更高的免费额度。

## 为什么选择 EdgeOne 路径？

| 特性 | EdgeOne | Cloudflare Worker |
|------|---------|-------------------|
| 国内节点 | ✅ 3200+ 边缘节点（全国覆盖） | ❌ 无国内节点 |
| 免费额度 | 500 万请求/月（Edge Function） | 10 万请求/天（Worker） |
| 持久缓存 | ✅ 内置 CDN 缓存（无需存储桶方案） | ✅ 需要单独 R2 存储桶 |
| 爬虫控制 | ✅ 免费 AI Bot Management（2026.02 上线） | ❌ 需要额外规则 |
| 部署复杂度 | 腾讯云国内账号 | Cloudflare 全球账号 |

## 缓存架构

EdgeOne 路径**不需要**类似 Cloudflare R2 的存储桶方案。其内置 CDN 缓存层已经提供了等效功能：

| 层级 | 组件 | TTL | 说明 |
|------|------|-----|------|
| L1 | EdgeOne CDN 边缘节点 | 最长 30 天 | 分布式缓存，命中时完全绕过 Edge Function，零消耗 |
| L2 | EdgeOne 中心缓存 | 最长 30 天 | 边缘未命中时从中心缓存读取 |
| L3 | 源站（Webflow） | — | 全缓存未命中时回源，触发一次 Edge Function |

- 静态资源（CSS/JS/图片）：边缘缓存 TTL 30 天，用户访问几乎零函数消耗
- HTML 页面：边缘缓存 5 分钟，兼顾内容更新速度和性能
- **爬虫命中缓存时同样不消耗 Edge Function 配额**

## 2026 年 EdgeOne 新功能

| 功能 | 上线时间 | 对本项目的影响 |
|------|---------|---------------|
| AI Bot Management（爬虫控制） | 2026.02 | 可在控制台免费开启，无需代码修改 |
| AI 爬虫画像库 | 2026.03 | 自动识别 AI 爬虫并限制频率，GUI 配置 |
| 永久免费套餐 | 2026.03 | 基础 Edge Function 配额永久免费 |
| 一键式 KV 存储 | 2026.05 | 如需要缓存共享数据，控制台直接开启 |

以上功能均通过 EdgeOne 控制台 GUI 配置，无需修改 Edge Function 代码。

## 版本历史

| 版本 | 说明 |
|------|------|
| v1.0 | 初始版本 |
| v2.0 | 修复 Geo 路由、Health 端点、缓存地区分离 |
| v2.1 | 目录整合（`edgeone-optimized` 合并到 `edgeone`）、更新新功能文档 |

## v2.0 修复内容

| # | 问题 | 修复方式 |
|---|------|---------|
| 1 | Geo 路由不生效 | 改用 `getClientCountry()` 多 header fallback，不再只依赖 `EO-Client-IPCountry` |
| 2 | Health 端点 500 | 不用 `Response.json()`，改用 `new Response(JSON.stringify())` |
| 3 | 缓存不分地区 | 响应增加 `Vary: EO-Client-IPCountry`，`edgeone.json` 所有规则增加 `varyByHeader` |
| 4 | stale 过期太长 | 从 604800(7天) 降至 3600(1小时) |

## 部署步骤

### 方式一：通过 EdgeOne Pages 控制台（推荐）

1. 在本地执行 `cd packages/edgeone && node build.mjs` 生成 `.edgeone/` 目录
2. 将 `packages/edgeone/` 提交到 Git 仓库
3. 打开 [腾讯云 EdgeOne 控制台](https://console.cloud.tencent.com/edgeone) → Pages → 新建项目
4. 选择「从 Git 导入」，Root directory 设置为 `packages/edgeone/`
5. 构建配置留空，直接创建
6. 部署完成后设置环境变量：`WEBFLOW_ORIGIN_HOST` = 你的 `xxx.webflow.io`
7. 重新部署 → 绑定自定义域名
8. （可选）在控制台开启 AI Bot Management 限制爬虫频率

### 方式二：直接上传文件夹

1. `cd packages/edgeone && node build.mjs`
2. 将整个 `edgeone/` 目录压缩上传到 EdgeOne Pages
3. 设置环境变量同上

## 爬虫控制建议（EdgeOne 控制台配置）

EdgeOne 提供免费的爬虫管理能力，无需修改 Edge Function 代码：

1. 登录 [EdgeOne 控制台](https://console.cloud.tencent.com/edgeone)
2. 进入你的站点 → **安全 → Bot 管理**
3. 开启 **AI Bot 画像识别**（2026.02 上线的免费功能）
4. 设置规则：对 AI 爬虫（GPTBot, ClaudeBot 等）返回 403 或限制速率
5. 或者在 **速率限制** 中设置：单 IP 每秒不超过 10 次请求

## 验证

部署后访问 `https://你的域名/__proxy/health`，应看到：

```json
{"ok":true,"runtime":"edgeone-pages","geo":{"detectedCountry":"CN","allGeoHeaders":[...]}}
```

- 用美国代理访问 → 应 301 重定向到 `webflowcn.webflow.io`
- 直连访问（CN）→ 正常显示，资源走国内 CDN

## 环境变量

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `WEBFLOW_ORIGIN_HOST` | ✅ | 你的 Webflow 项目地址，如 `xxx.webflow.io` |
| `MIRROR_JQUERY` | 可选 | jQuery 国内镜像地址 |
| `MIRROR_JSD_MIRROR` | 可选 | jsDelivr 国内镜像 |
| `MIRROR_WEBFONT` | 可选 | WebFont loader 国内镜像 |
| `ASSET_PROXY_PREFIX` | 可选 | 资源代理路径前缀（默认 `/__eo_asset_v3__`） |

## 注意事项

- 首次部署后，用海外代理访问确认是否触发了 301 重定向
- 如果 Geo 路由仍不工作，检查腾讯云 EdgeOne 控制台 → 「回源 HTTP 请求头」是否传递了 `EO-Client-IPCountry`
- 如需限制爬虫频率，优先使用 EdgeOne 控制台的 Bot Management 功能，不需要修改函数代码
- EdgeOne 免费配额：500 万次 Edge Function 调用/月（2026.07 标准），普通站点远用不完
