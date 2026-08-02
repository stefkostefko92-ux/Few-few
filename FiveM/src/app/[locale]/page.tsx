import Link from 'next/link';

import { JsonLd } from '@/components/JsonLd';
import { Badge } from '@/components/Badge';
import { Mascot } from '@/components/Mascot';
import { ServerCard } from '@/components/ServerCard';
import { getContent } from '@/content';
import { getDictionary, resolveLocale } from '@/i18n';
import { type Locale } from '@/i18n/config';
import { faqJsonLd, pageMetadata, serverListJsonLd } from '@/lib/seo';
import { listPublicServers } from '@/lib/servers';
import { DISCORD_INVITE } from '@/lib/site';

// Живият статус се мени постоянно — не се кешира между заявките.
export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; sort?: string }>;
};

/**
 * „Отговор отпред“ за AI отговарачите (AEO): въпросите се хранят от СЪЩИТЕ
 * правила и туториали, които сайтът показва — не се пишат втори път, значи не
 * могат да се разминат с тях.
 */
function faqFor(locale: Locale) {
  const content = getContent(locale);
  const rp = content.rules.find((section) => section.id === 'roleplay');
  const pick = (id: string) => rp?.items.find((item) => item.id === id);
  const join = content.tutorials.find((tutorial) => tutorial.id === 'join');
  const frameworks = content.tutorials.find((tutorial) => tutorial.id === 'frameworks');

  const entries = [
    join && { question: join.title, answer: join.steps[0].body },
    frameworks && {
      question: frameworks.title,
      answer: frameworks.steps.map((step) => `${step.title}: ${step.body}`).join(' '),
    },
    pick('nlr') && { question: pick('nlr')!.title, answer: pick('nlr')!.body },
    pick('rdm') && { question: pick('rdm')!.title, answer: pick('rdm')!.body },
  ];

  return entries.filter((item): item is { question: string; answer: string } => Boolean(item));
}

export async function generateMetadata({ params }: Pick<Props, 'params'>) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);
  return pageMetadata({
    locale,
    title: t.home.title,
    description: t.home.description,
    path: '/',
    // Началната има СВОИ ключови думи. Досега трите страници (начална,
    // правила, туториали) споделяха едно множество и се състезаваха за едни и
    // същи запитвания — сами си правехме канибализация в резултатите.
    keywords:
      locale === 'bg'
        ? ['директория FiveM сървъри', 'онлайн статус FiveM', 'кой сървър е онлайн', 'whitelist сървъри']
        : ['FiveM server directory', 'FiveM live status', 'which server is online', 'whitelisted servers'],
  });
}

export default async function HomePage({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);

  const { q, sort } = await searchParams;
  const query = q?.trim().slice(0, 60) || undefined;
  const chosen = sort === 'players' || sort === 'name' ? sort : 'default';
  const servers = await listPublicServers({ query, sort: chosen });
  const online = servers.filter((server) => server.online);
  const totalPlayers = online.reduce((sum, server) => sum + server.players, 0);
  const faq = faqFor(locale);

  const filters = [
    { href: `/${locale}/servers/framework/esx`, label: 'ESX', badge: 'esx' },
    { href: `/${locale}/servers/framework/qbcore`, label: 'QBCore', badge: 'qbcore' },
    { href: `/${locale}/servers/framework/qbox`, label: 'Qbox', badge: 'qbox' },
    { href: `/${locale}/servers/framework/ox_core`, label: 'ox_core', badge: 'ox-core' },
    { href: `/${locale}/servers/whitelist`, label: t.filters.whitelist, badge: 'whitelist' },
  ];

  return (
    <>
      <section className="flex flex-col-reverse items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            <span className="text-chrome">{t.home.h1}</span>
          </h1>
          <p className="mt-3 max-w-2xl text-silver-400">{t.home.intro}</p>
          {servers.length > 0 && (
            <p className="mt-4 text-sm text-silver-500">
              {online.length} {t.home.statsOnline} {servers.length} · {totalPlayers}{' '}
              {t.home.statsPlayers}
            </p>
          )}
        </div>

        {/* Герой-кадър: пълното ниво (градиенти, ореол, мехурчета) си струва само
            над 128 px. Погледът следи курсора, а анимацията мълчи при
            prefers-reduced-motion — и двете са вградени в компонента. */}
        <Mascot
          detail="full"
          size={168}
          pose="wave"
          expression="happy"
          gaze="follow"
          animated
          title={null}
          className="shrink-0"
        />
      </section>

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
            затова котвата води точно до раздела, а не до документа. */}
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

      <section className="mt-14 rounded-xl border border-cyan-700/40 bg-cyan-900/10 p-5">
        <p className="text-silver-300">
          {t.home.discordLead}{' '}
          <a
            href={DISCORD_INVITE}
            rel="noopener nofollow"
            className="font-medium text-cyan-300 underline underline-offset-2"
          >
            {t.home.discordCta}
          </a>
          .
        </p>
      </section>

      <section className="mt-14" aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="text-2xl font-semibold tracking-tight">
          {t.home.faqHeading}
        </h2>
        <dl className="mt-6 space-y-6">
          {faq.map((item) => (
            <div key={item.question}>
              <dt className="font-medium">{item.question}</dt>
              <dd className="mt-1 text-silver-400">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <JsonLd data={faqJsonLd(faq)} />
      <JsonLd data={serverListJsonLd(locale, servers)} />
    </>
  );
}
