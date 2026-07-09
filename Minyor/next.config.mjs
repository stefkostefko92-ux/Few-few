import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Проектът е в подпапка с втори lockfile — фиксираме коренната директория.
  outputFileTracingRoot: __dirname,
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  // Позволява качване на снимки до 8 MB чрез server actions (галерия).
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    // Content-Security-Policy: ограничава откъде се зареждат ресурси.
    // 'unsafe-inline' за скриптове/стилове е нужен, защото Next и малкият ни
    // скрипт за достъпност/JSON-LD ползват вградени тагове; въпреки това
    // object-src/base-uri/frame-ancestors/form-action са строго затворени.
    // img-src включва https:/data:, защото снимки (състав, галерия) може да
    // сочат към външни адреси.
    // В режим на разработка Next ползва eval за hot-reload, затова там добавяме
    // 'unsafe-eval'. В продукция CSP остава строг (без eval).
    // Разрешени външни услуги: анонимна статистика (Plausible, по избор).
    const analytics = "https://plausible.io";

    const scriptSrc =
      process.env.NODE_ENV === "production"
        ? `script-src 'self' 'unsafe-inline' ${analytics}`
        : `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${analytics}`;

    const csp = [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "media-src 'self' blob: data:",
      "font-src 'self' data:",
      `connect-src 'self' ${analytics}`,
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
      // Вградена карта от OpenStreetMap за страницата на стадиона.
      "frame-src 'self' https://www.openstreetmap.org",
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
