import Link from 'next/link';

import { FRAMEWORK_LABEL, formatPlayers, type FrameworkId } from '@/lib/fivem';
import { isFeatured, type PublicServer } from '@/lib/servers';

function StatusDot({ online }: { online: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 rounded-full ${online ? 'bg-fivem-400' : 'bg-slate-600'}`}
    />
  );
}

export function ServerCard({ server }: { server: PublicServer }) {
  const featured = isFeatured(server);
  const status = formatPlayers({
    outcome: server.lastProbe,
    players: server.players,
    maxPlayers: server.maxPlayers,
  });

  return (
    <li
      className={`rounded-xl border bg-fivem-900/60 p-4 transition-colors hover:border-fivem-500 ${
        featured ? 'border-fivem-600' : 'border-white/10'
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">
          <Link href={`/servers/${server.slug}`} className="hover:text-fivem-400">
            {server.name}
          </Link>
        </h2>
        {featured && (
          <span className="rounded bg-fivem-600/20 px-2 py-0.5 text-xs text-fivem-400">промотиран</span>
        )}
      </div>

      {server.tagline && <p className="mt-1 text-sm text-slate-300">{server.tagline}</p>}

      <p className="mt-3 flex items-center gap-2 text-sm text-slate-300">
        <StatusDot online={server.online} />
        {/* Статусът е дублиран текстово — цветът сам по себе си не е информация (WCAG 1.4.1). */}
        <span>{status}</span>
      </p>

      <ul className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
        <li className="rounded border border-white/10 px-2 py-0.5">
          {FRAMEWORK_LABEL[server.framework as FrameworkId]}
        </li>
        <li className="rounded border border-white/10 px-2 py-0.5">
          {server.whitelist ? 'whitelist' : 'без whitelist'}
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
