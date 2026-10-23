import Link from 'next/link';

import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { PlayerList } from '@/components/PlayerList';

import type { Dictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';
import { formatPlayers, type FrameworkId } from '@/lib/fivem';
import { FRAMEWORK_ICON, STATUS_ICON, tagIcon } from '@/lib/icons';
import { serverTitle } from '@/lib/server-identity';
import { isFeatured, type PublicServer } from '@/lib/servers';

/**
 * Картата в каталога `/servers` — за СРАВНЯВАНЕ по признаци, затова е решетка
 * (за разлика от таблото на началната, виж `ServerRow`).
 *
 * Цялата карта е цел за клик чрез разтегнат псевдоелемент на ЕДИНСТВЕНАТА
 * връзка (името) — без вложени връзки и без втори таб-стоп. Бутонът „кой играе“
 * стои НАД разтегнатата връзка (`relative z-10`), иначе тя би го покрила.
 */
export function ServerCard({
  server,
  locale,
  t,
}: {
  server: PublicServer;
  locale: Locale;
  t: Dictionary;
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
  const fill = live && server.maxPlayers > 0 ? Math.min(100, (server.players / server.maxPlayers) * 100) : 0;

  return (
    <li
      className={`group relative flex flex-col p-5 transition-[border-color,box-shadow] duration-200 ${
        featured ? 'panel-chrome' : 'panel hover:border-cyan-400/30'
      }`}
    >
      <div className="flex items-start gap-3.5">
        {/* Рамката е първото, което търси играчът — затова е обемната значка. */}
        <Badge name={FRAMEWORK_ICON[server.framework as FrameworkId]} size={40} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[1.0625rem] font-semibold leading-snug tracking-[-0.015em] text-silver-100">
            <Link
              href={`/${locale}/servers/${server.slug}`}
              className="rounded after:absolute after:inset-0 after:rounded-2xl group-hover:text-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
            >
              {title}
            </Link>
          </h2>
          {server.tagline && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-silver-400">{server.tagline}</p>}
        </div>
      </div>

      {featured && (
        <p className="mt-3">
          <span className="tag-promoted">
            <Icon group="status" name="promoted" size={12} />
            {/* Пълният етикет с „платено“ — виж бележката в ServerRow. */}
            {t.server.promoted}
          </span>
        </p>
      )}

      {/* Статусът Е бутонът към „кой играе“. Иконата е декорация: статусът е и
          текст, защото цветът и формата сами не са информация (WCAG 1.4.1). */}
      <div className="relative z-10 mt-auto pt-5 text-sm text-silver-300">
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
              <span className="flex items-center gap-2.5">
                <span className="live-dot" aria-hidden="true" />
                <span className="font-display text-xl font-medium tabular-nums tracking-[-0.02em] text-silver-100">
                  {server.players}
                </span>
                <span className="tabular-nums text-silver-400">
                  / {server.maxPlayers || '?'} {t.status.online}
                </span>
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
      <span className="gauge mt-3" aria-hidden="true">
        {fill > 0 && <span style={{ width: `${Math.max(3, fill)}%` }} />}
      </span>

      <ul className="mt-4 flex flex-wrap gap-1.5">
        <li className="chip">{t.frameworks[server.framework as FrameworkId]}</li>
        <li className="chip">
          <Badge name={server.whitelist ? 'whitelist' : 'open'} size={18} />
          {server.whitelist ? t.filters.whitelist : t.server.open}
        </li>
        {server.tags.slice(0, 3).map((tag) => {
          const icon = tagIcon(tag);
          return (
            <li key={tag} className="chip">
              {/* Етикетите са свободен текст — липсваща икона е нормално. */}
              {icon && <Badge name={icon} size={18} />}
              {tag}
            </li>
          );
        })}
      </ul>
    </li>
  );
}
