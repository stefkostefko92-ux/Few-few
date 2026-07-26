import type { NextConfig } from "next";

// Сигурностни хедъри за всички отговори — defense-in-depth.
//
// Content-Security-Policy НЕ е тук, а в `src/middleware.ts`: тя носи nonce,
// който се сменя на всяка заявка, а този списък е статичен. Разделението е
// нарочно и не бива да се „поправя" с втора CSP оттук — два хедъра се прилагат
// ЕДНОВРЕМЕННО и браузърът спазва по-строгото от двете, тоест страницата би се
// счупила по начин, който изглежда като бъг в приложението.
const securityHeaders = [
  // Наследен от frame-ancestors в CSP; остава за браузъри без CSP3.
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
