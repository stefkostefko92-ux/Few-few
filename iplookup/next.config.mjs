// Умишлено .mjs, не .ts: `next.config.ts` изисква пакета typescript ПРИ СТАРТ,
// а деплоят прунва dev зависимостите (`npm prune --omit=dev`) → сървисът гърми.

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
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            // Нищо външно: няма шрифтове от CDN, няма плочки за карта, няма
            // аналитика. `'unsafe-inline'` за скриптове е нужен на хидратацията
            // на Next и на вградения JSON-LD; всичко останало е заключено.
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
              "style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
              "font-src 'self'; connect-src 'self'; object-src 'none'; " +
              "frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
          },
        ],
      },
      {
        // Страниците с резултат не се индексират — те съдържат данни за ТРЕТИ
        // лица и индексирането би ги превърнало в търсим указател. Заглавието
        // дублира `robots` метаданните, за да важи и когато страницата се
        // дърпа не като HTML.
        source: "/ip/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
