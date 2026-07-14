 # Current State

 **版本**: v2.1
 **状态**: 稳定维护
 **最后更新**: 2026-07-14
 
 ## 已完成的里程碑
 
 - [x] v1.0: 基础反向代理（CF Worker）
 - [x] v2.0: 双路线架构（CF Worker + EdgeOne Pages）
 - [x] v2.1: 优化 - content-length 修复 / 24h 缓存 / Crawl-delay / EdgeOne 清理
 - [x] v2.1.1: 零配置部署 — 移除 wrangler.toml [vars] 占位符，代码 fallback 兜底；EdgeOne 已有代码层默认值
 
 ## 当前覆盖的优化项
 
 | # | 优化 | 状态 |
 |---|------|------|
 | 1 | HTML 缓存头 | ✅ |
 | 2 | Google 资源清理 | ✅ |
 | 3 | CSS @import 过滤 | ✅ |
 | 4 | R2 query string 缓存键 | ✅ |
 | 5 | jQuery 镜像替换 | ✅ |
 | 6 | 视频 URL 重写 | ✅ |
 | 7 | HTTP Range 支持 | ✅ |
 | 8 | CSS 内部 URL 改写 | ✅ |
 | 9 | SRI integrity 移除 | ✅ |
 | 10 | 视频 poster 补全 | ✅ |
 | 11 | 301/302 拦截 | ✅ |

 ## 已知问题
 
 - EdgeOne 边缘函数使用 `replaceAll()` 做 HTML 改写，对大型 HTML 页面内存占用较高
 - 无 ICP 备案的 EdgeOne 用户只能走海外节点，延迟优势不明显
