/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Il magazzino gira anche su rete interna: nessuna immagine remota, tutto locale.
  images: { remotePatterns: [] },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            // Il gestionale non carica NULLA da fuori: nessun CDN, nessun font
            // remoto, nessuna analitica. La policy lo mette per iscritto, così
            // uno script iniettato non ha dove mandare i dati.
            //
            // `'unsafe-inline'` su script resta necessario per il frammento che
            // applica il tema prima della prima pittura (`src/app/layout.tsx`):
            // toglierlo richiede un nonce generato nel middleware e propagato a
            // ogni risposta. Rimane un debito dichiarato, non una svista — il
            // resto della policy (niente host esterni, niente frame, niente
            // <base>, invio moduli solo a noi stessi) vale comunque.
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self'",
              "media-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              'upgrade-insecure-requests',
            ].join('; '),
          },
          // La fotocamera serve allo scanner di codici a barre (solo stessa origine).
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=()',
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
