import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { submitReviewAction } from '@/app/actions/review';
import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { getDictionary } from '@/i18n';
import { isLocale } from '@/i18n/config';
import { cfxJoinUrl, formatPlayers, type FrameworkId } from '@/lib/fivem';
import { errorMessage } from '@/lib/messages';
import { breadcrumbJsonLd, jsonLdString, localeUrl, pageMetadata } from '@/lib/seo';
import { FRAMEWORK_ICON, STATUS_ICON, tagIcon } from '@/lib/icons';
import { getPublicServer, isFeatured, REVIEWS_SHOWN, reviewSummary } from '@/lib/servers';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ review?: string; error?: string }>;
};

export async function generateMetadata({ params }: Pick<Props, 'params'>) {
  const { locale: raw, slug } = await params;
  const locale = isLocale(raw) ? raw : 'bg';
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
  const locale = isLocale(raw) ? raw : 'bg';
  const t = getDictionary(locale);
  const { review, error } = await searchParams;

  const server = await getPublicServer(slug);
  if (!server) notFound();

  const summary = await reviewSummary(server.id);
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

  return (
    <article className="max-w-3xl">
      <nav aria-label={t.common.breadcrumbLabel} className="text-sm text-silver-500">
        <Link href={`/${locale}`} className="underline underline-offset-2 hover:text-cyan-300">
          {t.server.breadcrumb}
        </Link>{' '}
        / <span aria-current="page">{server.name}</span>
      </nav>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {iconUrl && (
          <Image
            src={iconUrl}
            alt=""
            width={48}
            height={48}
            className="rounded-lg border border-white/10"
            unoptimized
          />
        )}
        <h1 className="text-3xl font-semibold tracking-tight">{server.name}</h1>
        {featured && (
          <span className="flex items-center gap-1 rounded bg-cyan-700/25 px-2 py-0.5 text-xs text-cyan-200">
            <Icon group="status" name="promoted" size={13} />
            {t.server.promoted}
          </span>
        )}
        {server.source === 'DISCOVERED' && (
          <span className="flex items-center gap-1 rounded border border-white/15 px-2 py-0.5 text-xs text-silver-500">
            <Icon group="status" name="discovered" size={13} />
            {t.server.discovered}
          </span>
        )}
      </div>
      {server.tagline && <p className="mt-2 text-silver-400">{server.tagline}</p>}

      <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-silver-500">{t.server.status}</dt>
          <dd className="flex items-center gap-2">
            <Badge name={STATUS_ICON[server.lastProbe]} size={28} />
            {formatPlayers(
              { outcome: server.lastProbe, players: server.players, maxPlayers: server.maxPlayers },
              t.status,
            )}
          </dd>
        </div>
        <div>
          <dt className="text-silver-500">{t.server.framework}</dt>
          <dd className="flex items-center gap-2">
            <Badge name={FRAMEWORK_ICON[server.framework as FrameworkId]} size={28} />
            {t.frameworks[server.framework as FrameworkId]}
          </dd>
        </div>
        <div>
          <dt className="text-silver-500">{t.server.access}</dt>
          <dd className="flex items-center gap-2">
            <Badge name={server.whitelist ? 'whitelist' : 'open'} size={28} />
            {server.whitelist ? t.server.whitelisted : t.server.open}
          </dd>
        </div>
        <div>
          <dt className="text-silver-500">{t.server.rating}</dt>
          <dd>
            {summary.average === null
              ? t.server.noReviews
              : `${summary.average} / 5 ${t.server.ratingOf} ${summary.count} ${t.server.reviewsWord}`}
          </dd>
        </div>
      </dl>

      {server.tags.length > 0 && (
        <ul className="mt-6 flex flex-wrap gap-2 text-sm text-silver-400">
          {server.tags.map((tag) => {
            const icon = tagIcon(tag);
            return (
              <li
                key={tag}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1"
              >
                {/* Етикетите са свободен текст — липсваща икона е нормално. */}
                {icon && <Badge name={icon} size={24} />}
                {tag}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-sm text-silver-500">{t.server.ratingDisclaimer}</p>

      {server.source === 'DISCOVERED' && (
        <p className="mt-4 rounded-lg border border-white/10 bg-ink-900/70 p-3 text-sm text-silver-400">
          {t.server.discoveredNote}
        </p>
      )}

      {server.lastProbe === 'HIDDEN' && (
        <p className="mt-4 rounded-lg border border-white/10 bg-ink-900/70 p-3 text-sm text-silver-400">
          {t.server.hiddenNotice}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        {joinUrl && (
          <a
            href={joinUrl}
            rel="nofollow noopener"
            className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 font-medium text-ink-950 hover:bg-cyan-400"
          >
            <Icon group="ui" name="join" size={16} />
            {t.server.join}
          </a>
        )}
        {server.discordUrl && (
          <a
            href={server.discordUrl}
            rel="nofollow noopener ugc"
            className="flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 hover:border-cyan-500"
          >
            <Icon group="brand" name="discord" size={16} />
            {t.server.discord}
          </a>
        )}
        {server.websiteUrl && (
          <a
            href={server.websiteUrl}
            rel="nofollow noopener ugc"
            className="flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 hover:border-cyan-500"
          >
            <Icon group="ui" name="external" size={16} />
            {t.server.website}
          </a>
        )}
      </div>

      {server.description && (
        <section className="mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold">{t.server.about}</h2>
            <Link
              href={reportHref}
              className="text-sm text-silver-500 underline underline-offset-2 hover:text-cyan-300"
            >
              {t.server.reportContent}
            </Link>
          </div>
          {/* Текстът е подаден от собственика — чист текст, без HTML/Markdown. */}
          <p className="mt-3 whitespace-pre-line text-silver-400">{server.description}</p>
        </section>
      )}

      <section className="mt-10" id="reviews">
        <h2 className="text-xl font-semibold">{t.server.reviews}</h2>

        {review === 'ok' && (
          <p role="status" className="mt-3 rounded-lg border border-cyan-600 bg-ink-900 p-3">
            {t.server.reviewOk}
          </p>
        )}
        {message && (
          <p role="alert" className="mt-3 rounded-lg border border-red-500/60 bg-red-950/40 p-3">
            {message}
          </p>
        )}

        {server.reviews.length === 0 ? (
          <p className="mt-3 text-silver-400">{t.server.reviewsEmpty}</p>
        ) : (
          <>
            <ul className="mt-4 space-y-4">
              {server.reviews.map((item) => (
                <li key={item.id} className="rounded-lg border border-white/10 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm text-silver-500">
                      {item.rating} / 5 · {item.authorAlias ?? t.server.anonymous}
                    </p>
                    <Link
                      href={reportHref}
                      className="text-xs text-silver-500 underline underline-offset-2 hover:text-cyan-300"
                    >
                      {t.server.reportShort}
                    </Link>
                  </div>
                  {item.body && (
                    <p className="mt-2 whitespace-pre-line text-silver-300">{item.body}</p>
                  )}
                </li>
              ))}
            </ul>
            {summary.count > REVIEWS_SHOWN && (
              <p className="mt-3 text-sm text-silver-500">
                {t.server.reviewsShownOf} {REVIEWS_SHOWN} {t.server.reviewsOfTotal} {summary.count}.
              </p>
            )}
          </>
        )}

        <form action={submitReviewAction} className="mt-8 max-w-md space-y-4">
          <h3 className="font-medium">{t.server.leaveReview}</h3>
          <input type="hidden" name="slug" value={server.slug} />
          <input type="hidden" name="locale" value={locale} />

          <div>
            <label htmlFor="rating">{t.server.ratingLabel}</label>
            <select
              id="rating"
              name="rating"
              defaultValue="5"
              className="mt-1 w-full rounded-lg border border-white/15 bg-ink-900 px-3 py-2 text-silver-100"
            >
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="authorAlias">{t.server.aliasLabel}</label>
            <input
              id="authorAlias"
              name="authorAlias"
              maxLength={40}
              className="mt-1 w-full rounded-lg border border-white/15 bg-ink-900 px-3 py-2 text-silver-100"
            />
          </div>

          <div>
            <label htmlFor="body">{t.server.bodyLabel}</label>
            <textarea
              id="body"
              name="body"
              rows={4}
              maxLength={2000}
              className="mt-1 w-full rounded-lg border border-white/15 bg-ink-900 px-3 py-2 text-silver-100"
              aria-describedby="review-help"
            />
            <p id="review-help" className="mt-1 text-sm text-silver-500">
              {t.server.reviewHelp}{' '}
              <Link href={`/${locale}/terms`} className="text-cyan-300 underline underline-offset-2">
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
            className="rounded-lg border border-white/15 px-4 py-2 hover:border-cyan-500"
          >
            {t.server.reviewSubmit}
          </button>
        </form>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(
            breadcrumbJsonLd(locale, [
              { name: t.server.breadcrumb, path: '/' },
              { name: server.name, path: `/servers/${server.slug}` },
            ]),
          ),
        }}
      />
    </article>
  );
}
