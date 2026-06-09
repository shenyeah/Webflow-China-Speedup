# Webflow China Speedup — EdgeOne Pages (v2.0 优化版)

> 修复了 Geo 路由不生效 + 缓存不分地区 + Health 端点 500

## v2.0 修复内容

| # | 问题 | 修复方式 |
|---|------|---------|
| 1 | Geo 路由不生效 | 改用 `getClientCountry()` 多 header fallback，不再只依赖 `EO-Client-IPCountry` |
| 2 | Health 端点 500 | 不用 `Response.json()`，改用 `new Response(JSON.stringify())` |
| 3 | 缓存不分地区 | 响应增加 `Vary: EO-Client-IPCountry`，`edgeone.json` 所有规则增加 `varyByHeader` |
| 4 | stale 过期太长 | 从 604800(7天) 降至 3600(1小时) |

## 部署步骤

### 方式一：通过 EdgeOne Pages 控制台（推荐）

1. 在本地执行 `npm run build` 生成 `.edgeone/` 目录
2. 将 `packages/edgeone-optimized/` 上传到 Git 仓库
3. 打开 [腾讯云 EdgeOne 控制台](https://console.cloud.tencent.com/edgeone) → Pages → 新建项目
4. 选择「从 Git 导入」，Root directory 设置为 `packages/edgeone-optimized/`
5. 构建配置留空，直接创建
6. 部署完成后设置环境变量：`WEBFLOW_ORIGIN_HOST` = 你的 `xxx.webflow.io`
7. 重新部署 → 绑定自定义域名

### 方式二：直接上传文件夹

1. `cd packages/edgeone-optimized && node build.mjs`
2. 将整个 `edgeone-optimized/` 目录压缩上传到 EdgeOne Pages
3. 设置环境变量同上

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
- `functions/` 目录是旧版遗留，确认 CF Worker 无依赖后可删除
