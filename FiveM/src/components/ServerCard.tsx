import Link from 'next/link';

import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { PlayerList } from '@/components/PlayerList';

import type { Dictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';
import { formatPlayers, type FrameworkId } from '@/lib/fivem';
import { FRAMEWORK_ICON, STATUS_ICON, tagIcon } from '@/lib/icons';
import { isFeatured, type PublicServer } from '@/lib/servers';

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
  const status = formatPlayers(
    { outcome: server.lastProbe, players: server.players, maxPlayers: server.maxPlayers },
    t.status,
  );

  return (
    <li
      className={`rounded-xl border bg-ink-900/70 p-4 transition-colors hover:border-cyan-500 ${
        featured ? 'border-cyan-600' : 'border-white/10'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          {/* Рамката е първото, което търси играчът — затова е обемната значка,
              а не 13-пикселова черта, която на този фон изчезва. */}
          <Badge name={FRAMEWORK_ICON[server.framework as FrameworkId]} size={28} />
          <Link href={`/${locale}/servers/${server.slug}`} className="hover:text-cyan-300">
            {server.name}
          </Link>
        </h2>
        {featured && (
          <span className="flex items-center gap-1 rounded bg-cyan-700/25 px-2 py-0.5 text-xs text-cyan-200">
            <Icon group="status" name="promoted" size={12} />
            {t.server.promotedShort}
          </span>
        )}
      </div>

      {server.tagline && <p className="mt-1 text-sm text-silver-400">{server.tagline}</p>}

      {/* Статусът Е бутонът към „кой играе“ — това е и мястото, където
          посетителят гледа бройката. Иконата е декорация: статусът е и текст,
          защото цветът и формата сами по себе си не са информация (WCAG 1.4.1). */}
      <div className="mt-3 text-sm text-silver-300">
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
              <Badge name={STATUS_ICON[server.lastProbe]} size={24} />
              <span>{status}</span>
            </>
          }
        />
      </div>

      <ul className="mt-3 flex flex-wrap gap-2 text-xs text-silver-500">
        <li className="flex items-center gap-1 rounded border border-white/10 px-2 py-0.5">
          {t.frameworks[server.framework as FrameworkId]}
        </li>
        <li className="flex items-center gap-1.5 rounded border border-white/10 px-2 py-0.5">
          <Badge name={server.whitelist ? 'whitelist' : 'open'} size={24} />
          {server.whitelist ? t.filters.whitelist : t.server.open}
        </li>
        {server.tags.slice(0, 4).map((tag) => {
          const icon = tagIcon(tag);
          return (
            <li key={tag} className="flex items-center gap-1.5 rounded border border-white/10 px-2 py-0.5">
              {/* Етикетите са свободен текст — липсваща икона е нормално. */}
              {icon && <Badge name={icon} size={24} />}
              {tag}
            </li>
          );
        })}
      </ul>
    </li>
  );
}
