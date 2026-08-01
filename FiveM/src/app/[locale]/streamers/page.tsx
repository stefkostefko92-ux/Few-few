import Link from 'next/link';

import { JsonLd } from '@/components/JsonLd';
import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { getDictionary, resolveLocale } from '@/i18n';
import { breadcrumbJsonLd, pageMetadata } from '@/lib/seo';
import { PUBLISHER } from '@/lib/site';
import { PLATFORM_BADGE, type StreamPlatformId } from '@/lib/streamers';
import { listPublicStreamers, streamerCounts, type PublicStreamer } from '@/lib/streamers-db';

/** Живият статус остарява за минути — страницата не се кешира. */
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);
  return pageMetadata({
    locale,
    title: t.streamers.title,
    description: t.streamers.description,
    path: '/streamers',
    keywords:
      locale === 'bg'
        ? ['български стриймъри GTA V', 'FiveM стриймъри', 'GTA RP Twitch България']
        : ['Bulgarian GTA V streamers', 'FiveM streamers', 'GTA RP Twitch Bulgaria'],
  });
}

export default async function StreamersPage({ params }: Props) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);

  const [groups, counts] = await Promise.all([listPublicStreamers(), streamerCounts()]);

  return (
    <div>
      <div className="flag-rule mb-6 h-[3px] rounded" aria-hidden="true" />
      <h1 className="text-3xl font-semibold tracking-tight">
        <span className="text-chrome">{t.streamers.h1}</span>
      </h1>
      <p className="mt-3 max-w-3xl text-silver-400">{t.streamers.intro}</p>

      <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-silver-400">
        <Badge name="online" size={24} />
        <strong className="text-cyan-300">{counts.live}</strong> {t.streamers.liveNow} ·{' '}
        <strong className="text-silver-100">{counts.total}</strong> {t.streamers.totalWord}
      </p>

      {groups.length === 0 ? (
        <p className="mt-10 rounded-xl border border-white/10 bg-ink-900/70 p-6 text-silver-400">
          {t.streamers.empty}
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.platform} className="mt-12">
            <h2 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
              <Badge name={PLATFORM_BADGE[group.platform]} size={40} />
              {t.streamers.platforms[group.platform]}
              <span className="text-base font-normal text-silver-500">
                ({group.streamers.length})
              </span>
            </h2>

            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.streamers.map((streamer) => (
                <StreamerCard
                  key={streamer.id}
                  streamer={streamer}
                  platform={group.platform}
                  locale={locale}
                  t={t}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {/* Чл. 14 ОРЗД: данните НЕ са събрани от самите стриймъри, значи
          прозрачността и пътят за възражение стоят на СЪЩАТА страница, не
          само в политиката. */}
      <section className="mt-14 max-w-3xl rounded-xl border border-white/10 bg-ink-900/70 p-6">
        <p className="text-sm text-silver-400">{t.streamers.dataNotice}</p>
        <h2 className="mt-5 text-lg font-medium text-silver-100">{t.streamers.optOutTitle}</h2>
        <p className="mt-2 text-sm text-silver-400">{t.streamers.optOut}</p>
        <p className="mt-3 flex flex-wrap gap-4 text-sm">
          {/* ПРЯК `mailto`, не линк към „Контакти“: чл. 12(2) иска пътят за
              упражняване на право да е УЛЕСНЕН, а страницата с контакти беше
              задънена — рендира само текстови блокове, без нито един адрес. */}
          <a
            href={`mailto:${PUBLISHER.emailPrivacy}?subject=${encodeURIComponent(t.streamers.optOutSubject)}`}
            className="flex items-center gap-1.5 text-cyan-300 underline underline-offset-2"
          >
            <Icon group="ui" name="flag" size={15} />
            {t.streamers.optOutCta} — {PUBLISHER.emailPrivacy}
          </a>
          <Link
            href={`/${locale}/privacy`}
            className="flex items-center gap-1.5 text-cyan-300 underline underline-offset-2"
          >
            <Icon group="ui" name="info" size={15} />
            {t.streamers.privacyCta}
          </Link>
        </p>
      </section>

      <JsonLd data={breadcrumbJsonLd(locale, [
              { name: t.nav.servers, path: '/' },
              { name: t.streamers.h1, path: '/streamers' },
            ])} />
    </div>
  );
}

function StreamerCard({
  streamer,
  platform,
  locale,
  t,
}: {
  streamer: PublicStreamer;
  platform: StreamPlatformId;
  locale: 'bg' | 'en';
  t: ReturnType<typeof getDictionary>;
}) {
  return (
    <li className="flex flex-col rounded-xl border border-white/10 bg-ink-900/70 p-4">
      <div className="flex items-center gap-2">
        <Badge name={PLATFORM_BADGE[platform]} size={24} />
        {/* Показваното име идва от чужда платформа — минало е през
            `displayName` при записа, тук се рендира като текст, не като HTML. */}
        <strong className="truncate text-silver-100">{streamer.displayName}</strong>
      </div>

      <p className="mt-2 flex items-center gap-2 text-sm">
        {streamer.live ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-300">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" aria-hidden="true" />
              {t.streamers.live}
            </span>
            <span className="text-silver-400">
              {streamer.viewers} {t.streamers.viewers}
            </span>
          </>
        ) : (
          <span className="text-silver-500">
            {t.streamers.offline}
            {streamer.lastLiveAt && (
              <>
                {' · '}
                {t.streamers.lastLive}{' '}
                <time dateTime={streamer.lastLiveAt.toISOString()}>
                  {streamer.lastLiveAt.toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-GB')}
                </time>
              </>
            )}
          </span>
        )}
      </p>

      {/* Заглавието излиза само след ЧОВЕШКИ преглед — виж `publicStreamerSelect`. */}
      {streamer.reviewedAt && streamer.streamTitle && (
        <p className="mt-2 line-clamp-2 text-sm text-silver-400">{streamer.streamTitle}</p>
      )}

      {/* `nofollow`, защото не предаваме тежест на чужд домейн; `noopener`,
          защото отваряме чужда страница. */}
      <a
        href={streamer.profileUrl}
        rel="noopener nofollow"
        className="mt-auto flex items-center gap-1.5 pt-4 text-sm text-cyan-300 underline underline-offset-2"
      >
        <Icon group="ui" name="external" size={15} />
        {t.streamers.watch} {streamer.displayName}
      </a>
    </li>
  );
}
