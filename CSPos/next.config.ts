import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone билд → самостоятелен Node сървър за десктоп опаковката (Electron .exe).
  output: "standalone",
  // Фискалните драйвери ползват net/сериен порт — само на сървъра.
  serverExternalPackages: ["serialport"],
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
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
