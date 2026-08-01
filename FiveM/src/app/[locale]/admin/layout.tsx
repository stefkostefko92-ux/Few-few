import Link from 'next/link';

import { logoutAction } from '@/app/actions/admin';
import { Badge } from '@/components/Badge';
import { isAdmin } from '@/lib/admin/auth';
import { isLocale } from '@/i18n/config';

// Панелът чете живи данни при всяка заявка и никога не се кешира.
export const dynamic = 'force-dynamic';

/** Панелът не се индексира — и `robots.ts` го забранява, и това го дублира. */
export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : 'bg';
  const authed = await isAdmin();

  const nav = [
    { href: `/${locale}/admin`, label: 'Табло', badge: 'server' },
    { href: `/${locale}/admin/servers`, label: 'Сървъри', badge: 'online' },
    { href: `/${locale}/admin/queue`, label: 'Опашка', badge: 'notification' },
    { href: `/${locale}/admin/streamers`, label: 'Стриймъри', badge: 'twitch' },
    { href: `/${locale}/admin/integrations`, label: 'Интеграции', badge: 'settings' },
  ];

  return (
    <div>
      <div className="flag-rule mb-6 h-[3px] rounded" aria-hidden="true" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="text-chrome">Админ панел</span>
        </h1>
        {authed && (
          <form action={logoutAction}>
            <input type="hidden" name="locale" value={locale} />
            <button className="rounded-lg border border-white/15 px-3 py-1.5 text-sm hover:border-cyan-500">
              Изход
            </button>
          </form>
        )}
      </div>

      {authed && (
        <nav aria-label="Панел" className="mt-5 flex flex-wrap gap-2 text-sm">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 rounded-lg border border-white/15 py-1.5 pe-3 ps-2 hover:border-cyan-500 hover:text-cyan-300"
            >
              <Badge name={item.badge} size={24} />
              {item.label}
            </Link>
          ))}
        </nav>
      )}

      <div className="mt-8">{children}</div>
    </div>
  );
}
