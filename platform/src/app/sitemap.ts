import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const base =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://platform.carbonstealth.eu";

// Един общ sitemap за всички ПУБЛИКУВАНИ публични страници (path-based, един домейн).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let pages: {
    slug: string;
    updatedAt: Date;
    publishedAt: Date | null;
    site: { slug: string };
  }[] = [];
  try {
    pages = await prisma.page.findMany({
      where: { status: "PUBLISHED" },
      select: {
        slug: true,
        updatedAt: true,
        publishedAt: true,
        site: { select: { slug: true } },
      },
    });
  } catch {
    // При недостъпна база (напр. билд) връщаме празен sitemap.
    return [];
  }
  return pages.map((p) => ({
    url:
      p.slug === ""
        ? `${base}/site/${p.site.slug}`
        : `${base}/site/${p.site.slug}/${p.slug}`,
    lastModified: p.publishedAt ?? p.updatedAt,
    changeFrequency: "weekly" as const,
  }));
}
