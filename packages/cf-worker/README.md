# Cloudflare Worker + R2

用 Cloudflare Workers 代理已发布的 Webflow 站点。大陆响应改写静态资源并过滤 Google 统计和广告，海外可保留 Webflow 原生资源链路。实际访问速度取决于运营商、Cloudflare 节点和回源。

## 部署

在 Webflow 绑定并发布一个专用源站域名，例如 `origin.example.com`，再为 Worker 配置 `ORIGIN_HOST=origin.example.com`。访客域名绑定 Worker，源站域名绑定 Webflow。两个地址必须分开。

通过仓库的 Cloudflare Deploy 按钮可使用示例配置。手工部署时，在 `packages/cf-worker` 运行 `npm test` 和 `npm run build`。在自己的 Wrangler 配置中绑定 `MY_BUCKET` 到 R2，并以 `dist/worker.js` 为入口部署，构建会写入 Git 版本。`/_debug` 和 `/__proxy/health` 返回部署信息。

| 配置 | 用途 |
|---|---|
| `ORIGIN_HOST` / `WEBFLOW_HOST` | 自定义 Webflow 源站及兼容别名。空配置使用演示站 |
| `PUBLIC_HOST` | 可选的对外域名。默认使用请求域名 |
| `OVERSEAS_MODE=direct-assets` | 海外 HTML 仍经过 Worker，原始静态资源由浏览器直连 |
| `OVERSEAS_REDIRECT_HOST` | 可选的海外跳转目标 |
| `NOINDEX_HOSTS` / `NOINDEX_ALL=1` | 为指定域名或整个测试部署加 `X-Robots-Tag` |
| `CACHE_TTL` / `SNAPSHOT_TTL` / `SNAPSHOT_MAX_AGE` | 本地边缘 HTML 缓存、R2 快照新鲜期与故障回退上限，默认 300、900、3600 秒 |
| `CACHE_VERSION` / `ASSET_R2_TTL` | 显式缓存切换、非指纹资源有效期。HTML 改写另有版本键 |
| `SNAPSHOT_R2=off` | 关闭 HTML 的 R2 快照 |
| `SNAPSHOT_REFRESH_SECRET` | 使用 Wrangler Secret 配置的刷新密钥 |
| `R2_PUBLIC_BASE` | 可选的自建 sitemap 来源，失败时改用 Webflow sitemap |
| `SITE_ACCELERATION_PUBLIC_HOST` / `SITE_ACCELERATION_SECRET` | 信任配置好的前置站点代理。请求需携带匹配的 `x-edgeflow-site-secret` |

刷新使用 `POST /__proxy/refresh`，传 `Authorization: Bearer …`。JSON 可传 `paths` 或 `offset` 和 `limit`。省略 `paths` 时按 sitemap 发现公开路径，每批最多 20 个。刷新服务仅写匿名大陆 HTML 缓存。未知地域使用大陆改写策略，现场地域由 Cloudflare `request.cf.country` 判定。

## 缓存和视频

公开大陆 HTML 按 Host、源站、地域及改写版本隔离。登录、表单提交和功能性 URL 查询回源。边缘未命中时可使用 R2 快照，回源错误时只在配置的时间范围内返回旧内容。Cloudflare Cache API 命中只代表该节点的缓存状态。

`/_cdn/` 只转发允许的 Webflow 资产域名。保留 Range、HEAD 和 ETag 语义。CSS 改写单独使用版本键，大文件流式交付。首屏外部媒体仍按原站交互加载。视频播放器指向的 R2 媒体域保持直出，独立于代理缓存桶。

更多背景见 [功能差异和迁移记录](../../docs/workers-makers-parity.md)。
