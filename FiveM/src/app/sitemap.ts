import type { MetadataRoute } from 'next';

import { LOCALES } from '@/i18n/config';
import { prisma } from '@/lib/db';
import { alternateLanguages, localeUrl } from '@/lib/seo';
import { serverIndexDecisions } from '@/lib/server-registry';
import { listingCounts } from '@/lib/servers';

/**
 * Динамичен, не ISR. С `revalidate = 3600` `next build` го рендираше
 * статично БЕЗ база (в билда я няма) — тоест първия час след всеки деплой
 * sitemap-ът беше само статичните адреси, а `autodeploy` подава точно него на
 * IndexNow веднага след здравната проба.
 *
 * Какво влиза — и какво НЕ:
 *  - само КАНОНИЧНИТЕ страници на сървъри, които минават `indexDecision`
 *    (`src/lib/server-identity.ts`): псевдонимите пренасочват, а празните
 *    записи са `noindex, follow`. Дотук влизаха всички 1038 одобрени × 2 езика
 *    — включително един сървър под до 12 адреса;
 *  - `lastmod` е `contentUpdatedAt` — кога се е сменило СЪДЪРЖАНИЕТО. Дотук
 *    беше `updatedAt`, който cron-ът пипа на всеки 3 минути, тоест всеки адрес
 *    казваше „променен сега“ и сигналът не значеше нищо;
 *  - статичните страници НЯМАТ `lastmod`: датата на последната им редакция не
 *    се пази никъде, а измислена дата е по-лоша от липсваща;
 *  - голият корен `/` го няма: той е 307 към `/bg` или `/en`, не страница;
 *  - страница-филтър без нито един сървър (на живо: whitelist, ox_core) е
 *    празна страница и не влиза, докато не се появи първият сървър.
 *
 * Разделяне на няколко файла не е нужно: таванът е 50 000 адреса / 50 MB, а
 * тук са стотици. Мине ли някога 40 000, `generateSitemaps` + индекс.
 */
export const dynamic = 'force-dynamic';

type Entry = MetadataRoute.Sitemap[number];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  /** Пътища без езиков префикс — умножават се по езиците. */
  const paths: Array<{ path: string; changeFrequency: Entry['changeFrequency']; priority: number }> = [
    { path: '/', changeFrequency: 'hourly', priority: 1 },
    { path: '/servers', changeFrequency: 'hourly', priority: 0.9 },
    { path: '/servers/whitelist', changeFrequency: 'daily', priority: 0.8 },
    { path: '/servers/framework/esx', changeFrequency: 'daily', priority: 0.8 },
    { path: '/servers/framework/qbcore', changeFrequency: 'daily', priority: 0.8 },
    { path: '/servers/framework/qbox', changeFrequency: 'daily', priority: 0.8 },
    { path: '/servers/framework/ox_core', changeFrequency: 'daily', priority: 0.8 },
    { path: '/rules', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/tutorials', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/streamers', changeFrequency: 'hourly', priority: 0.7 },
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

  /** Всеки адрес носи езиковите си близнаци + x-default — същия набор като страницата. */
  const alternates = (path: string) => ({ languages: alternateLanguages(path) });

  const staticEntries = (skip: ReadonlySet<string> = new Set()): MetadataRoute.Sitemap =>
    LOCALES.flatMap((locale) =>
      paths
        .filter((entry) => !skip.has(entry.path))
        .map((entry) => ({
          url: localeUrl(locale, entry.path),
          changeFrequency: entry.changeFrequency,
          priority: entry.priority,
          alternates: alternates(entry.path),
        })),
    );

  try {
    const [decisions, posts, counts] = await Promise.all([
      serverIndexDecisions(prisma),
      prisma.post.findMany({
        where: { publishedAt: { not: null, lte: new Date() } },
        select: { slug: true, updatedAt: true, locale: true },
      }),
      listingCounts(),
    ]);
    const servers = decisions.filter((row) => row.index);

    // Същото условие като `noindex` на самите страници-филтри.
    const empty = new Set<string>();
    if (counts.ok) {
      if (counts.whitelist === 0) empty.add('/servers/whitelist');
      for (const [path, id] of [
        ['/servers/framework/esx', 'ESX'],
        ['/servers/framework/qbcore', 'QBCORE'],
        ['/servers/framework/qbox', 'QBOX'],
        ['/servers/framework/ox_core', 'OX_CORE'],
      ] as const) {
        if (!counts.frameworks[id]) empty.add(path);
      }
    }

    return [
      ...staticEntries(empty),
      ...LOCALES.flatMap((locale) => [
        ...servers.map((server) => ({
          url: localeUrl(locale, `/servers/${server.slug}`),
          lastModified: server.contentUpdatedAt,
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
    // Логваме: иначе срутването до статичните адреси минава без никаква следа.
    console.error('[sitemap] динамичните адреси не се прочетоха', error);
    return staticEntries();
  }
}
