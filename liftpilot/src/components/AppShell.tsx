import type { ReactNode } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { PROFILO } from '@/calc/norme';
import { can } from '@/lib/rbac';
import type { SessionUser } from '@/lib/auth';
import { billingConfigured } from '@/lib/billing-config';
import { EMBLEM } from '@/lib/brand';
import { initials } from '@/lib/dashboard';
import { logoutAction } from '@/server/auth-actions';
import Icon from './Icon';
import LangSwitch from './LangSwitch';
import NavLinks, { ShellLink, type NavGroup, type NavItem } from './NavLinks';
import { DrawerPanel, DrawerRoot, DrawerToggle } from './shell/Drawer';
import ShellCrumbs from './shell/ShellCrumbs';
import ShellSearch from './shell/ShellSearch';

function Emblem() {
  // eslint-disable-next-line @next/next/no-img-element -- prebuilt sizes with a srcset (scripts/brand-assets.py)
  return <img src={EMBLEM.src} srcSet={EMBLEM.srcSet} width={EMBLEM.width} height={EMBLEM.height} alt="" decoding="async" />;
}

// The application's workspace (the template's workspace.html): a fixed sidebar with the brand, the sections in groups
// by the user's rights (can), the user's card with the account, the language and sign-out, and the beta and the
// standards profile; a top bar with the path, the search of the installations and the user. Below 1024 px the sidebar
// is a drawer the top bar's button opens (shell/Drawer). The page, the banners and the footer are the main column.
// No bell: the application has no notifications to show.
export default async function AppShell({ user, banners, footer, children }: { user: SessionUser; banners: ReactNode; footer: ReactNode; children: ReactNode }) {
  const [t, tp, tr, ta, tl, locale] = await Promise.all([
    getTranslations('nav'), getTranslations('projects'), getTranslations('roles'), getTranslations('account'), getTranslations('legal'), getLocale(),
  ]);
  const work: NavItem[] = [
    { key: 'dashboard', href: '/app', label: t('dashboard'), icon: 'layout-dashboard' },
    ...(can(user, 'projects:edit') ? [
      { key: 'new-replacement', href: '/app/projects/new?kind=replacement', label: tp('module_REPLACEMENT_new'), icon: 'motor' } as const,
      { key: 'new-full', href: '/app/projects/new?kind=full', label: tp('module_FULL_new'), icon: 'elevator' } as const,
    ] : []),
    { key: 'archived', href: '/app?archived=1', label: tp('archivedTitle'), icon: 'archive' },
  ];
  const library: NavItem[] = [
    { key: '/app/norme', href: '/app/norme', label: t('norms'), icon: 'shield-check' },
    ...(can(user, 'prices:view') ? [{ key: '/app/prices', href: '/app/prices', label: t('prices'), icon: 'tag' } as const] : []),
  ];
  const manage: NavItem[] = [
    ...(can(user, 'users:manage') ? [{ key: '/app/team', href: '/app/team', label: t('team'), icon: 'users' } as const] : []),
    ...(can(user, 'company:export') ? [{ key: '/app/company', href: '/app/company', label: t('company'), icon: 'building' } as const] : []),
    ...(can(user, 'billing:manage') ? [{ key: '/app/billing', href: '/app/billing', label: t('billing'), icon: 'hand-coins' } as const] : []),
    ...(can(user, 'audit:view') ? [{ key: '/app/audit', href: '/app/audit', label: t('audit'), icon: 'history' } as const] : []),
    ...(can(user, 'platform:admin') ? [{ key: '/app/admin', href: '/app/admin', label: t('admin'), icon: 'building-gear' } as const] : []),
  ];
  const groups: NavGroup[] = [
    { label: t('groupWork'), items: work },
    { label: t('groupLibrary'), items: library },
    ...(manage.length ? [{ label: t('groupAdmin'), items: manage }] : []),
  ];
  // pages outside the groups the top bar still names
  const extra = [{ key: '/app/account', label: ta('title') }, { key: '/app/terms', label: tl('gateTitleNew') }];
  const role = tr(user.role), avatar = <span className="avatar" aria-hidden="true">{initials(user.name)}</span>;
  const who = `${user.name} · ${role} · ${user.companyName}`, beta = !billingConfigured();
  return (
    <DrawerRoot>
      <a className="skip-link" href="#main">{t('skip')}</a>
      <div className="ws-shell">
        <DrawerPanel label={t('menu')} closeLabel={t('close')}>
          <Link href="/app" className="ws-brand"><Emblem /><span>LiftPilot</span></Link>
          <div className="ws-rule" />
          <div className="ws-scroll">
            <NavLinks groups={groups} label={t('label')} />
          </div>
          <div className="ws-bottom">
            <ShellLink href="/app/account" className="ws-user" title={who}>
              {avatar}
              <span className="ws-who"><b>{user.name}</b><small>{role}</small><small className="ws-company">{user.companyName}</small></span>
              <Icon name="user-cog" size={18} />
            </ShellLink>
            <div className="ws-user-actions">
              <LangSwitch />
              <form action={logoutAction} className="ws-logout">
                <input type="hidden" name="locale" value={locale} />
                <button type="submit" className="btn btn-sm btn-ghost"><Icon name="log-out" size={16} />{t('logout')}</button>
              </form>
            </div>
            {/* the free beta while billing is off (src/lib/billing-config.ts), and the standards profile of the engines */}
            <p className="ws-beta">
              {beta ? <span>{t('beta')}</span> : null}
              <span className="ws-profile"><span className={beta ? 'sr-only' : undefined}>{t('profile')} </span>{PROFILO.id}</span>
            </p>
          </div>
        </DrawerPanel>
        <div className="ws-main">
          <header className="ws-topbar">
            <DrawerToggle openLabel={t('menu')} closeLabel={t('close')} />
            <Link href="/app" className="ws-topbrand"><Emblem /><span>LiftPilot</span></Link>
            <ShellCrumbs groups={groups} extra={extra} label={t('breadcrumb')} />
            <div className="ws-top-actions">
              <ShellSearch label={t('search')} placeholder={t('searchPlaceholder')} />
              <ShellLink href="/app/account" className="ws-user-top" title={who}>
                {avatar}
                <span className="ws-who"><b>{user.name}</b><small>{role}</small></span>
              </ShellLink>
            </div>
          </header>
          {banners}
          <div id="main" className="ws-content" tabIndex={-1}>{children}</div>
          {footer}
        </div>
      </div>
    </DrawerRoot>
  );
}
