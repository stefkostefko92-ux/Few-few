import type { MetadataRoute } from 'next';
import { LOCALES } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { isSensitiveUrl } from '@/lib/brands';
import { SITE_URL } from '@/lib/seo';

// Динамичен: включва публикуваните профили към момента на заявката.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL;
  // Една entry на страница, езиковите версии — като hreflang alternates.
  const languagesFor = (path: string) =>
    Object.fromEntries(
      LOCALES.map((locale) => [locale, `${base}/${locale}${path}`]),
    );
  const staticPages: MetadataRoute.Sitemap = ['', '/privacy', '/terms', '/cookies'].map(
    (path) => ({
      url: `${base}/en${path}`,
      lastModified: new Date(),
      changeFrequency: path === '' ? ('weekly' as const) : ('monthly' as const),
      alternates: { languages: languagesFor(path) },
    }),
  );

  const profiles = await prisma.profile
    .findMany({
      where: { published: true, bannedAt: null },
      select: {
        slug: true,
        updatedAt: true,
        translations: { select: { locale: true } },
        links: { where: { active: true }, select: { url: true } },
      },
      take: 5000,
    })
    .catch(() => []);

  return [
    ...staticPages,
    ...profiles
      // Профили с 18+ съдържание не влизат в sitemap (и са noindex).
      .filter((profile) => !profile.links.some((l) => isSensitiveUrl(l.url)))
      .map((profile) => ({
        url: `${base}/u/${profile.slug}`,
        lastModified: profile.updatedAt,
        alternates: {
          languages: Object.fromEntries(
            profile.translations.map((t) => [
              t.locale,
              `${base}/u/${profile.slug}?hl=${t.locale}`,
            ]),
          ),
        },
      })),
  ];
}
