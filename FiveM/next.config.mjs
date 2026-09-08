/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    // Без `sharp` в зависимостите оптимизаторът на Next пада в продукция.
    // Логото е един статичен PNG — не си струва зависимостта.
    unoptimized: true,
    // Иконите на сървърите идват от Cfx.re; само този хост, нищо друго.
    remotePatterns: [{ protocol: 'https', hostname: 'frontend.cfx-services.net' }],
  },
  async headers() {
    // ── CSP: защита в дълбочина, не заместител на екранирането ────────────
    // Без nonce: Next инжектира inline скриптове/стилове и nonce-схемата иска
    // middleware на всяка заявка + риск да счупи страница, която не сме
    // гледали. `'unsafe-inline'` за script/style значи, че CSP НЕ спира XSS
    // сам по себе си — това го прави екранирането (`jsonLdString`, React
    // текстови възли). Стойността на политиката е другаде и е реална:
    //  · `connect-src 'self'` — инжектиран код не може да ИЗНЕСЕ нищо през
    //    fetch/XHR/beacon към чужд хост (лошата половина на XSS е exfil-ът);
    //  · `img-src` само наш + иконите на Cfx.re — няма exfil през пиксел;
    //  · `script-src 'self'` — не се зарежда чужд `<script src>`;
    //  · `object-src 'none'`, `base-uri 'self'` (без `<base>` отвличане),
    //    `form-action 'self'` (формите не се пренасочват навън),
    //    `frame-ancestors 'none'` (същото като X-Frame-Options, но модерно).
    // БЕЗ `upgrade-insecure-requests`: на http://127.0.0.1 (smoke, dev) той
    // пренаписва всеки под-ресурс към https и страницата остава без CSS.
    // Пренасочването http→https го прави nginx/certbot. Само в production:
    // `next dev` ползва eval за HMR и websocket за презареждане.
    // Проверено: 40 адреса в Chromium, нула нарушения (виж scripts/csp-sweep).
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://frontend.cfx-services.net",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          // HSTS: сайтът е само https (certbot пренасочва 80→443), а сесийната
          // бисквитка на панела е `__Host-…; Secure`. Без HSTS първата заявка
          // на посетител по http е MITM прозорец. Две години, без `preload`
          // (той е необратим за седмици и е решение на собственика).
          // По http браузърът игнорира хедъра — безвреден на 127.0.0.1.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Content-Security-Policy', value: csp }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
