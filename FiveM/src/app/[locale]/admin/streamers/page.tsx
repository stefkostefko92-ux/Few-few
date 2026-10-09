import { resolveLocale } from '@/i18n';

import { addStreamerAction, moderateStreamerAction } from '@/app/actions/admin';
import { Badge } from '@/components/Badge';
import { requireAdminPage } from '@/lib/admin/auth';
import { prisma } from '@/lib/db';
import { PLATFORM_BADGE, STREAM_PLATFORMS, type StreamPlatformId } from '@/lib/streamers';

export const dynamic = 'force-dynamic';

const input = 'w-full rounded border border-white/15 bg-ink-900 px-2 py-1 text-sm text-silver-100';
const button = 'rounded border border-white/15 px-3 py-1 text-sm hover:border-cyan-500';

const STATUS_LABEL: Record<string, string> = {
  APPROVED: 'публичен',
  PENDING: 'чака преглед',
  REJECTED: 'свален по възражение',
};

export default async function AdminStreamers({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  await requireAdminPage(locale);

  const streamers = await prisma.streamer.findMany({
    // Чакащите са най-отгоре: те са работата, която панелът дължи на човека.
    orderBy: [{ status: 'asc' }, { live: 'desc' }, { viewers: 'desc' }, { displayName: 'asc' }],
    take: 200,
  });
  const pending = streamers.filter((streamer) => streamer.status === 'PENDING').length;

  return (
    <div>
      <p className="rounded-lg border border-cyan-700/40 bg-cyan-900/10 p-4 text-sm text-silver-300">
        Тук има <strong>лични данни</strong> на реални хора. „Свален по възражение“ (чл. 21 ОРЗД) е
        записът, който спира автоматичното откриване да го върне — <strong>не изтривай</strong>
        {' '}вместо това, защото изтрит запис се появява пак при следващия пробег на cron-а.
        Обещаният срок е 72 часа.
      </p>

      <p className="mt-3 text-sm text-silver-500">
        Показани {streamers.length}
        {pending > 0 && (
          <>
            {' · '}
            <strong className="text-cyan-300">{pending} чакат преглед</strong>
          </>
        )}
        . YouTube никога не влиза публично автоматично — платформата не обявява език на излъчването.
      </p>

      <section className="mt-8 max-w-xl rounded-xl border border-white/10 bg-ink-900/70 p-4">
        <h2 className="text-lg font-medium text-silver-100">Добави ръчно</h2>
        <p className="mt-1 text-sm text-silver-500">
          Единственият път за TikTok: платформата няма публично откриване на живи излъчвания.
          Приема се цял адрес, „@име“ или голо име.
        </p>
        <form action={addStreamerAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-silver-500">Платформа</span>
            <select name="platform" defaultValue="TIKTOK" className={input}>
              {STREAM_PLATFORMS.map((platform) => (
                <option key={platform} value={platform}>
                  {platform}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-silver-500">Канал</span>
            <input name="channel" required maxLength={200} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-silver-500">Показвано име (по избор)</span>
            <input name="displayName" maxLength={80} className={input} />
          </label>
          <div className="sm:col-span-2">
            <button className="rounded bg-cyan-500 px-3 py-1 font-medium text-ink-950 hover:bg-cyan-400">
              Добави
            </button>
          </div>
        </form>
      </section>

      <ul className="mt-8 space-y-3">
        {streamers.map((streamer) => (
          <li key={streamer.id} className="rounded-xl border border-white/10 bg-ink-900/70 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge name={PLATFORM_BADGE[streamer.platform as StreamPlatformId]} size={28} />
              <strong className="text-silver-100">{streamer.displayName}</strong>
              <code className="text-xs text-silver-500">
                {streamer.platform}/{streamer.channel}
              </code>
              <span
                className={
                  streamer.status === 'APPROVED'
                    ? 'rounded bg-cyan-700/25 px-2 py-0.5 text-xs text-cyan-200'
                    : 'rounded border border-white/15 px-2 py-0.5 text-xs text-silver-400'
                }
              >
                {STATUS_LABEL[streamer.status]}
              </span>
              {streamer.live && (
                <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-300">
                  НА ЖИВО · {streamer.viewers}
                </span>
              )}
              {streamer.manual && (
                <span className="rounded border border-white/15 px-2 py-0.5 text-xs text-silver-500">
                  ръчен
                </span>
              )}
              {streamer.language && (
                <span className="text-xs text-silver-500">език: {streamer.language}</span>
              )}
            </div>

            {streamer.streamTitle && (
              <p className="mt-2 text-sm text-silver-400">{streamer.streamTitle}</p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {(['APPROVED', 'PENDING', 'REJECTED'] as const)
                .filter((decision) => decision !== streamer.status)
                .map((decision) => (
                  <form key={decision} action={moderateStreamerAction}>
                    <input type="hidden" name="id" value={streamer.id} />
                    <input type="hidden" name="decision" value={decision} />
                    <button className={button}>{STATUS_LABEL[decision]}</button>
                  </form>
                ))}
              <a
                href={streamer.profileUrl}
                rel="noopener nofollow"
                className="rounded border border-white/15 px-3 py-1 text-sm text-cyan-300 hover:border-cyan-500"
              >
                Отвори канала
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
