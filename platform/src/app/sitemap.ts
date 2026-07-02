import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isPlatformHost } from "@/lib/domains";
import { siteByHost } from "@/lib/site-by-host";
import { LEGAL_DOCS } from "@/lib/legal";

export const dynamic = "force-dynamic";

const base =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://platform.carbonstealth.eu";

// Host-aware sitemap.
//  • Клиентски хост → само страниците на ТОЗИ сайт, с host-относителни адреси.
//  • Платформен хост → маркетинг (/), правните страници и /site/<slug> само за
//    сайтове БЕЗ собствен хост (тези с хост са канонични на своя домейн).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get("host") || "";

  try {
    if (host && !isPlatformHost(host)) {
      const site = await siteByHost(host);
      if (!site) return [];
      const origin = `https://${host.split(":")[0]}`;
      const pages = await prisma.page.findMany({
        where: { siteId: site.id, status: "PUBLISHED" },
        select: { slug: true, updatedAt: true, publishedAt: true },
      });
      return pages.map((p) => ({
        url: p.slug === "" ? `${origin}/` : `${origin}/${p.slug}`,
        lastModified: p.publishedAt ?? p.updatedAt,
        changeFrequency: "weekly" as const,
      }));
    }

    // Платформен хост.
    const staticEntries: MetadataRoute.Sitemap = [
      { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
      { url: `${base}/legal`, changeFrequency: "yearly" },
      ...LEGAL_DOCS.map((d) => ({
        url: `${base}/legal/${d.slug}`,
        changeFrequency: "yearly" as const,
      })),
    ];

    // Само сайтове без собствен хост (иначе дублират каноничния адрес на домейна).
    const pages = await prisma.page.findMany({
      where: {
        status: "PUBLISHED",
        site: { published: true, subdomain: null, customDomain: null },
      },
      select: {
        slug: true,
        updatedAt: true,
        publishedAt: true,
        site: { select: { slug: true } },
      },
    });
    return [
      ...staticEntries,
      ...pages.map((p) => ({
        url:
          p.slug === ""
            ? `${base}/site/${p.site.slug}`
            : `${base}/site/${p.site.slug}/${p.slug}`,
        lastModified: p.publishedAt ?? p.updatedAt,
        changeFrequency: "weekly" as const,
      })),
    ];
  } catch {
    // При недостъпна база (напр. билд) връщаме празен sitemap.
    return [];
  }
}
