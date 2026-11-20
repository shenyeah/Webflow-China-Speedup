# Makers 与 Cloudflare Worker 同步记录

基线为主仓库 `2a27e68` 与 CHINASHOP 私有部署仓库版本 `d2d36ec`。后者的 `1682f09` 展位地图固定瓦片入口由项目继续维护。历史客户部署与本仓库的版本独立维护。

| 功能 | 来源 | Cloudflare 适配 |
|---|---|---|
| 地域分流、可读健康检查 | `052c73d`、`487cbb0` | 用 Workers 请求地域和响应头输出情况 |
| 持久快照与故障兜底 | `00f9cd2`、`20e809d` | Cache API 本地命中，R2 保存版本化公开 HTML，冷回源异常时有上限地回退旧快照 |
| 外层缓存回源、公网 Host | `696ae9e`、`6e38d48` | `PUBLIC_HOST` 和经过密钥校验的前置 Host。Cloudflare 媒体 Range 由 R2 原生读取 |
| CSS 预加载、资产缓存 | `f0aa8c5`、`35970f8` | CSS 改写配合 preload 完整性。修复 R2 未知长度流写入，保留已知长度大文件的流式响应 |
| SEO 隔离 | `1730047` | 保留 `NOINDEX_HOSTS`，另支持隔离测试的 `NOINDEX_ALL=1` |
| 生产源站、缓存版本、Sitemap 预热 | `5a070d3` | `ORIGIN_HOST` 优先，版本化缓存键。仅经授权刷新，支持索引和分页 |
| 海外直连、Consent、第一方网关过滤 | `6e1cb85`、`042dd1f`、`d2d36ec`（CHINASHOP） | 海外保留统计。大陆识别第一方网关和旧请求，保留 Cookie 面板、授权队列和独立 Meta |

### 运行与成本

腾讯云的 Edge Functions 用量按实际执行次数与 CPU 时间计。函数内部命中缓存时函数已经执行。免费额度用尽可能终止请求。见[腾讯云资源计费说明](https://cloud.tencent.com/document/product/1552/140891)。

Cloudflare Cache API 的命中范围是单数据中心，R2 用于跨节点复用。部署时应分别观察首个冷请求、持续热请求和回源故障。两个平台的缓存存储、部署配置、诊断和配额各自独立。
