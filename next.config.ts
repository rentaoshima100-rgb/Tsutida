import type { NextConfig } from "next";

// 画面はほぼすべてログイン中の利用者ごとに変わるため、Cache Components は使わず、
// リクエストごとに描く従来の方式にする（保守の手間を小さくするため）
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // PDF の日本語フォントを関数に含める（13章）
  outputFileTracingIncludes: {
    "/admin/**/*": ["./assets/fonts/**/*"],
    "/api/**/*": ["./assets/fonts/**/*"],
    "/mypage/**/*": ["./assets/fonts/**/*"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
