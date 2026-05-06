# VPS 反向代理方案

备选路线。适合手头已有国内服务器（腾讯云/阿里云轻量，¥68-99/年）的场景。

## 与其他两条路线的比较

| | VPS 反代 | CF Worker + R2 | EdgeOne Pages |
|---|---|---|---|
| 国内延迟 | 20-50ms | 50-150ms | 5-20ms |
| ICP 备案 | 需要 | 不需要 | 需要 |
| 费用 | ¥68-99/年 | 免费 | 免费起步 |
| 可靠性 | 单机瓶颈 | 边缘网络 | 边缘网络 |
| 推荐度 | 仅在已有服务器时考虑 | 无备案首选 | 有备案首选 |

**大多数用户不需要这条路线。** CF Worker 和 EdgeOne 在各自的场景下都是更好的选择。

## Caddy 快速配置

```caddy
# /etc/caddy/Caddyfile
www.example.cn {
    reverse_proxy https://xxx.webflow.io {
        header_up Host xxx.webflow.io
    }

    replace {
        s fonts.googleapis.com fonts.googleapis.cn
        s fonts.gstatic.com fonts.gstatic.cn
        s www.googletagmanager.com ""
    }

    header X-Forwarded-Host www.example.cn
}
```

## Nginx 快速配置

```nginx
server {
    listen 443 ssl http2;
    server_name www.example.cn;

    location / {
        proxy_pass https://xxx.webflow.io;
        proxy_set_header Host xxx.webflow.io;
        proxy_set_header X-Forwarded-For $remote_addr;

        sub_filter 'fonts.googleapis.com' 'fonts.googleapis.cn';
        sub_filter 'fonts.gstatic.com' 'fonts.gstatic.cn';
        sub_filter 'www.googletagmanager.com' '';
        sub_filter_once off;
        sub_filter_types text/html text/css;
    }
}
```

3 行 Caddy 或 10 行 Nginx 即可工作，但缺少 12 项优化的多数功能（无 R2 缓存、无 HTMLRewriter 流式改写、无视频 Range 支持）。只做基础反代 + Google 资源替换。
