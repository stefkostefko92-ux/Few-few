import Link from 'next/link';

import { notFound } from 'next/navigation';

import { JsonLd } from '@/components/JsonLd';
import { Pagination } from '@/components/Pagination';
import { ServerCard } from '@/components/ServerCard';
import { getDictionary, resolveLocale } from '@/i18n';
import { paginate, pageHref, parsePage } from '@/lib/pagination';
import { breadcrumbJsonLd, pageMetadata, serverListJsonLd } from '@/lib/seo';
import { listingCounts, listPublicServers } from '@/lib/servers';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string }> };

const COPY = {
  bg: {
    title: 'Whitelist FiveM сървъри в България',
    description:
      'Български FiveM RP сървъри с whitelist — приемат нови играчи само след одобрение. По-сериозна ролева игра и по-малко нарушители.',
    intro:
      'Whitelist сървърът приема нови играчи само след одобрение — обикновено кандидатстване в Discord с история на героя. Целта е по-сериозна ролева игра и по-малко нарушители.',
    empty: 'Още няма листнат whitelist сървър.',
    cta: 'Добави своя',
    keywords: ['whitelist FiveM сървър', 'сериозен RP сървър', 'heavy RP България'],
  },
  en: {
    title: 'Whitelisted FiveM servers in Bulgaria',
    description:
      'Bulgarian FiveM RP servers with a whitelist — new players are accepted only after approval. More serious roleplay and fewer rule breakers.',
    intro:
      'A whitelisted server accepts new players only after approval — usually an application in Discord with a character backstory. The point is more serious roleplay and fewer rule breakers.',
    empty: 'No whitelisted server listed yet.',
    cta: 'Add yours',
    keywords: ['whitelist FiveM server', 'serious RP server', 'heavy RP Bulgaria'],
  },
} as const;

export async function generateMetadata({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);
  const copy = COPY[locale];
  const page = parsePage((await searchParams).page);
  const counts = await listingCounts();
  // Без нито един whitelist сървър страницата е празна (така е на живо):
  // `noindex, follow` и извън sitemap-а, докато не се появи първият.
  const suffix = page > 1 ? ` — ${t.common.page} ${page}` : '';
  return pageMetadata({
    locale,
    title: `${copy.title}${suffix}`,
    description: page > 1 ? `${copy.description} ${t.common.page} ${page}.` : copy.description,
    path: pageHref('/servers/whitelist', page),
    keywords: [...copy.keywords],
    noindex: counts.ok && counts.whitelist === 0,
    follow: true,
  });
}

export default async function WhitelistPage({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);
  const copy = COPY[locale];
  const servers = await listPublicServers({ whitelist: true });
  const current = paginate(servers, parsePage((await searchParams).page));
  if (current.outOfRange) notFound();

  return (
    <div>
      <nav aria-label={t.common.breadcrumbLabel} className="text-sm text-silver-500">
        <Link
          href={`/${locale}/servers`}
          className="link-quiet inline-flex min-h-6 items-center"
        >
          {t.server.breadcrumb}
        </Link>{' '}
        / <span aria-current="page">{t.filters.whitelist}</span>
      </nav>

      <h1 className="page-title mt-3">
        {copy.title}
      </h1>
      <p className="lead mt-4">{copy.intro}</p>

      {servers.length === 0 ? (
        <p className="mt-8 text-silver-400">
          {copy.empty}{' '}
          <Link href={`/${locale}/submit`} className="link">
            {copy.cta}
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {current.items.map((server) => (
            <ServerCard key={server.slug} server={server} locale={locale} t={t} />
          ))}
        </ul>
      )}
      <Pagination
        base={`/${locale}/servers/whitelist`}
        page={current.page}
        pages={current.pages}
        labels={t.common}
      />

      <JsonLd data={serverListJsonLd(locale, current.items, current.offset)} />
      <JsonLd data={breadcrumbJsonLd(locale, [
              { name: t.server.breadcrumb, path: '/servers' },
              { name: t.filters.whitelist, path: '/servers/whitelist' },
            ])} />
    </div>
  );
}
