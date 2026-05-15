# CF Worker + R2 — Webflow 中国大陆加速

无需 ICP 备案，免费，点按钮一键部署。利用 Cloudflare 香港/新加坡节点 + R2 持久缓存。

## 架构

```
大陆用户 → 自定义域名 → CF Worker（香港/新加坡）
  ├── 静态资源 → R2 缓存命中 → 直接返回
  ├── 静态资源未命中 → 回源 Webflow CDN → 异步写入 R2
  └── HTML/动态 → 回源 Webflow → HTMLRewriter 流式改写 → 返回
```

## 部署

### 方式 A：点按钮一键部署（推荐）

点击以下按钮，Cloudflare 会**自动创建 Worker + R2 Bucket + 绑定**，你在配置页只需填一个环境变量：

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/shenyeah/webflow-china-speedup/tree/main/packages/cf-worker)

点击按钮后：

1. Cloudflare Dashboard 打开 → 自动识别仓库并加载配置
2. 在配置页找到 **Environment Variables** → 填写 `WEBFLOW_HOST` = 你的 `xxx.webflow.io`（不带 `https://`）
3. 点击 **Deploy** → Worker + R2 Bucket 自动创建、绑定、部署
4. 部署完成后 → **Triggers** → **Custom Domains** → 添加你的域名

完成。

### 方式 B：Fork 后部署（稳定性更好）

建议 Fork 本仓库，然后编辑 `edgeflow.config.js` 替换为你自己的信息后部署：

```js
export default {
  webflowHost: "my-site.webflow.io",           // 你的 Webflow 项目地址
  r2PublicUrl: "REPLACE_WITH_YOUR_R2_PUBLIC_URL", // 部署后从 R2 Settings 获取
  r2BucketBinding: "MY_BUCKET",
  mirrors: {
    jquery: "https://cdn.jsdmirror.com/npm/jquery@3.5.1/dist/jquery.min.js"
  }
};
```

然后运行 `npm run build` 构建，再通过 wrangler CLI 部署：

```bash
cd packages/cf-worker
npm run build
npx wrangler deploy
```

### 方式 C：wrangler CLI（推荐开发者）

```bash
# 1. 编辑 edgeflow.config.js，填入你的 WEBFLOW_HOST

# 2. 构建（注入配置 + git 版本号）
cd packages/cf-worker
npm run build

# 3. 编辑 wrangler.toml，确认 account_id 等配置

# 4. 部署
npx wrangler deploy
```

## 验证

在国内网络环境访问你的域名：

- 网站能正常打开 ✅
- 字体正常加载（无 Google Fonts 超时）✅
- 无 Webflow Badge ✅
- DevTools Network 面板中无 `googleapis.com` 请求 ✅
- DevTools Network 面板中静态资源 URL 以 `/_cdn/` 开头 ✅

## 版本同步检查

```bash
cd packages/cf-worker
npm run sync:check https://your-domain.com
```

对比线上部署版本与本地 git commit，确保一致性。

### 快速排查

| 问题 | 解决方法 |
|------|---------|
| 502 错误 | `WEBFLOW_HOST` 是否填对了？不要带 `https://` |
| 页面无样式 | 只看到纯文字？刷新一次，可能是首次部署缓存未生效 |
| 字体超时 | 检查环境变量是否已保存部署 |
| 网站跳转到 webflow.io | Worker 未拦截 301 重定向，确认代码已部署最新版本 |

## 12 项自动优化

部署后自动生效：
Google Fonts 替换 → fonts.googleapis.cn、GA/GTM 移除、jQuery 镜像替代（jsdmirror）、视频分段加载（HTTP Range 206）、R2 永久缓存（含 query string 版本）、CSS 内部 `@font-face` URL 改写、SRI integrity 处理、Badge CSS + MutationObserver 双重移除、301/302 Location 头修正、图片懒加载注入。
