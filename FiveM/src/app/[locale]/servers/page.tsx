import Link from 'next/link';
import { notFound } from 'next/navigation';

import { JsonLd } from '@/components/JsonLd';
import { Badge } from '@/components/Badge';
import { Pagination } from '@/components/Pagination';
import { ServerCard } from '@/components/ServerCard';
import { getDictionary, resolveLocale } from '@/i18n';
import { paginate, pageHref, parsePage } from '@/lib/pagination';
import { pageMetadata, serverListJsonLd } from '@/lib/seo';
import { listPublicServers } from '@/lib/servers';

// Живият статус се мени постоянно — не се кешира между заявките.
export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
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
export async function generateMetadata({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);
  const { q, page: rawPage } = await searchParams;
  const page = parsePage(rawPage);
  // Страница 2+ е САМОСТОЯТЕЛЕН адрес със свой canonical (друг списък
  // сървъри); подредбата (`sort`) не е — тя пренарежда същите. Резултатите от
  // търсене (`q`) са `noindex, follow`: вътрешно търсене не е съдържание.
  // Страница 2+ носи краткото име (h1) + номера — иначе заглавието минава 60.
  return pageMetadata({
    locale,
    title: page > 1 ? `${t.servers.h1} — ${t.common.page} ${page}` : t.servers.title,
    description: page > 1 ? `${t.servers.description} ${t.common.page} ${page}.` : t.servers.description,
    path: pageHref('/servers', page),
    noindex: Boolean(q?.trim()),
    follow: true,
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

  const { q, sort, page: rawPage } = await searchParams;
  const query = q?.trim().slice(0, 60) || undefined;
  const chosen = sort === 'players' || sort === 'name' ? sort : 'default';
  const servers = await listPublicServers({ query, sort: chosen });
  const online = servers.filter((server) => server.online);
  const totalPlayers = online.reduce((sum, server) => sum + server.players, 0);
  const current = paginate(servers, parsePage(rawPage));
  if (current.outOfRange) notFound();
  const keep = { q: query, sort: chosen === 'default' ? undefined : chosen };

  const filters = [
    { href: `/${locale}/servers/framework/esx`, label: 'ESX', badge: 'esx' },
    { href: `/${locale}/servers/framework/qbcore`, label: 'QBCore', badge: 'qbcore' },
    { href: `/${locale}/servers/framework/qbox`, label: 'Qbox', badge: 'qbox' },
    { href: `/${locale}/servers/framework/ox_core`, label: 'ox_core', badge: 'ox-core' },
    { href: `/${locale}/servers/whitelist`, label: t.filters.whitelist, badge: 'whitelist' },
  ];

  return (
    <>
      <header className="max-w-3xl">
        <h1 className="page-title">{t.servers.h1}</h1>
        <p className="lead mt-5">{t.servers.intro}</p>
        {servers.length > 0 && (
          <p className="mt-5 flex items-center gap-2.5 text-sm text-silver-400">
            {online.length > 0 ? <span className="live-dot" aria-hidden="true" /> : <span className="idle-dot" aria-hidden="true" />}
            <span className="tabular-nums">
              {online.length} {t.home.statsOnline} {servers.length} · {totalPlayers} {t.home.statsPlayers}
            </span>
          </p>
        )}
      </header>

      {/* Лентата с инструменти: филтрите (връзки към индексируемите страници по
          рамка) и търсенето (форма, `noindex`) — едно място, два различни вида
          навигация, затова два реда. */}
      <div className="panel mt-10 p-4 sm:p-5">
        <nav aria-label={t.home.filters} className="flex flex-wrap gap-2 text-sm">
          {filters.map((filter) => (
            <Link
              key={filter.href}
              href={filter.href}
              className="flex min-h-11 items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.02] py-1 pe-4 ps-1.5 text-silver-200 transition-colors hover:border-cyan-400/60 hover:text-cyan-200"
            >
              <Badge name={filter.badge} size={30} />
              {filter.label}
            </Link>
          ))}
        </nav>

        <div className="hairline my-4" aria-hidden="true" />

        <form className="flex flex-wrap items-end gap-3" role="search">
          <label className="flex min-w-[14rem] flex-1 flex-col text-sm sm:max-w-sm">
            <span className="field-label text-sm">{t.filters.search}</span>
            <input name="q" defaultValue={query ?? ''} maxLength={60} className="field min-h-11" />
          </label>
          <label className="flex flex-col text-sm">
            <span className="field-label text-sm">{t.filters.sortLabel}</span>
            <select name="sort" defaultValue={chosen} className="field min-h-11 pe-9">
              <option value="default">{t.filters.sortDefault}</option>
              <option value="players">{t.filters.sortPlayers}</option>
              <option value="name">{t.filters.sortName}</option>
            </select>
          </label>
          <button className="btn-ghost">{t.filters.searchButton}</button>
          {query && (
            <span className="pb-3 text-sm text-silver-400">
              {servers.length} {t.filters.found}
            </span>
          )}
        </form>
      </div>

      <section className="mt-8" aria-labelledby="servers-heading">
        <h2 id="servers-heading" className="sr-only">
          {t.home.serverList}
        </h2>
        {/* Чл. 7, ал. 4а от Дир. 2005/29/ЕО: параметрите на класирането трябва
            да са в специален раздел, ПРЯКО достъпен от страницата с
            резултатите. Общ линк „Условия“ в подвала не изпълнява това —
            затова котвата води точно до раздела, а не до документа. Резултати
            има и на началната (тийзърът) — там линкът също стои. */}
        <p className="mb-5 text-sm">
          <Link href={`/${locale}/terms#kak-podrezhdame-sarvarite`} className="link-quiet">
            {t.home.rankingLink}
          </Link>
        </p>
        {servers.length === 0 && query ? (
          <p className="panel p-8 text-center text-silver-300">
            {t.filters.noMatch}
          </p>
        ) : servers.length === 0 ? (
          <p className="panel p-8 text-center text-silver-300">
            {t.home.emptyLead}{' '}
            <Link href={`/${locale}/submit`} className="link">
              {t.home.emptyCta}
            </Link>{' '}
            {t.home.emptyTail}
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {current.items.map((server) => (
              <ServerCard key={server.slug} server={server} locale={locale} t={t} />
            ))}
          </ul>
        )}
        <Pagination
          base={`/${locale}/servers`}
          page={current.page}
          pages={current.pages}
          params={keep}
          labels={t.common}
        />
      </section>

      <JsonLd data={serverListJsonLd(locale, current.items, current.offset)} />
    </>
  );
}
