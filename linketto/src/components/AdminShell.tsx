import { getTranslations } from 'next-intl/server';
import { logoutAction } from '@/app/actions/auth';
import { DashSidebar, type DashNavGroup } from '@/components/DashSidebar';
import { AppShell } from '@/components/ui/AppShell';
import { Badge } from '@/components/ui/Badge';
import { Button, buttonStyles } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import {
  AlertGlyph,
  BarsGlyph,
  CardGlyph,
  ExternalGlyph,
  GiftGlyph,
  LogOutGlyph,
  UsersGlyph,
  XCircleGlyph,
} from '@/components/ui/glyphs';
import type { Locale } from '@/i18n/locales';

/** Броячите в менюто — само от данни, които страницата вече зарежда. */
export interface AdminCounts {
  reports: number;
  moderated: number;
  /** Платени поръчки, чакащи действие (неприложени / чакащи връщане) */
  ordersAction: number;
  payouts: number;
  users: number;
}

/**
 * Обвивката на админ панела — същият модел като DashShell (AppShell +
 * DashSidebar със scrollspy по котви), с групи за собственика: Обзор,
 * Модерация, Плащания, Хора. Горе: значка „Админ“, тема, към таблото,
 * към сайта, изход.
 */
export async function AdminShell({
  locale,
  counts,
  children,
}: {
  locale: Locale;
  counts: AdminCounts;
  children: React.ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: 'admin' });
  const tNav = await getTranslations({ locale, namespace: 'nav' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const icon = 'h-full w-full';

  const count = (value: number, tone: 'warning' | 'danger' | 'neutral' = 'neutral') =>
    value > 0 ? (
      <Badge tone={tone} className="tabular-nums" aria-label={String(value)}>
        {value}
      </Badge>
    ) : undefined;

  const groups: DashNavGroup[] = [
    {
      label: t('navGroupOverview'),
      items: [{ href: '#stats', label: t('navStats'), icon: <BarsGlyph className={icon} />, sectionId: 'stats' }],
    },
    {
      label: t('navGroupModeration'),
      items: [
        {
          href: '#reports',
          label: t('navReports'),
          icon: <AlertGlyph className={icon} />,
          sectionId: 'reports',
          badge: count(counts.reports, 'warning'),
        },
        {
          href: '#moderated',
          label: t('navModerated'),
          icon: <XCircleGlyph className={icon} />,
          sectionId: 'moderated',
          badge: count(counts.moderated),
        },
      ],
    },
    {
      label: t('navGroupPayments'),
      items: [
        {
          href: '#orders',
          label: t('navOrders'),
          icon: <CardGlyph className={icon} />,
          sectionId: 'orders',
          badge: count(counts.ordersAction, 'danger'),
        },
        {
          href: '#payouts',
          label: t('navPayouts'),
          icon: <GiftGlyph className={icon} />,
          sectionId: 'payouts',
          badge: count(counts.payouts, 'warning'),
        },
      ],
    },
    {
      label: t('navGroupPeople'),
      items: [
        {
          href: '#users',
          label: t('navUsers'),
          icon: <UsersGlyph className={icon} />,
          sectionId: 'users',
          badge: count(counts.users),
        },
      ],
    },
  ];

  const themeLabels = {
    group: tNav('theme'),
    light: tNav('themeLight'),
    dark: tNav('themeDark'),
    system: tNav('themeSystem'),
  };
  const logout = (
    <form action={logoutAction}>
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="ghost" size="sm" className="gap-1.5">
        <LogOutGlyph className="h-4 w-4" />
        {tNav('logout')}
      </Button>
    </form>
  );
  const linkClass = buttonStyles({ variant: 'secondary', size: 'sm', className: 'gap-1.5' });

  const sidebar = (
    <DashSidebar
      ariaLabel={t('title')}
      scrollspy
      brand={
        <a
          href={`/${locale}`}
          aria-label={tCommon('appName')}
          className="focus-ring -ms-1 inline-block rounded-control px-1 py-1"
        >
          <Logo name={tCommon('appName')} />
        </a>
      }
      groups={groups}
      footer={
        <div className="space-y-2 md:hidden">
          <a href={`/${locale}/dashboard`} className={buttonStyles({ variant: 'secondary', size: 'sm', block: true })}>
            {t('toDashboard')}
          </a>
          <ThemeToggle labels={themeLabels} className="flex w-full" />
          {logout}
        </div>
      }
    />
  );

  const topbar = (
    <div className="flex items-center justify-between gap-3">
      <Badge tone="danger" dot>
        {t('adminBadge')}
      </Badge>
      <div className="flex shrink-0 items-center gap-2">
        <a href={`/${locale}/dashboard`} className={`${linkClass} hidden md:inline-flex`}>
          {t('toDashboard')}
        </a>
        <a href={`/${locale}`} className={linkClass}>
          <ExternalGlyph className="h-4 w-4" />
          <span className="hidden sm:inline">{t('toSite')}</span>
          <span className="sr-only sm:hidden">{t('toSite')}</span>
        </a>
        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle labels={themeLabels} />
          {logout}
        </div>
      </div>
    </div>
  );

  return (
    <AppShell sidebar={sidebar} topbar={topbar} labels={{ open: tNav('menu'), close: tNav('closeMenu') }}>
      <a
        href="#main"
        className="focus-ring absolute start-4 top-2 z-50 -translate-y-20 rounded-control bg-surface px-3 py-2 text-small font-semibold text-fg shadow-e3 focus:translate-y-0"
      >
        {tNav('skip')}
      </a>
      <main id="main" className="dash mx-auto w-full max-w-5xl">
        {children}
      </main>
    </AppShell>
  );
}
