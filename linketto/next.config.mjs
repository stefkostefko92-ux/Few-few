import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    globalNotFound: true,
    // Качването на снимки (media.ts ≤ 8 MB) минава през server action;
    // Next по подразбиране реже тялото на 1 MB (413) — одит H3.
    serverActions: { bodySizeLimit: '9mb' },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Син екип: HSTS за година (без preload — то обхваща всички поддомейни
          // на carbonstealth.eu и се маха месеци; решение на собственика).
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          {
            // fullscreen/autoplay/encrypted-media/picture-in-picture остават за
            // вграденото видео, translator — за превода в браузъра.
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), midi=(), browsing-topics=()',
          },
        ],
      },
      // Картинките, които създателите вграждат другаде (качените снимки, QR,
      // OG, логото) — CORP cross-origin (последното правило за ключа печели).
      ...['/media/:file', '/u/:slug/qr', '/u/:slug/og', '/og.png', '/logo.png', '/icon.png', '/apple-icon.png'].map(
        (source) => ({ source, headers: [{ key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' }] }),
      ),
      {
        // Живият преглед в таблото се вгражда в iframe от същия сайт (последното
        // правило за същия ключ печели). Само за собственика — виж страницата.
        source: '/u/:slug/preview',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
