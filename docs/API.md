 # API

 本项目的代理对外暴露的是标准 HTTP API，无需额外接口文档。

 ## 代理接口

 ### `GET /` — 代理 Webflow 主页
 代理 `{WEBFLOW_HOST}.webflow.io/` 并改写 HTML。

 ### `GET /{path}` — 代理任意页面/资源
 代理 `{WEBFLOW_HOST}.webflow.io/{path}`，根据 `Content-Type` 决定是否改写：
 - `text/html` → HTML 改写（URL 替换 + Google 资源清理 + jQuery 镜像）
 - `text/css` → CSS 内部 URL 改写 + `@import` 过滤
 - `image/*`, `font/*`, `video/*` → 透传，缓存
 - `application/javascript` → 透传，缓存

 ### `GET /robots.txt` — 自定义 robots.txt
 返回包含 `Crawl-delay: 10` 的 robots.txt，降低爬虫频率。

 ### `GET /_cdn/{webflow-path}` — 直接 CDN 资源（CF Worker 专用）
 绕过 HTML 改写，直接代理 Webflow CDN 静态资源并缓存至 R2。

 ## 环境变量

 See [AGENTS.md](/AGENTS.md#环境变量) 或各包的 README。

 ## 响应头

 EdgeOne 部署时会注入自定义响应头：
 - `X-EdgeOne-Proxy: webflow-china-speedup-edgeone-v2`
 - `X-Proxy-Version: webflow-china-speedup/2.0`
