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
        ],
      },
    ];
  },
};

export default nextConfig;
