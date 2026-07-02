import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isPlatformHost } from "@/lib/domains";

export const dynamic = "force-dynamic";

const base =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://platform.carbonstealth.eu";

// Host-aware robots. На платформения хост крие панела/входа. На клиентски
// хост (публикуван сайт) разрешава всичко и сочи sitemap-а на СЪЩИЯ хост
// (иначе би сочил чужд sitemap, който Google отхвърля).
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host") || "";

  if (host && !isPlatformHost(host)) {
    const origin = `https://${host.split(":")[0]}`;
    return {
      rules: [{ userAgent: "*", allow: "/" }],
      sitemap: `${origin}/sitemap.xml`,
      host: origin,
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/site/", "/legal"],
        disallow: ["/dashboard", "/admin", "/login", "/register", "/forgot", "/reset", "/api"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
