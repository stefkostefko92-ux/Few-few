import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Slim продукционен образ: standalone носи минимален сървър + само нужните
  // node_modules (виж Dockerfile). Стартира се с `node server.js`.
  output: "standalone",
  // Проектът е в подпапка с втори lockfile — фиксираме коренната директория.
  outputFileTracingRoot: __dirname,
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  async headers() {
    // CSP за вътрешен панел. Next.js (App Router) инжектира вградени скриптове
    // за хидратация/RSC поток, затова script-src изисква 'unsafe-inline' (както
    // в zabobovdol). В разработка Next ползва и eval за hot-reload.
    const scriptSrc =
      process.env.NODE_ENV === "production"
        ? "script-src 'self' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

    // Публичните сайтове на конструктора ползват външни снимки и вграждат
    // видео (YouTube/Vimeo) и карти (OpenStreetMap) — затова img-src разрешава
    // https: и frame-src изброява доверените embed хостове. Панелът остава строг
    // (frame-ancestors 'none' пази нас от вграждане в чужд сайт).
    const csp = [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com https://www.openstreetmap.org",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
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
