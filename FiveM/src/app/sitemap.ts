import type { MetadataRoute } from 'next';

import { LOCALES } from '@/i18n/config';
import { prisma } from '@/lib/db';
import { localeUrl } from '@/lib/seo';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  /** Пътища без езиков префикс — умножават се по езиците. */
  const paths: Array<{ path: string; changeFrequency: 'hourly' | 'daily' | 'monthly' | 'yearly'; priority: number }> = [
    { path: '/', changeFrequency: 'hourly', priority: 1 },
    { path: '/servers/whitelist', changeFrequency: 'daily', priority: 0.8 },
    { path: '/servers/framework/esx', changeFrequency: 'daily', priority: 0.8 },
    { path: '/servers/framework/qbcore', changeFrequency: 'daily', priority: 0.8 },
    { path: '/servers/framework/qbox', changeFrequency: 'daily', priority: 0.8 },
    { path: '/servers/framework/ox_core', changeFrequency: 'daily', priority: 0.8 },
    { path: '/rules', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/tutorials', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/faq', changeFrequency: 'monthly', priority: 0.8 },
    { path: '/news', changeFrequency: 'daily', priority: 0.7 },
    { path: '/team', changeFrequency: 'yearly', priority: 0.4 },
    { path: '/contact', changeFrequency: 'yearly', priority: 0.4 },
    { path: '/support', changeFrequency: 'yearly', priority: 0.4 },
    { path: '/submit', changeFrequency: 'monthly', priority: 0.5 },
    { path: '/impresum', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/privacy', changeFrequency: 'yearly', priority: 0.2 },
    { path: '/terms', changeFrequency: 'yearly', priority: 0.2 },
  ];

  /** Всеки адрес носи езиковите си близнаци — иначе двата езика се конкурират. */
  const alternates = (path: string) => ({
    languages: Object.fromEntries(LOCALES.map((locale) => [locale, localeUrl(locale, path)])),
  });

  const staticEntries: MetadataRoute.Sitemap = LOCALES.flatMap((locale) =>
    paths.map((entry) => ({
      url: localeUrl(locale, entry.path),
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
      alternates: alternates(entry.path),
    })),
  );

  try {
    const [servers, posts] = await Promise.all([
      prisma.server.findMany({
        where: { status: 'APPROVED' },
        select: { slug: true, updatedAt: true },
      }),
      prisma.post.findMany({
        where: { publishedAt: { not: null, lte: new Date() } },
        select: { slug: true, updatedAt: true, locale: true },
      }),
    ]);

    return [
      ...staticEntries,
      ...LOCALES.flatMap((locale) => [
        ...servers.map((server) => ({
          url: localeUrl(locale, `/servers/${server.slug}`),
          lastModified: server.updatedAt,
          changeFrequency: 'daily' as const,
          priority: 0.8,
          alternates: alternates(`/servers/${server.slug}`),
        })),
        // Постът излиза САМО за своя език: без това sitemap-ът обявяваше един и
        // същ български текст като отделна английска версия.
        ...posts
          .filter((post) => post.locale === locale)
          .map((post) => ({
            url: localeUrl(locale, `/news/${post.slug}`),
            lastModified: post.updatedAt,
            changeFrequency: 'monthly' as const,
            priority: 0.6,
          })),
      ]),
    ];
  } catch (error) {
    // Без база пак връщаме валиден sitemap — по-добре непълен, отколкото 500.
    // Логваме: иначе срутването до 5 URL-а се кешира за час, без никаква следа.
    console.error('[sitemap] динамичните адреси не се прочетоха', error);
    return staticEntries;
  }
}
