import type { NextConfig } from "next";

/**
 * 全站基线安全响应头。
 *
 * 这五个头都是"零配置就能打开、不会破页面"的硬护栏：
 * - HSTS                 浏览器强制 HTTPS，防协议降级（仅生效于 HTTPS 响应）
 * - X-Frame-Options      防 clickjacking（拒绝任何 iframe 嵌入）
 * - X-Content-Type-Options  防 MIME 嗅探，强制按服务端声明的 Content-Type 解析
 * - Referrer-Policy      跨域跳转时不泄露完整 URL（带参数）
 * - Permissions-Policy   默认禁用相机/麦克风/地理位置/FLoC 等敏感能力
 *
 * 未启用 Content-Security-Policy：Next.js 16 + Tailwind v4 + react-markdown 的内联
 * 样式/脚本需要 nonce 方案才能稳妥，否则会破 hydration。CSP 留作后续单独评估。
 */
const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
