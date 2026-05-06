# EdgeOne Pages — Webflow 中国大陆加速

需要 ICP 备案。利用腾讯云 EdgeOne 国内 2800+ 节点，延迟 5-20ms。

## 架构

```
大陆用户 → 自定义域名 → EdgeOne 国内节点 → EdgeOne Pages 边缘函数
  ├── rewriteDomainTokens() → URL 域名替换
  ├── applyChinaSpeedRewrites() → Google Fonts/GA/jQuery/CDN 替换
  ├── stripWebflowBranding() → Badge/水印移除
  └── injectOptimizations() → lazy loading/dns-prefetch
  → Webflow 源站

海外用户 → EdgeOne Geo 检测 → 301 重定向 → Webflow 源站直连
```

## 部署（EdgeOne 控制台 Git 导入）

### 前置条件

- 腾讯云 EdgeOne 账号
- ICP 备案域名

### 第 1 步：创建 EdgeOne Pages 项目

1. 打开 [腾讯云 EdgeOne 控制台](https://console.cloud.tencent.com/edgeone)
2. 左侧菜单 → **Pages** → **新建项目**
3. 选择「从 Git 导入」，授权 GitHub
4. 仓库地址：`https://github.com/shenyeah/webflow-china-speedup`（会自动拉取）
5. Root directory 设置为 `packages/edgeone/`
6. **构建配置全部留空**，直接创建
6. 约 30 秒部署完成

### 第 2 步：设置环境变量

#### 必填

项目详情页 → **环境变量** → 添加：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `WEBFLOW_ORIGIN_HOST` | `my-site.webflow.io` | **必填**，你的 Webflow 项目地址，不带 `https://` |

#### 可选（CDN 镜像替换）

这些变量有默认值，一般不需要改。但如果某个 CDN 在国内失效，可以通过修改变量切换镜像：

| 变量名 | 默认值 | 什么时候需要改 |
|--------|--------|-------------|
| `MIRROR_JQUERY` | `https://lib.baomitu.com/jquery/3.5.1/jquery.min.js` | Webflow 默认 jQuery 走 CloudFront（被墙），这个变量指定替换后的镜像地址。如果 `lib.baomitu.com` 失效，改为 `https://cdn.jsdmirror.com/npm/jquery@3.5.1/dist/jquery.min.js` |
| `MIRROR_JSD_MIRROR` | `https://cdn.jsdmirror.com` | jsDelivr 的国内镜像。如果 jsdmirror 失效，改为 `https://unpkg.zhimg.com` 或 `https://cdn.flru.com` |
| `MIRROR_WEBFONT` | `https://cdn.jsdelivr.net/npm/webfontloader@1.6.26/webfontloader.js` | WebFont loader 的备用地址。一般不需要改，除非 jsDelivr 在国内完全不可用 |
| `ASSET_PROXY_PREFIX` | `/__eo_asset_v3__` | Webflow 静态资源的代理路径前缀。如果和项目其他路由冲突才需要改 |

**什么情况需要改这些变量？**

- 部署后打开页面，字体图标显示为方框（□）
  → 检查 Network 面板，看 `lib.baomitu.com` 或 `jsdmirror.com` 是否超时
  → 如果超时，在环境变量中替换为可用的镜像地址后点击**重新部署**

- 某个第三方 CDN（如 unpkg、cdnjs）的资源加载失败
  → 在 `proxy.js` 中找到对应替换规则，或通过 `MIRROR_JSD_MIRROR` 整体切换

修改后保存并**重新部署**即可生效，无需修改代码。

### 第 3 步：验证

访问 `https://你的项目.edgeone.app/__proxy/health`

看到以下 JSON 即成功：
```json
{"ok":true,"runtime":"edgeone-pages","origin":"my-site.webflow.io"}
```

### 第 4 步：绑定自定义域名

项目详情页 → **域名管理** → **添加域名**

输入你的已备案域名，EdgeOne 生成 CNAME 记录，到 DNS 服务商添加该记录。等待 SSL 证书自动签发（约 5-15 分钟）。

### 第 5 步：验证

- 网站能正常打开 ✅
- 字体正常加载（无 Google Fonts 超时）✅
- 无 Webflow Badge ✅
- 海外用户自动 301 到 Webflow 源站 ✅

## 实现细节

- [edge-functions/](edge-functions/): 生产运行时，核心代理逻辑
- [functions/](functions/): 同上，额外支持 CSS `@font-face` URL 重写
- [build.mjs](build.mjs): 将 edge-functions 构建到 `.edgeone/` 目录
- [proxy.js](edge-functions/_shared/proxy.js): 全部 HTML/CSS 改写逻辑（约 500 行）

## 11 项自动优化

| # | 优化项 |
|---|--------|
| 1 | Google Fonts → fonts.googleapis.cn |
| 2 | Google Analytics / GTM 完全移除 |
| 3 | Webflow CDN 资源走国内节点代理 |
| 4 | jQuery → lib.baomitu.com 国内镜像 |
| 5 | jsDelivr / cdnjs → cdn.jsdmirror.com |
| 6 | GSAP 走资产代理国内节点 |
| 7 | Webflow 水印移除 |
| 8 | 图片自动 lazy loading + async decoding |
| 9 | CSS @font-face url() 重写 |
| 10 | 自动生成 robots.txt / sitemap.xml |
| 11 | 海外用户自动 301 到源站直连 |
