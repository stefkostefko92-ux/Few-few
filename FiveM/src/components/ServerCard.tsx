import Link from 'next/link';

import type { Dictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';
import { FRAMEWORK_LABEL, formatPlayers, type FrameworkId } from '@/lib/fivem';
import { isFeatured, type PublicServer } from '@/lib/servers';

function StatusDot({ online }: { online: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 rounded-full ${online ? 'bg-cyan-300' : 'bg-silver-600'}`}
    />
  );
}

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
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">
          <Link href={`/${locale}/servers/${server.slug}`} className="hover:text-cyan-300">
            {server.name}
          </Link>
        </h2>
        {featured && (
          <span className="rounded bg-cyan-700/25 px-2 py-0.5 text-xs text-cyan-200">
            {t.server.promotedShort}
          </span>
        )}
      </div>

      {server.tagline && <p className="mt-1 text-sm text-silver-400">{server.tagline}</p>}

      <p className="mt-3 flex items-center gap-2 text-sm text-silver-300">
        <StatusDot online={server.online} />
        {/* Статусът е дублиран текстово — цветът сам по себе си не е информация (WCAG 1.4.1). */}
        <span>{status}</span>
      </p>

      <ul className="mt-3 flex flex-wrap gap-2 text-xs text-silver-500">
        <li className="rounded border border-white/10 px-2 py-0.5">
          {FRAMEWORK_LABEL[server.framework as FrameworkId]}
        </li>
        <li className="rounded border border-white/10 px-2 py-0.5">
          {server.whitelist ? t.filters.whitelist : t.server.open}
        </li>
        {server.tags.slice(0, 4).map((tag) => (
          <li key={tag} className="rounded border border-white/10 px-2 py-0.5">
            {tag}
          </li>
        ))}
      </ul>
    </li>
  );
}
