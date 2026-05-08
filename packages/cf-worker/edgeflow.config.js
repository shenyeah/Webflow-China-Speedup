export default {
  // 你的 Webflow 项目地址（如 my-site.webflow.io）
  webflowHost: "REPLACE_WITH_YOUR_WEBFLOW_HOST",

  // R2 Bucket 公开访问 URL（Dashboard → R2 → Bucket → Settings → Public Access）
  // 如 https://pub-xxxx.r2.dev
  r2PublicUrl: "REPLACE_WITH_YOUR_R2_PUBLIC_URL",

  // R2 Bucket 绑定名称（wrangler.toml 中的 binding）
  r2BucketBinding: "MY_BUCKET",

  // CDN 镜像配置（可选，默认值适用于中国大陆）
  mirrors: {
    jquery: "https://cdn.jsdmirror.com/npm/jquery@3.5.1/dist/jquery.min.js"
  }
};
