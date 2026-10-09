import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { submitReviewAction } from '@/app/actions/review';
import { JsonLd } from '@/components/JsonLd';
import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { getDictionary, resolveLocale } from '@/i18n';
import { cfxJoinUrl, formatPlayers, type FrameworkId } from '@/lib/fivem';
import { errorMessage } from '@/lib/messages';
import { breadcrumbJsonLd, localeUrl, pageMetadata } from '@/lib/seo';
import { FRAMEWORK_ICON, STATUS_ICON, tagIcon } from '@/lib/icons';
import {
  getPublicServer,
  isFeatured,
  playersLastDay,
  REVIEWS_SHOWN,
  reviewSummary,
} from '@/lib/servers';
import { PlayerList } from '@/components/PlayerList';
import { PlayersChart } from '@/components/PlayersChart';
import { Stars } from '@/components/Stars';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ review?: string; error?: string }>;
};

export async function generateMetadata({ params }: Pick<Props, 'params'>) {
  const { locale: raw, slug } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);
  const server = await getPublicServer(slug);
  if (!server) {
    return pageMetadata({ locale, title: t.news.notFound, description: '', noindex: true });
  }

  return pageMetadata({
    locale,
    title: `${server.name} — FiveM RP`,
    description:
      server.tagline ??
      `${server.name}: ${t.frameworks[server.framework as FrameworkId]}. ${t.home.description}`,
    path: `/servers/${server.slug}`,
    keywords: [server.name, `${server.name} FiveM`],
  });
}

