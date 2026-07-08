import type { MetadataRoute } from 'next';
import { LOCALES } from '@/i18n/locales';
import { prisma } from '@/lib/db';

// Динамичен: включва публикуваните профили към момента на заявката.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const staticPages: MetadataRoute.Sitemap = LOCALES.flatMap((locale) => [
    { url: `${base}/${locale}`, changeFrequency: 'weekly' as const },
    { url: `${base}/${locale}/privacy` },
    { url: `${base}/${locale}/terms` },
  ]);

  const profiles = await prisma.profile
    .findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true },
      take: 5000,
    })
    .catch(() => []);

  return [
    ...staticPages,
    ...profiles.map((profile) => ({
      url: `${base}/u/${profile.slug}`,
      lastModified: profile.updatedAt,
    })),
  ];
}
