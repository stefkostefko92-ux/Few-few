import { getTranslations } from 'next-intl/server';
import { logoutAction } from '@/app/actions/auth';
import { DashSidebar, type DashNavGroup } from '@/components/DashSidebar';
import { LanguageMenu } from '@/components/LanguageMenu';
import { getSessionUser } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { ProfileSwitcher } from '@/components/ProfileSwitcher';
import { AppShell } from '@/components/ui/AppShell';
import { Badge } from '@/components/ui/Badge';
import { Button, buttonStyles } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import {
  BagGlyph,
  BarsGlyph,
  CalendarGlyph,
  ExternalGlyph,
  GiftGlyph,
  LinkGlyph,
  LogOutGlyph,
  MailGlyph,
  PaletteGlyph,
  QrGlyph,
  CardGlyph,
  TranslateGlyph,
  TrendGlyph,
  UserGlyph,
  UsersGlyph,
  BoltGlyph,
  ShieldGlyph,
  KeyGlyph,
} from '@/components/ui/glyphs';
import type { Locale } from '@/i18n/locales';
import { profileUrl } from '@/lib/profile-url';
import { cn } from '@/components/ui/cn';

export type DashPage = 'dashboard' | 'analytics' | 'withdraw' | 'security';

/**
 * Обвивката на таблото: странично меню с групи, горна лента (профил, „Виж
 * страницата“, тема, изход) и чекмедже на мобилно. Ползват я таблото,
 * детайлните аналитики и отказът от договор — едно и също меню навсякъде.
 * На самото табло разделите са котви (#plan, #links …) със scrollspy.
 */