export default async function ServerPage({ params, searchParams }: Props) {
  const { locale: raw, slug } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);
  const { review, error } = await searchParams;

  const server = await getPublicServer(slug);
  if (!server) notFound();

  const [summary, history] = await Promise.all([
    reviewSummary(server.id),
    playersLastDay(server.id, locale),
  ]);
  const joinUrl = server.cfxJoinCode ? cfxJoinUrl(server.cfxJoinCode) : null;
  const iconUrl =
    server.cfxJoinCode && server.iconVersion !== null
      ? `https://frontend.cfx-services.net/api/servers/icon/${server.cfxJoinCode}/${server.iconVersion}.png`
      : null;
  const featured = isFeatured(server);
  const message = errorMessage(error, t);
  const reportHref = `/${locale}/report?url=${encodeURIComponent(
    localeUrl(locale, `/servers/${server.slug}`),
  )}`;

  // ВНИМАНИЕ: тук НЯМА `aggregateRating`. Оценките са от анонимни, непроверени
  // ревюта — издаването им към търсачките като структуриран рейтинг е
  // твърдение, което не можем да подкрепим.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: server.name,
    url: localeUrl(locale, `/servers/${server.slug}`),
    description: server.tagline ?? undefined,
    inLanguage: locale,
  };

  const status = formatPlayers(
    { outcome: server.lastProbe, players: server.players, maxPlayers: server.maxPlayers },
    t.status,
  );
  const field = 'mt-1.5 w-full rounded-lg border border-white/15 bg-ink-950 px-3 py-2.5 text-silver-100 transition-colors focus:border-cyan-500';
  const secondary =
    'flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/15 px-4 transition-colors hover:border-cyan-500 hover:text-cyan-300';

  return (
    <article>
      <nav aria-label={t.common.breadcrumbLabel} className="text-sm text-silver-400">
        <Link
          href={`/${locale}/servers`}
          className="inline-flex min-h-6 items-center underline underline-offset-4 hover:text-cyan-300"
        >
          {t.server.breadcrumb}
        </Link>
        <span aria-hidden="true" className="mx-2 text-silver-500">/</span>
        <span aria-current="page">{server.name}</span>
      </nav>

      <header className="mt-5 flex items-start gap-4 sm:gap-5">
        {/* Голямата част от откритите сървъри нямат икона в Cfx.re — заместител,
            за да не зее празно място до името. */}
        <Image
          src={iconUrl ?? '/brand/placeholder-server.png'}
          alt=""
          width={72}
          height={72}
          className="size-14 shrink-0 rounded-xl border border-white/10 sm:size-[72px]"
          unoptimized
        />
        <div className="min-w-0">
          <h1 className="page-title break-words">{server.name}</h1>
          {(featured || server.source === 'DISCOVERED') && (
            <div className="mt-2 flex flex-wrap gap-2">
              {featured && (
                <span className="flex items-center gap-1.5 rounded-md bg-cyan-700/25 px-2 py-1 text-xs text-cyan-200">
                  <Icon group="status" name="promoted" size={13} />
                  {t.server.promoted}
                </span>
              )}
              {server.source === 'DISCOVERED' && (
                <span className="flex items-center gap-1.5 rounded-md border border-white/15 px-2 py-1 text-xs text-silver-400">
                  <Icon group="status" name="discovered" size={13} />
                  {t.server.discovered}
                </span>
              )}
            </div>
          )}
          {server.tagline && <p className="mt-3 max-w-2xl text-silver-300">{server.tagline}</p>}
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-10">
        {/* Картата с действията е ПЪРВА в DOM: на телефон „Влез“ и статусът
            стоят веднага под името, не след графиката и описанието. На широк
            екран отива вдясно и остава видима при превъртане. */}
        <aside className="self-start rounded-xl border border-white/10 bg-ink-900/70 p-5 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1">
          <div className="text-silver-200">
            <PlayerList
              names={server.playerNames}
              seenAt={server.online ? server.playersSeenAt : null}
              labels={{
                title: t.server.playersTitle,
                hidden: t.server.playersHidden,
                none: t.server.playersNone,
                note: t.server.playersNote,
                close: t.server.playersClose,
                open: t.server.playersOpen,
              }}
              trigger={
                <>
                  <Badge name={STATUS_ICON[server.lastProbe]} size={32} />
                  {server.lastProbe === 'ONLINE' ? (
                    // Числото е главното на картата — то отговаря на „има ли
                    // хора вътре“. Текстът остава същият низ като в списъка.
                    <span className="flex items-baseline gap-1.5">
                      <span className="font-display text-[2rem] font-medium leading-none tabular-nums tracking-[-0.02em] text-silver-100">
                        {server.players}
                      </span>
                      <span className="tabular-nums text-silver-400">
                        / {server.maxPlayers || '?'} {t.status.online}
                      </span>
                    </span>
                  ) : (
                    <span>{status}</span>
                  )}
                </>
              }
            />
          </div>

          <div className="mt-5 flex flex-col gap-2.5">
            {joinUrl && (
              <a
                href={joinUrl}
                rel="nofollow noopener"
                className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 font-semibold text-ink-950 transition-colors hover:bg-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
              >
                <Icon group="ui" name="join" size={18} />
                {t.server.join}
              </a>
            )}
            {(server.discordUrl || server.websiteUrl) && (
              <div className="grid grid-cols-2 gap-2.5">
                {server.discordUrl && (
                  <a
                    href={server.discordUrl}
                    rel="nofollow noopener ugc"
                    className={`${secondary} ${server.websiteUrl ? '' : 'col-span-2'}`}
                  >
                    <Icon group="brand" name="discord" size={16} />
                    {t.server.discord}
                  </a>
                )}
                {server.websiteUrl && (
                  <a
                    href={server.websiteUrl}
                    rel="nofollow noopener ugc"
                    className={`${secondary} ${server.discordUrl ? '' : 'col-span-2'}`}
                  >
                    <Icon group="ui" name="external" size={16} />
                    {t.server.website}
                  </a>
                )}
              </div>
            )}
          </div>

          <dl className="mt-6 divide-y divide-white/10 border-t border-white/10 text-sm">
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-silver-400">{t.server.framework}</dt>
              <dd className="flex items-center gap-2 text-right text-silver-100">
                <Badge name={FRAMEWORK_ICON[server.framework as FrameworkId]} size={24} />
                {t.frameworks[server.framework as FrameworkId]}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-silver-400">{t.server.access}</dt>
              <dd className="flex items-center gap-2 text-right text-silver-100">
                <Badge name={server.whitelist ? 'whitelist' : 'open'} size={24} />
                {server.whitelist ? t.server.whitelisted : t.server.open}
              </dd>
            </div>
            {/* `dl > div > dt + dd + dd` — без вложен div: той е невалиден в `dl`. */}
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 py-3">
              <dt className="text-silver-400">{t.server.rating}</dt>
              <dd className="flex flex-wrap items-center justify-end gap-2 text-right text-silver-100">
                {summary.average === null ? (
                  t.server.noReviews
                ) : (
                  <>
                    <Stars value={summary.average} size={14} />
                    <span className="tabular-nums">
                      {summary.average} / 5 {t.server.ratingOf} {summary.count} {t.server.reviewsWord}
                    </span>
                  </>
                )}
              </dd>
              {/* Разкритието по чл. 7, ал. 6 от Дир. 2005/29/ЕО стои ДО оценката, а
                  не по-долу: изискването е за съществена информация НА мястото на
                  твърдението, не някъде на страницата. Позицията се сверява в JSX,
                  не по наличието на низа. */}
              {summary.average !== null && (
                <dd className="col-span-2 mt-2 text-xs leading-relaxed text-silver-400">
                  {t.server.ratingDisclaimer}
                </dd>
              )}
            </div>
          </dl>

          {server.tags.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2 text-sm text-silver-300">
              {server.tags.map((tag) => {
                const icon = tagIcon(tag);
                return (
                  <li
                    key={tag}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1"
                  >
                    {/* Етикетите са свободен текст — липсваща икона е нормално. */}
                    {icon && <Badge name={icon} size={20} />}
                    {tag}
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-start-1">
          <div className="space-y-4">
            <PlayersChart
              values={history.values}
              labels={history.labels}
              label={t.server.chartLabel}
              peakLabel={t.server.chartPeak}
              emptyLabel={t.server.chartEmpty}
              playersLabel={t.server.chartPlayers}
            />

            {server.source === 'DISCOVERED' && (
              <p className="rounded-xl border border-white/10 p-4 text-sm leading-relaxed text-silver-400">
                {t.server.discoveredNote}
              </p>
            )}

            {server.lastProbe === 'HIDDEN' && (
              <p className="rounded-xl border border-white/10 p-4 text-sm leading-relaxed text-silver-400">
                {t.server.hiddenNotice}
              </p>
            )}
          </div>

          {server.description && (
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="section-title">{t.server.about}</h2>
                <Link
                  href={reportHref}
                  className="inline-flex min-h-6 items-center text-sm text-silver-400 underline underline-offset-4 hover:text-cyan-300"
                >
                  {t.server.reportContent}
                </Link>
              </div>
              {/* Текстът е подаден от собственика — чист текст, без HTML/Markdown. */}
              <p className="mt-4 max-w-[68ch] whitespace-pre-line leading-relaxed text-silver-300">
                {server.description}
              </p>
            </section>
          )}

          <section id="reviews" className="scroll-mt-24">
            <h2 className="section-title">{t.server.reviews}</h2>

            {review === 'ok' && (
              <p role="status" className="mt-4 rounded-lg border border-cyan-600 bg-ink-900 p-3">
                {t.server.reviewOk}
              </p>
            )}
            {message && (
              <p role="alert" className="mt-4 rounded-lg border border-red-500/60 bg-red-950/40 p-3">
                {message}
              </p>
            )}

            {server.reviews.length === 0 ? (
              <p className="mt-4 text-silver-400">{t.server.reviewsEmpty}</p>
            ) : (
              <>
                <ul className="mt-5 divide-y divide-white/10 border-y border-white/10">
                  {server.reviews.map((item) => (
                    <li key={item.id} className="py-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-2.5 text-sm text-silver-300">
                          <Stars value={item.rating} size={14} />
                          <span className="tabular-nums">{item.rating} / 5</span>
                          <span aria-hidden="true" className="text-silver-500">·</span>
                          <span>{item.authorAlias ?? t.server.anonymous}</span>
                        </p>
                        <Link
                          href={reportHref}
                          className="inline-flex min-h-6 items-center text-xs text-silver-400 underline underline-offset-4 hover:text-cyan-300"
                        >
                          {t.server.reportShort}
                        </Link>
                      </div>
                      {item.body && (
                        <p className="mt-2.5 max-w-[68ch] whitespace-pre-line leading-relaxed text-silver-200">
                          {item.body}
                        </p>
                      )}
                      {/* Отговорът на сървъра — правото, което Общите условия
                          обещават. Визуално подчинен на ревюто и изрично назован,
                          за да не мине за втори отзив. */}
                      {item.reply && (
                        <div className="mt-3 border-s-2 border-cyan-700/60 ps-3">
                          <p className="text-xs font-medium text-cyan-300">
                            {t.server.replyLabel}
                            {item.repliedAt && (
                              <>
                                {' · '}
                                <time dateTime={item.repliedAt.toISOString()}>
                                  {item.repliedAt.toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-GB')}
                                </time>
                              </>
                            )}
                          </p>
                          <p className="mt-1 whitespace-pre-line text-sm text-silver-300">{item.reply}</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                {summary.count > REVIEWS_SHOWN && (
                  <p className="mt-3 text-sm text-silver-400">
                    {t.server.reviewsShownOf} {REVIEWS_SHOWN} {t.server.reviewsOfTotal} {summary.count}.
                  </p>
                )}
              </>
            )}

            <form
              action={submitReviewAction}
              className="mt-8 max-w-xl space-y-5 rounded-xl border border-white/10 bg-ink-900/70 p-5 sm:p-6"
            >
              <h3 className="font-display text-lg font-semibold tracking-[-0.01em]">{t.server.leaveReview}</h3>
              <input type="hidden" name="slug" value={server.slug} />
              <input type="hidden" name="locale" value={locale} />

              {/* Радио група, не `<select>`: изборът се вижда наведнъж и се
                  прави с едно докосване. Без стойност по подразбиране — иначе
                  всяко ревю, по което човек не е пипнал, излиза „5“. */}
              <fieldset>
                <legend className="text-silver-200">{t.server.ratingLabel}</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <label
                      key={value}
                      className="flex min-h-11 min-w-12 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/15 px-3 tabular-nums text-silver-300 transition-colors hover:border-cyan-500 has-[:checked]:border-cyan-400 has-[:checked]:bg-cyan-500/15 has-[:checked]:text-cyan-200 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cyan-300"
                    >
                      <input type="radio" name="rating" value={value} required className="sr-only" />
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M12 2.5l2.94 5.96 6.56.95-4.75 4.63 1.12 6.53L12 17.5l-5.87 3.07 1.12-6.53L2.5 9.41l6.56-.95z" />
                      </svg>
                      {value}
                      <span className="sr-only">{t.server.outOfFive}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor="authorAlias" className="text-silver-200">
                  {t.server.aliasLabel}
                </label>
                <input id="authorAlias" name="authorAlias" maxLength={40} className={field} />
              </div>

              <div>
                <label htmlFor="body" className="text-silver-200">
                  {t.server.bodyLabel}
                </label>
                <textarea
                  id="body"
                  name="body"
                  rows={4}
                  maxLength={2000}
                  className={field}
                  aria-describedby="review-help"
                />
                <p id="review-help" className="mt-2 text-sm leading-relaxed text-silver-400">
                  {t.server.reviewHelp}{' '}
                  <Link href={`/${locale}/terms`} className="text-cyan-300 underline underline-offset-4">
                    {t.server.reviewHelpTerms}
                  </Link>
                  .
                </p>
              </div>

              {/* Honeypot — скрит за хора, видим за ботове. */}
              <div aria-hidden="true" className="hidden">
                <label htmlFor="website">{t.submit.honeypot}</label>
                <input id="website" name="website" tabIndex={-1} autoComplete="off" />
              </div>

              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-lg bg-cyan-500 px-5 font-semibold text-ink-950 transition-colors hover:bg-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
              >
                {t.server.reviewSubmit}
              </button>
            </form>
          </section>
        </div>
      </div>

      <JsonLd data={jsonLd} />
      <JsonLd
        data={breadcrumbJsonLd(locale, [
          { name: t.server.breadcrumb, path: '/servers' },
          { name: server.name, path: `/servers/${server.slug}` },
        ])}
      />
    </article>
  );
}
