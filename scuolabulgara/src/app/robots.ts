import type { MetadataRoute } from "next";

// Built per request, not at build time: SITE_URL (the domain) comes from the server .env.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.SITE_URL || "https://www.scuolabulgaramilano.it";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
