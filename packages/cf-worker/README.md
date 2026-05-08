# CF Worker + R2 — Webflow 中国大陆加速

无需 ICP 备案，免费，全程浏览器操作。利用 Cloudflare 香港/新加坡节点 + R2 持久缓存。

## 架构

```
大陆用户 → 自定义域名 → CF Worker（香港/新加坡）
  ├── 静态资源 → R2 缓存命中 → 直接返回
  ├── 静态资源未命中 → 回源 Webflow CDN → 异步写入 R2
  └── HTML/动态 → 回源 Webflow → HTMLRewriter 流式改写 → 返回
```

## 部署（两种方式）

### 方式 A：Dashboard 粘贴（不需要命令行）

#### 前置条件

- Cloudflare 账号
- 域名托管在 Cloudflare（或 NS 指向 Cloudflare）

#### 第 1 步：创建 Worker

点击以下按钮，Cloudflare 会自动创建 Worker 项目：

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/shenyeah/webflow-china-speedup)

> 按钮跳转后会在 CF Dashboard 中创建 Worker 项目。接下来的步骤都在 Dashboard 中完成。

#### 第 2 步：创建 R2 Bucket

Cloudflare Dashboard → **R2** → **Create Bucket**

- Bucket 名称：`webflow-assets`（或任意名称，记下来备用）
- 其他保持默认
- Bucket 创建后 → **Settings** → 开启 **Public Access**，记下公开访问 URL（格式 `https://pub-xxx.r2.dev`）

#### 第 3 步：将 Worker 代码粘贴到 Dashboard

Cloudflare Dashboard → **Workers & Pages** → 找到刚创建的 Worker

1. 点击 Worker 名称，进入详情页
2. 点击 **Quick Edit**（或 View Code）
3. 复制以下文件内容粘贴到 Dashboard（二选一）：
   - **推荐**：先运行 `npm run build`，复制 `dist/worker.js`（内置配置，无需再填环境变量）
   - **快速**：直接复制 `worker.js`（需要第 4 步设环境变量）
4. 点击 **Save and Deploy**

#### 第 4 步：设置环境变量（仅直接粘贴 worker.js 时需要）

Worker 详情页 → **Settings** → **Variables**（变量）：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `WEBFLOW_HOST` | `my-site.webflow.io` | 你的 Webflow 项目地址 |
| `R2_PUBLIC_BASE` | `https://pub-xxx.r2.dev` | 第 2 步记下的 R2 公开 URL |

添加后保存。

#### 第 5 步：绑定 R2 Bucket

Worker 详情页 → **Settings** → **Variables** → **R2 Bucket Bindings** → **Add Binding**

- **Variable name**：`MY_BUCKET`
- **Bucket**：选择第 2 步创建的 `webflow-assets`

#### 第 6 步：绑定自定义域名

Worker 详情页 → **Triggers** → **Custom Domains** → **Add Custom Domain**

输入你的域名（如 `www.example.com`），Cloudflare 会自动在 DNS 中添加记录。

> 如果域名不在 Cloudflare 托管，需要在你的 DNS 服务商处 CNAME 到 Worker 域名。

#### 第 7 步：验证

在国内网络环境访问你的域名：

- 网站能正常打开 ✅
- 字体正常加载（无 Google Fonts 超时）✅
- 无 Webflow Badge ✅
- DevTools Network 面板中无 `googleapis.com` 请求 ✅
- DevTools Network 面板中静态资源 URL 以 `/_cdn/` 开头 ✅

### 方式 B：wrangler CLI（推荐开发者使用）

```bash
# 1. 编辑根目录配置
#    打开 edgeflow.config.js，填入你的 WEBFLOW_HOST 和 R2_PUBLIC_URL

# 2. 构建（注入配置 + git 版本号）
cd packages/cf-worker
npm run build

# 3. 编辑 wrangler.toml（项目根目录）
#    填写 account_id、开通 [vars] 和 [[r2_buckets]] 的注释

# 4. 部署
npx wrangler deploy
```

### 快速排查

| 问题 | 解决方法 |
|------|---------|
| 502 错误 | `WEBFLOW_HOST` 是否填对了？不要带 `https://` |
| 页面无样式 | 只看到纯文字？刷新一次，可能是首次部署缓存未生效 |
| 字体超时 | 检查 Worker 代码是否已保存部署 |
| 网站跳转到 webflow.io | Worker 未拦截 301 重定向，确认代码已部署最新版本 |

## 12 项自动优化

部署后自动生效：
Google Fonts 替换 → fonts.googleapis.cn、GA/GTM 移除、jQuery 镜像替代（jsdmirror）、视频分段加载（HTTP Range 206）、R2 永久缓存（含 query string 版本）、CSS 内部 `@font-face` URL 改写、SRI integrity 处理、Badge CSS + MutationObserver 双重移除、301/302 Location 头修正、图片懒加载注入。