export async function DashShell({
  locale,
  page,
  profiles,
  activeId,
  planId,
  aside,
  children,
}: {
  locale: Locale;
  page: DashPage;
  profiles: { id: string; slug: string }[];
  activeId?: string;
  planId: string;
  /** Дясна колона на широк екран (живият преглед на профила). */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: 'dashboard' });
  const tNav = await getTranslations({ locale, namespace: 'nav' });
  const viewer = await getSessionUser();
  // Мастър акаунт: админът е на един клик от таблото (само за ADMIN_EMAILS).
  const isAdmin = viewer ? isAdminEmail(viewer.email) : false;
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  const active = profiles.find((item) => item.id === activeId);
  const hasProfile = profiles.length > 0;
  const pQuery = active && active.id !== profiles[0]?.id ? `?p=${active.id}` : '';
  const dashBase = `/${locale}/dashboard`;
  const onDash = page === 'dashboard';
  const anchor = (id: string) => (onDash ? `#${id}` : `${dashBase}${pQuery}#${id}`);
  const icon = 'h-full w-full';

  const section = (id: string, label: string, glyph: React.ReactNode) => ({
    href: anchor(id),
    label,
    icon: glyph,
    sectionId: onDash ? id : undefined,
  });

  const groups: DashNavGroup[] = hasProfile
    ? [
        {
          label: t('navGroupProfile'),
          items: [
            section('profile', t('profileSection'), <UserGlyph className={icon} />),
            section('style', t('styleSection'), <PaletteGlyph className={icon} />),
            section('languages', t('translationsSection'), <TranslateGlyph className={icon} />),
            section('links', t('linksSection'), <LinkGlyph className={icon} />),
            section('qr', t('qrSection'), <QrGlyph className={icon} />),
            section('short', t('shortLinksSection'), <BoltGlyph className={icon} />),
          ],
        },
        {
          label: t('navGroupGrowth'),
          items: [
            section('stats', t('statsSection'), <BarsGlyph className={icon} />),
            {
              href: `${dashBase}/analytics${pQuery}`,
              label: t('analyticsTitle'),
              icon: <TrendGlyph className={icon} />,
              page: page === 'analytics',
            },
            section('gap', t('gapSection'), <TranslateGlyph className={icon} />),
            section('messages', t('navMessages'), <MailGlyph className={icon} />),
            section('bookings', t('bookingsSection'), <CalendarGlyph className={icon} />),
            section('audience', t('navAudience'), <UsersGlyph className={icon} />),
          ],
        },
        {
          label: t('navGroupSales'),
          items: [section('shop', t('shopSection'), <BagGlyph className={icon} />)],
        },
        {
          label: t('navGroupAccount'),
          items: [
            {
              href: `${dashBase}/security`,
              label: t('navSecurity'),
              icon: <KeyGlyph className={icon} />,
              page: page === 'security',
            },
            section('referral', t('referralSection'), <GiftGlyph className={icon} />),
            { ...section('plan', t('planSection'), <CardGlyph className={icon} />), page: page === 'withdraw' },
          ],
        },
      ]
    : [{ items: [{ href: dashBase, label: t('navHome'), icon: <UserGlyph className={icon} />, page: true }] }];

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

  const sidebar = (
    <DashSidebar
      ariaLabel={t('title')}
      scrollspy={onDash}
      brand={
        <a href={`/${locale}`} aria-label={tCommon('appName')} className="focus-ring -ms-1 inline-block rounded-control px-1 py-1">
          <Logo name={tCommon('appName')} />
        </a>
      }
      groups={groups}
      footer={
        <div className="space-y-3">
          <a
            href={anchor('plan')}
            className="focus-ring flex items-center justify-between gap-2 rounded-control px-2.5 py-1.5 text-small text-fg-2 hover:bg-surface-3"
          >
            <span>{t('currentPlan')}</span>
            <Badge tone={planId === 'FREE' ? 'neutral' : 'accent'}>{planId}</Badge>
          </a>
          <div className="space-y-2 md:hidden">
            <ThemeToggle labels={themeLabels} className="flex w-full" />
            {logout}
          </div>
        </div>
      }
    />
  );

  const topbar = (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        {profiles.length > 1 ? (
          <ProfileSwitcher
            label={t('profilesLabel')}
            options={profiles}
            value={active?.id}
            basePath={`${dashBase}${page === 'analytics' ? '/analytics' : ''}`}
          />
        ) : (
          <p className="truncate text-body font-semibold text-fg">
            {active ? `/${active.slug}` : t('title')}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isAdmin && (
          <a
            href={`/${locale}/admin`}
            className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'gap-1.5 border-accent text-accent-text' })}
          >
            <ShieldGlyph className="h-4 w-4" />
            <span className="hidden sm:inline">{tNav('admin')}</span>
            <span className="sr-only sm:hidden">{tNav('admin')}</span>
          </a>
        )}
        {/* Езикът на таблото — винаги видим (запазва профила и раздела). */}
        <div className="rounded-control border border-line bg-surface">
          <LanguageMenu locale={locale} label={tNav('language')} withName />
        </div>
        {active && (
          <a
            href={profileUrl(active.slug)}
            target="_blank"
            rel="noopener"
            className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'gap-1.5' })}
          >
            <ExternalGlyph className="h-4 w-4" />
            <span className="hidden sm:inline">{t('viewPage')}</span>
            <span className="sr-only sm:hidden">{t('viewPage')}</span>
          </a>
        )}
        <div className={cn('hidden items-center gap-2 md:flex')}>
          <ThemeToggle labels={themeLabels} />
          {logout}
        </div>
      </div>
    </div>
  );

  return (
    <AppShell
      sidebar={sidebar}
      topbar={topbar}
      labels={{ open: tNav('menu'), close: tNav('closeMenu') }}
    >
      <a
        href="#main"
        className="focus-ring absolute start-4 top-2 z-50 -translate-y-20 rounded-control bg-surface px-3 py-2 text-small font-semibold text-fg shadow-e3 focus:translate-y-0"
      >
        {tNav('skip')}
      </a>
      {aside ? (
        <main
          id="main"
          className="dash mx-auto grid w-full max-w-[90rem] gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]"
        >
          <div className="min-w-0">{children}</div>
          <div className="min-w-0">{aside}</div>
        </main>
      ) : (
        <main id="main" className="dash mx-auto w-full max-w-4xl">
          {children}
        </main>
      )}
    </AppShell>
  );
}
