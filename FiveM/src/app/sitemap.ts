import type { MetadataRoute } from 'next';

import { prisma } from '@/lib/db';
import { absoluteUrl } from '@/lib/seo';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'hourly', priority: 1 },
    { url: absoluteUrl('/servers/whitelist'), changeFrequency: 'daily', priority: 0.8 },
    ...['esx', 'qbcore', 'qbox', 'ox_core'].map((framework) => ({
      url: absoluteUrl(`/servers/framework/${framework}`),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    { url: absoluteUrl('/news'), changeFrequency: 'daily', priority: 0.7 },
    { url: absoluteUrl('/submit'), changeFrequency: 'monthly', priority: 0.5 },
    { url: absoluteUrl('/impresum'), changeFrequency: 'yearly', priority: 0.3 },
    { url: absoluteUrl('/privacy'), changeFrequency: 'yearly', priority: 0.2 },
    { url: absoluteUrl('/terms'), changeFrequency: 'yearly', priority: 0.2 },
  ];

  try {
    const [servers, posts] = await Promise.all([
      prisma.server.findMany({
        where: { status: 'APPROVED' },
        select: { slug: true, updatedAt: true },
      }),
      prisma.post.findMany({
        where: { publishedAt: { not: null, lte: new Date() } },
        select: { slug: true, updatedAt: true },
      }),
    ]);

    return [
      ...staticEntries,
      ...servers.map((server) => ({
        url: absoluteUrl(`/servers/${server.slug}`),
        lastModified: server.updatedAt,
        changeFrequency: 'daily' as const,
        priority: 0.8,
      })),
      ...posts.map((post) => ({
        url: absoluteUrl(`/news/${post.slug}`),
        lastModified: post.updatedAt,
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      })),
    ];
  } catch (error) {
    // Без база пак връщаме валиден sitemap — по-добре непълен, отколкото 500.
    // Логваме: иначе срутването до 5 URL-а се кешира за час, без никаква следа.
    console.error('[sitemap] динамичните адреси не се прочетоха', error);
    return staticEntries;
  }
}
