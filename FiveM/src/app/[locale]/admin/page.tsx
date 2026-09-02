import Link from 'next/link';
import { resolveLocale } from '@/i18n';

import { Badge } from '@/components/Badge';
import { requireAdminPage } from '@/lib/admin/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function AdminHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  await requireAdminPage(locale);

  const [servers, featured, pendingReviews, pendingSubs, pendingReports, discovered, audit] =
    await Promise.all([
      prisma.server.count({ where: { status: 'APPROVED' } }),
      prisma.server.count({ where: { featuredUntil: { gt: new Date() } } }),
      prisma.review.count({ where: { status: 'PENDING' } }),
      prisma.submission.count({ where: { status: 'PENDING' } }),
      prisma.report.count({ where: { status: 'PENDING' } }),
      prisma.server.count({ where: { source: 'DISCOVERED' } }),
      prisma.auditLog.findMany({ orderBy: { at: 'desc' }, take: 12 }),
    ]);

  const tiles = [
    { badge: 'server', label: 'публични сървъра', value: servers },
    { badge: 'discovered', label: 'открити автоматично', value: discovered },
    { badge: 'vip', label: 'активни промоции', value: featured },
    { badge: 'notification', label: 'чакащи ревюта', value: pendingReviews },
    { badge: 'contact', label: 'чакащи заявки', value: pendingSubs },
    { badge: 'warning', label: 'чакащи сигнали', value: pendingReports },
  ];

  const waiting = pendingReviews + pendingSubs + pendingReports;

  return (
    <div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <li
            key={tile.label}
            className="flex items-center gap-4 rounded-xl border border-white/10 bg-ink-900/70 p-4"
          >
            <Badge name={tile.badge} size={40} />
            <div>
              <p className="text-2xl font-semibold text-silver-100">{tile.value}</p>
              <p className="text-sm text-silver-500">{tile.label}</p>
            </div>
          </li>
        ))}
      </ul>

      {waiting > 0 && (
        <p className="mt-6 rounded-lg border border-cyan-700/40 bg-cyan-900/10 p-4">
          {waiting} неща чакат решение.{' '}
          <Link href={`/${locale}/admin/queue`} className="text-cyan-300 underline underline-offset-2">
            Към опашката
          </Link>
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Дневник на решенията</h2>
        <p className="mt-1 text-sm text-silver-500">
          Всяко решение оставя следа — включително промоциите, защото те са пари.
        </p>
        {audit.length === 0 ? (
          <p className="mt-4 text-silver-400">Още няма записи.</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {audit.map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-x-3 rounded border border-white/10 p-2">
                <time dateTime={entry.at.toISOString()} className="text-silver-500">
                  {entry.at.toLocaleString('bg-BG')}
                </time>
                <span className="text-cyan-300">{entry.action}</span>
                <span className="text-silver-300">{entry.target}</span>
                {entry.detail && <span className="text-silver-500">· {entry.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
