import Link from 'next/link';

import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { PlayerList } from '@/components/PlayerList';

import type { Dictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';
import { formatPlayers, type FrameworkId } from '@/lib/fivem';
import { FRAMEWORK_ICON, STATUS_ICON } from '@/lib/icons';
import { isFeatured, type PublicServer } from '@/lib/servers';

/**
 * Ред от класацията на НАЧАЛНАТА — редакционен, не карта.
 *
 * Различен е от `ServerCard` (каталогът `/servers`) нарочно и двата остават:
 * каталогът дава решетка за сравняване по признаци, началната дава четене
 * отгоре надолу. Смениш ли единия, другият НЕ се мени.
 *
 * Номерът е ДЕКОРАЦИЯ и затова е `aria-hidden`. Причината не е стилова: „01“ до
 * платено промотиран сървър, прочетено на глас, звучи като редакционна оценка
 * „най-добрият“ — твърдение, което не можем да подкрепим (ревютата не са
 * проверени, а подредбата е обявена в условията, не заслужена). Видимо е
 * поредност, обявена точно над списъка; за екранния четец е шум.
 */
export function ServerRow({
  server,
  locale,
  t,
  rank,
}: {
  server: PublicServer;
  locale: Locale;
  t: Dictionary;
  rank: number;
}) {
  const featured = isFeatured(server);
  const status = formatPlayers(
    { outcome: server.lastProbe, players: server.players, maxPlayers: server.maxPlayers },
    t.status,
  );

  return (
    <li className="border-t border-white/10 last:border-b">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 py-5 sm:flex-nowrap sm:gap-x-7">
        <span
          aria-hidden="true"
          className="w-10 shrink-0 text-2xl font-semibold tabular-nums tracking-tight text-ink-700 sm:w-14 sm:text-3xl"
        >
          {String(rank).padStart(2, '0')}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-lg font-semibold tracking-tight sm:text-xl">
            <Link
              href={`/${locale}/servers/${server.slug}`}
              className="rounded transition-colors hover:text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
            >
              {server.name}
            </Link>
            {featured && (
              <span className="flex items-center gap-1 rounded bg-cyan-700/25 px-2 py-0.5 text-xs font-normal text-cyan-200">
                <Icon group="status" name="promoted" size={12} />
                {/* ПЪЛНИЯТ етикет, с думата „платено“: условията обещават точно
                    „промотиран (платено)“ и в списъка, и на страницата, а
                    Прил. I, т. 11а Дир. 2005/29 забранява класиране, платено
                    за по-добро място, без ясно разкриване. Съкратеният ключ
                    крие тъкмо думата, която носи разкритието. */}
                {t.server.promoted}
              </span>
            )}
          </h3>

          {/* Рамката и достъпът са признаците, по които се избира сървър — тук
              вървят като текст в един ред, вместо като чипове: класацията се
              чете отгоре надолу, а решетка от чипове я накъсва. */}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-silver-400">
            {server.tagline && <span className="me-1">{server.tagline}</span>}
            <span className="flex items-center gap-1.5">
              <Badge name={FRAMEWORK_ICON[server.framework as FrameworkId]} size={20} />
              {t.frameworks[server.framework as FrameworkId]}
            </span>
            <span aria-hidden="true" className="text-ink-700">
              ·
            </span>
            <span>{server.whitelist ? t.filters.whitelist : t.server.open}</span>
          </p>
        </div>

        {/* Статусът Е бутонът към „кой играе“ — същият договор като в каталога.
            Едрото число е за онлайн сървър; при офлайн/скрит/недостъпен се
            показва думата, защото „0“ там е лъжа, а не стойност. */}
        <div className="ms-auto shrink-0 text-end text-sm text-silver-300">
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
              server.lastProbe === 'ONLINE' ? (
                <span className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tabular-nums text-cyan-300">
                    {server.players}
                  </span>
                  <span className="tabular-nums text-silver-500">
                    {t.home.outOf} {server.maxPlayers || '?'}
                  </span>
                  {/* Текстовият статус остава достъпен: числото само по себе си
                      не казва „играчи“, а цвят и размер не са информация. */}
                  <span className="sr-only">{status}</span>
                </span>
              ) : (
                <span className="flex items-center gap-2 text-silver-400">
                  <Badge name={STATUS_ICON[server.lastProbe]} size={22} />
                  {status}
                </span>
              )
            }
          />
        </div>

        <Link
          href={`/${locale}/servers/${server.slug}`}
          aria-label={`${server.name} — ${t.home.rowOpen}`}
          className="hidden shrink-0 rounded text-cyan-300 transition-colors hover:text-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 sm:block"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
        </Link>
      </div>
    </li>
  );
}
