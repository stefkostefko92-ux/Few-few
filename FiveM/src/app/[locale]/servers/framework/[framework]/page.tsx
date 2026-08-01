import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ServerCard } from '@/components/ServerCard';
import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { FRAMEWORK_LABEL, type FrameworkId } from '@/lib/fivem';
import { breadcrumbJsonLd, jsonLdString, pageMetadata, serverListJsonLd } from '@/lib/seo';
import { listPublicServers } from '@/lib/servers';

export const dynamic = 'force-dynamic';

// Нарочно БЕЗ generateStaticParams: с него Next пререндира страницата на билд
// (при празна база → празен списък завинаги), а тук трябва жив статус.

/** Само рамките, които реално се търсят — UNKNOWN няма своя страница. */
const FILTERS: Record<string, { id: FrameworkId; intro: Record<Locale, string> }> = {
  esx: {
    id: 'ESX',
    intro: {
      bg: 'ESX е най-разпространената рамка за FiveM roleplay — работа, пари, инвентар и документи. Ето българските сървъри, които вървят на нея.',
      en: 'ESX is the most widespread FiveM roleplay framework — jobs, money, inventory and IDs. These are the Bulgarian servers running on it.',
    },
  },
  qbcore: {
    id: 'QBCORE',
    intro: {
      bg: 'QBCore е по-модерната алтернатива на ESX, с по-подредена структура и активна екосистема от скриптове.',
      en: 'QBCore is the more modern alternative to ESX, with a tidier structure and an active script ecosystem.',
    },
  },
  qbox: {
    id: 'QBOX',
    intro: {
      bg: 'Qbox е форк на QBCore с фокус върху производителността.',
      en: 'Qbox is a fork of QBCore focused on performance.',
    },
  },
  ox_core: {
    id: 'OX_CORE',
    intro: {
      bg: 'ox_core е лека, модерна рамка от екипа зад ox_lib и oxmysql.',
      en: 'ox_core is a light, modern framework from the team behind ox_lib and oxmysql.',
    },
  },
};

type Props = { params: Promise<{ locale: string; framework: string }> };

function titleFor(locale: Locale, id: FrameworkId): string {
  return locale === 'bg'
    ? `${FRAMEWORK_LABEL[id]} сървъри в България`
    : `${FRAMEWORK_LABEL[id]} servers in Bulgaria`;
}

export async function generateMetadata({ params }: Props) {
  const { locale: raw, framework } = await params;
  const locale = isLocale(raw) ? raw : 'bg';
  const filter = FILTERS[framework];
  if (!filter) return pageMetadata({ locale, title: '404', description: '', noindex: true });

  return pageMetadata({
    locale,
    title: titleFor(locale, filter.id),
    description: filter.intro[locale],
    path: `/servers/framework/${framework}`,
    keywords: [`${FRAMEWORK_LABEL[filter.id]} сървъри`, `FiveM ${FRAMEWORK_LABEL[filter.id]}`],
  });
}

export default async function FrameworkPage({ params }: Props) {
  const { locale: raw, framework } = await params;
  const locale = isLocale(raw) ? raw : 'bg';
  const t = getDictionary(locale);
  const filter = FILTERS[framework];
  if (!filter) notFound();

  const servers = await listPublicServers({ framework: filter.id });
  const title = titleFor(locale, filter.id);

  return (
    <div>
      <nav aria-label={t.common.breadcrumbLabel} className="text-sm text-silver-500">
        <Link href={`/${locale}`} className="underline underline-offset-2 hover:text-cyan-300">
          {t.server.breadcrumb}
        </Link>{' '}
        / <span aria-current="page">{FRAMEWORK_LABEL[filter.id]}</span>
      </nav>

      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        <span className="text-chrome">{title}</span>
      </h1>
      <p className="mt-3 max-w-2xl text-silver-400">{filter.intro[locale]}</p>

      {servers.length === 0 ? (
        <p className="mt-8 text-silver-400">
          {t.home.emptyLead}{' '}
          <Link href={`/${locale}/submit`} className="text-cyan-300 underline underline-offset-2">
            {t.home.emptyCta}
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {servers.map((server) => (
            <ServerCard key={server.slug} server={server} locale={locale} t={t} />
          ))}
        </ul>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(serverListJsonLd(locale, servers)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(
            breadcrumbJsonLd(locale, [
              { name: t.server.breadcrumb, path: '/' },
              { name: FRAMEWORK_LABEL[filter.id], path: `/servers/framework/${framework}` },
            ]),
          ),
        }}
      />
    </div>
  );
}
