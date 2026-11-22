import type { MetadataRoute } from 'next';
import { DIALECT_LOCALES, HREFLANG_LOCALES } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { isSensitiveUrl } from '@/lib/brands';
import { SITE_URL } from '@/lib/seo';
import { COMPARISONS_CHECKED_AT, COMPETITOR_IDS } from '@/lib/comparisons';

// Последна съществена промяна на статичните страници (а не „сега“ — Google пренебрегва
// lastModified, който се мени при всяка заявка). Вдигай при промяна на съдържанието.
const STATIC_UPDATED_AT = new Date('2026-11-22');

// Динамичен: включва публикуваните профили към момента на заявката.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL;
  // Една entry на страница, езиковите версии — като hreflang alternates.
  const languagesFor = (path: string) => ({
    ...Object.fromEntries(
      HREFLANG_LOCALES.map((locale) => [locale, `${base}/${locale}${path}`]),
    ),
    'x-default': `${base}/en${path}`,
  });
  const staticPages: MetadataRoute.Sitemap = [
    '',
    '/tools',
    '/tools/qr',
    '/tools/bio',
    ...COMPETITOR_IDS.map((id) => `/vs/${id}`),
    '/privacy',
    '/terms',
    '/cookies',
  ].map(
    (path) => ({
      url: `${base}/en${path}`,
      lastModified: path.startsWith('/vs/') ? new Date(COMPARISONS_CHECKED_AT) : STATIC_UPDATED_AT,
      changeFrequency:
        path === '' || path.startsWith('/vs/')
          ? ('weekly' as const)
          : ('monthly' as const),
      alternates: { languages: languagesFor(path) },
    }),
  );

  const profiles = await prisma.profile
    .findMany({
      // Без езикова версия профилът връща 404 — не влиза в sitemap.
      where: { published: true, bannedAt: null, translations: { some: {} } },
      select: {
        slug: true,
        updatedAt: true,
        translations: { select: { locale: true } },
        links: { where: { active: true }, select: { url: true } },
      },
      orderBy: { updatedAt: 'desc' },
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
          languages: {
            ...Object.fromEntries(
              profile.translations
                // Диалектите не са валидни hreflang кодове — извън набора.
                .filter((t) => !DIALECT_LOCALES.includes(t.locale))
                .map((t) => [
                  t.locale,
                  `${base}/u/${profile.slug}?hl=${t.locale}`,
                ]),
            ),
            'x-default': `${base}/u/${profile.slug}`,
          },
        },
      })),
  ];
}
