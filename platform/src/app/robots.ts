import type { MetadataRoute } from "next";

const base =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://platform.carbonstealth.eu";

// Публичните сайтове на конструктора (/site/*) са индексируеми; админ панелът,
// входът и API остават скрити от обхождачите (те и без това са зад auth).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/site/",
        disallow: ["/dashboard", "/admin", "/login", "/api"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
