# webflow-china-speed

> **Webflow 网站在中国大陆打不开？这个 Skill 帮你解决。**

[![license](https://img.shields.io/github/license/Webflowcn/webflow-china-speed)](LICENSE)
[![skills.sh](https://img.shields.io/badge/skills.sh-compatible-blue)](https://skills.sh)

---

## 🚨 解决什么问题

2025 年 11 月起，Webflow 所有自定义域名在大陆被 GFW 封控 —— **你的网站在国内完全打不开**。

这不是"慢"的问题，是**根本无法访问**。本 Skill 提供一套经过验证的 Cloudflare Worker 方案，让网站恢复访问并高速加载。

---

## ⚡ 30 秒上手

**不需要任何技术基础。** 把本仓库的 `SKILL.md` 文件内容复制，粘贴给你的 AI Agent，它会一步步指导你完成。

```
告诉你的 AI：

"我有一个 Webflow 网站在中国大陆打不开，
 帮我用 Cloudflare Worker 解决。"

AI 会自动读取 Skill 文档，引导你完成全部配置。
```

支持的 AI 工具：Claude Code · Cursor · Copilot · Windsurf · 任何能读文件的 Agent

---

## 📦 包含什么

| 文件 | 作用 |
|------|------|
| `SKILL.md` | AI Agent 指令文档（**核心文件**，给 AI 读的） |
| `references/worker-template.js` | 可直接部署的 Worker 代码模板 |
| `wrangler.toml.example` | Cloudflare 部署配置示例 |

---

## 🔧 覆盖的优化

| 问题 | 影响 |
|------|------|
| GFW 封控 | 自定义域名完全不可访问 |
| Google 资源 | Fonts / preconnect 阻塞 2-5 秒 |
| jQuery CDN | CloudFront 无大陆节点，阻塞渲染 |
| 静态资源 | 每次访问重新下载，极慢 |
| 视频加载 | 不支持分段，无法即时起播 |
| Webflow Badge | 右下角水印影响品牌感 |
| CMS 图片 | 动态内容走海外 CDN |
| 多语言路由 | 301 跳转暴露 webflow.io 域名 |

**共 12 项优化，一次部署全部生效。**

---

## 🛤️ 三条路线

```
有 ICP 备案域名？
├── 否 → CF Worker + R2（免费，无需备案）
├── 是 + 低流量 → VPS 反代（¥68/年）
└── 是 + 高并发 → EdgeOne 边缘函数（按量计费）
```

大多数用户选第一条就够了。

---

## 📖 详细文档

完整的技术方案、决策树、诊断清单 → 看 [`SKILL.md`](SKILL.md)

---

## 许可证

MIT — 自由使用、修改、分发。
