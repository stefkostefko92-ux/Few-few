import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Проектът е в подпапка на моно-репо — фиксираме коренната директория, за да
  // не се обърква output file tracing-ът с други lockfile-ове.
  outputFileTracingRoot: __dirname,
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  async headers() {
    // Строг Content-Security-Policy. Сайтът е изцяло статичен каталог: няма
    // потребителски вход, няма външни услуги, няма качване на файлове. Затова
    // затваряме всичко освен собствения ориджин. 'unsafe-inline' за скриптове е
    // нужен само заради вградените bootstrap/hydration тагове на Next и инлайн
    // JSON-LD; истинско втвърдяване с per-request nonce е отложено съзнателно.
    const scriptSrc =
      process.env.NODE_ENV === "production"
        ? "script-src 'self' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

    const csp = [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
