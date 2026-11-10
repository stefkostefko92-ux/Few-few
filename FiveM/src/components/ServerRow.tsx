import Link from 'next/link';

import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { PlayerList } from '@/components/PlayerList';

import type { Dictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';
import { formatPlayers, type FrameworkId } from '@/lib/fivem';
import { FRAMEWORK_ICON, STATUS_ICON } from '@/lib/icons';
import { serverTitle } from '@/lib/server-identity';
import { isFeatured, type PublicServer } from '@/lib/servers';

/**
 * Ред от ЖИВОТО ТАБЛО на началната — редакционен, не карта.
 *
 * Различен е от `ServerCard` (каталогът `/servers`) нарочно и двата остават:
 * каталогът дава решетка за сравняване по признаци, таблото дава четене
 * отгоре надолу, като табло на гара. Смениш ли единия, другият НЕ се мени.
 *
 * Номерът е ВИДИМ (silver-600, 4,1:1 върху ink-950 — едър текст), но е
 * `aria-hidden` за екранния четец. Причината не е стилова: „01“ до платено
 * промотиран сървър, прочетено на глас, звучи като редакционна оценка
 * „най-добрият“ — твърдение, което не можем да подкрепим (ревютата не са
 * проверени, а подредбата е обявена в условията, не заслужена).
 *
 * Редът „пристига“ с отместване по индекс — единственото оркестрирано движение
 * на сайта. При `prefers-reduced-motion` анимацията я няма изобщо (globals.css),
 * не само е скъсена: иначе редовете чакат закъснението си невидими.
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
  // Марката, не суровият hostname с рекламата — същото име като на страницата
  // и в ItemList JSON-LD.
  const title = serverTitle(server.name, 60, t.server.fallbackName);
  const status = formatPlayers(
    { outcome: server.lastProbe, players: server.players, maxPlayers: server.maxPlayers },
    t.status,
  );
  const live = server.lastProbe === 'ONLINE';
  // Запълването е факт от двете числа, не оценка; без слотове уредът няма смисъл.
  const fill = live && server.maxPlayers > 0 ? Math.min(100, (server.players / server.maxPlayers) * 100) : 0;

  return (
    <li
      className="animate-board-in border-t border-white/[0.06] first:border-t-0"
      style={{ animationDelay: `${120 + rank * 70}ms` }}
    >
      <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3.5 transition-colors hover:bg-white/[0.025] sm:grid-cols-[2.25rem_minmax(0,1fr)_auto] sm:gap-x-4 sm:px-5 sm:py-4">
        <span
          aria-hidden="true"
          className="font-display text-lg font-medium tabular-nums tracking-[-0.02em] text-silver-600 sm:text-xl"
        >
          {String(rank).padStart(2, '0')}
        </span>

        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Link
              href={`/${locale}/servers/${server.slug}`}
              className="truncate rounded text-[1.0625rem] font-semibold tracking-[-0.01em] text-silver-100 transition-colors hover:text-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 sm:text-lg"
            >
              {title}
            </Link>
            {featured && (
              <span className="tag-promoted">
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
              вървят като текст в един ред, вместо като чипове: таблото се
              чете отгоре надолу, а решетка от чипове го накъсва. */}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.8125rem] text-silver-400 sm:text-sm">
            <span className="flex items-center gap-1.5">
              <Badge name={FRAMEWORK_ICON[server.framework as FrameworkId]} size={20} />
              {t.frameworks[server.framework as FrameworkId]}
            </span>
            <span aria-hidden="true" className="text-silver-600">
              ·
            </span>
            <span>{server.whitelist ? t.filters.whitelist : t.server.open}</span>
          </p>
        </div>

        {/* Статусът Е бутонът към „кой играе“ — същият договор като в каталога.
            Едрото число е за онлайн сървър; при офлайн/скрит/недостъпен се
            показва думата, защото „0“ там е лъжа, а не стойност. */}
        <div className="flex flex-col items-end gap-1.5 text-end text-sm text-silver-300">
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
              live ? (
                <span className="flex items-baseline gap-1.5">
                  <span className="font-display text-xl font-medium tabular-nums tracking-[-0.02em] text-cyan-300 sm:text-2xl">
                    {server.players}
                  </span>
                  <span className="text-xs tabular-nums text-silver-500">
                    {t.home.outOf} {server.maxPlayers || '?'}
                  </span>
                  {/* Текстовият статус остава достъпен: числото само по себе си
                      не казва „играчи“, а цвят и размер не са информация. */}
                  <span className="sr-only">{status}</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-silver-400">
                  <Badge name={STATUS_ICON[server.lastProbe]} size={20} />
                  {status}
                </span>
              )
            }
          />
          {live && server.maxPlayers > 0 && (
            <span className="gauge w-20 sm:w-28" aria-hidden="true">
              <span style={{ width: `${Math.max(3, fill)}%` }} />
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
