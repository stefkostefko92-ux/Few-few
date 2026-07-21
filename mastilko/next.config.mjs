// Умишлено .mjs, не .ts: next.config.ts изисква пакета typescript ПРИ СТАРТ,
// а деплоят прунва dev зависимостите (npm prune --omit=dev) → сървисът гърми.

// Произходът на Визитка — /import прави КЛИЕНТСКИ fetch натам и рендира снимката
// (photo_url) като <img>. CSP-то трябва да го разреши, иначе браузърът блокира
// внасянето. Държим го в синхрон с src/lib/vizitka-import.ts (същият env + fallback).
const VIZITKA_ORIGIN = (
  process.env.NEXT_PUBLIC_VIZITKA_URL || "https://vizitka-bg.com"
).replace(/\/+$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            // Принуди браузъра винаги да ползва HTTPS за домейна (2 г.). Праща
            // се само по HTTPS; локалният http dev го игнорира — без ефект там.
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            // Втора линия срещу XSS: нищо външно (шрифтовете са self-hosted
            // през next/font). 'unsafe-inline' за script е нужен на Next
            // hydration + inline JSON-LD; всичко останало е заключено.
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
              `style-src 'self' 'unsafe-inline'; img-src 'self' data: ${VIZITKA_ORIGIN}; ` +
              `font-src 'self'; connect-src 'self' ${VIZITKA_ORIGIN}; object-src 'none'; ` +
              "frame-ancestors 'none'; base-uri 'none'; form-action 'self'; " +
              "upgrade-insecure-requests",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
