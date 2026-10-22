import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Content-Security-Policy is set per request with a nonce in src/middleware.ts.
/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // native or Node-only packages stay outside the server bundle; acad-ts looks classes up by name, which the
  // minifier would rename (see src/lib/cad/acad.ts for the browser); pdfkit reads its font data files next to its own
  // code at run time (the survey sheet's PDF, src/server/rilievi/pdf.ts); the reading of the survey sketches (round 50,
  // src/server/schizzi/model.ts) loads the Anthropic SDKs and Google's auth library as they are, only when it is on
  serverExternalPackages: ['argon2', 'pino', '@node-projects/acad-ts', 'pdfkit', '@anthropic-ai/sdk', '@anthropic-ai/vertex-sdk', 'google-auth-library'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
