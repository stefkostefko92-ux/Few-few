import type { NextConfig } from "next";

// Сигурностни хедъри за всички отговори — defense-in-depth.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // pdfkit чете метриките на стандартните шрифтове (.afm) от диска по време на
  // работа. Бъндълерът не проследява тези файлове и генерирането гърми с ENOENT
  // — но чак в билднатия сървър, не в dev. Оставяме пакета външен.
  serverExternalPackages: ["pdfkit"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
