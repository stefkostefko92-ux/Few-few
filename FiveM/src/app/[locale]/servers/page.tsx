import Link from 'next/link';

import { JsonLd } from '@/components/JsonLd';
import { Badge } from '@/components/Badge';
import { ServerCard } from '@/components/ServerCard';
import { getDictionary, resolveLocale } from '@/i18n';
import { pageMetadata, serverListJsonLd } from '@/lib/seo';
import { listPublicServers } from '@/lib/servers';

// Живият статус се мени постоянно — не се кешира между заявките.
export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; sort?: string }>;
};

/**
 * ПЪЛНИЯТ каталог. Дотук живееше на началната, но тя стана landing; двете неща
 * искат различно от посетителя (единият убеждава, другият дава инструмент), а
 * смесени се пречат.
 *
 * Тук идват `/servers/whitelist` и `/servers/framework/<id>` — индексът им
 * дотогава просто липсваше, тоест `/servers` беше 404 между собствените си
 * подстраници.
 */
export async function generateMetadata({ params }: Pick<Props, 'params'>) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);
  return pageMetadata({
    locale,
    title: t.servers.title,
    description: t.servers.description,
    path: '/servers',
    keywords:
      locale === 'bg'
        ? ['директория FiveM сървъри', 'онлайн статус FiveM', 'кой сървър е онлайн', 'whitelist сървъри']
        : ['FiveM server directory', 'FiveM live status', 'which server is online', 'whitelisted servers'],
  });
}

export default async function ServersPage({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);

  const { q, sort } = await searchParams;
  const query = q?.trim().slice(0, 60) || undefined;
  const chosen = sort === 'players' || sort === 'name' ? sort : 'default';
  const servers = await listPublicServers({ query, sort: chosen });
  const online = servers.filter((server) => server.online);
  const totalPlayers = online.reduce((sum, server) => sum + server.players, 0);

  const filters = [
    { href: `/${locale}/servers/framework/esx`, label: 'ESX', badge: 'esx' },
    { href: `/${locale}/servers/framework/qbcore`, label: 'QBCore', badge: 'qbcore' },
    { href: `/${locale}/servers/framework/qbox`, label: 'Qbox', badge: 'qbox' },
    { href: `/${locale}/servers/framework/ox_core`, label: 'ox_core', badge: 'ox-core' },
    { href: `/${locale}/servers/whitelist`, label: t.filters.whitelist, badge: 'whitelist' },
  ];

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">{t.servers.h1}</h1>
      <p className="mt-3 max-w-2xl text-silver-400">{t.servers.intro}</p>
      {servers.length > 0 && (
        <p className="mt-4 text-sm text-silver-500">
          {online.length} {t.home.statsOnline} {servers.length} · {totalPlayers} {t.home.statsPlayers}
        </p>
      )}

      <nav aria-label={t.home.filters} className="mt-6 flex flex-wrap gap-2 text-sm">
        {filters.map((filter) => (
          <Link
            key={filter.href}
            href={filter.href}
            className="flex items-center gap-2 rounded-lg border border-white/15 py-1.5 pe-3 ps-2 hover:border-cyan-500 hover:text-cyan-300"
          >
            <Badge name={filter.badge} size={28} />
            {filter.label}
          </Link>
        ))}
      </nav>

      <form className="mt-6 flex flex-wrap items-end gap-2" role="search">
        <label className="flex flex-1 flex-col gap-1 text-sm sm:max-w-xs">
          <span className="text-silver-500">{t.filters.search}</span>
          <input
            name="q"
            defaultValue={query ?? ''}
            maxLength={60}
            className="rounded-lg border border-white/15 bg-ink-900 px-3 py-2 text-silver-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-silver-500">{t.filters.sortLabel}</span>
          <select
            name="sort"
            defaultValue={chosen}
            className="rounded-lg border border-white/15 bg-ink-900 px-3 py-2 text-silver-100"
          >
            <option value="default">{t.filters.sortDefault}</option>
            <option value="players">{t.filters.sortPlayers}</option>
            <option value="name">{t.filters.sortName}</option>
          </select>
        </label>
        <button className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:border-cyan-500 hover:text-cyan-300">
          {t.filters.searchButton}
        </button>
        {query && (
          <span className="text-sm text-silver-500">
            {servers.length} {t.filters.found}
          </span>
        )}
      </form>

      <section className="mt-10" aria-labelledby="servers-heading">
        <h2 id="servers-heading" className="sr-only">
          {t.home.serverList}
        </h2>
        {/* Чл. 7, ал. 4а от Дир. 2005/29/ЕО: параметрите на класирането трябва
            да са в специален раздел, ПРЯКО достъпен от страницата с
            резултатите. Общ линк „Условия“ в подвала не изпълнява това —
            затова котвата води точно до раздела, а не до документа. Резултати
            има и на началната (тийзърът) — там линкът също стои. */}
        <p className="mb-4 text-sm text-silver-500">
          <Link
            href={`/${locale}/terms#kak-podrezhdame-sarvarite`}
            className="text-cyan-300 underline underline-offset-2"
          >
            {t.home.rankingLink}
          </Link>
        </p>
        {servers.length === 0 && query ? (
          <p className="rounded-xl border border-dashed border-white/15 p-6 text-silver-400">
            {t.filters.noMatch}
          </p>
        ) : servers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/15 p-6 text-silver-400">
            {t.home.emptyLead}{' '}
            <Link href={`/${locale}/submit`} className="text-cyan-300 underline underline-offset-2">
              {t.home.emptyCta}
            </Link>{' '}
            {t.home.emptyTail}
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {servers.map((server) => (
              <ServerCard key={server.slug} server={server} locale={locale} t={t} />
            ))}
          </ul>
        )}
      </section>

      <JsonLd data={serverListJsonLd(locale, servers)} />
    </>
  );
}
