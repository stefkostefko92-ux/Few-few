import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { can } from '@/lib/rbac';
import type { SessionUser } from '@/lib/auth';
import { logoutAction } from '@/server/auth-actions';
import Brand from './Brand';
import LangSwitch from './LangSwitch';
import NavLinks, { type NavItem } from './NavLinks';

// Wide screens: sections, language, account and sign-out in one row. Phones: the same in a menu, so the header
// stays one row high and the page keeps the screen.
export default async function AppTopbar({ user }: { user: SessionUser }) {
  const t = await getTranslations('nav'), tr = await getTranslations('roles'), locale = await getLocale();
  const items: NavItem[] = [
    { href: '/app', label: t('projects') },
    { href: '/app/norme', label: t('norms') },
    ...(can(user, 'users:manage') ? [{ href: '/app/team', label: t('team') }] : []),
    ...(can(user, 'prices:view') ? [{ href: '/app/prices', label: t('prices') }] : []),
    ...(can(user, 'company:edit') ? [{ href: '/app/company', label: t('company') }] : []),
    ...(can(user, 'billing:manage') ? [{ href: '/app/billing', label: t('billing') }] : []),
    ...(can(user, 'audit:view') ? [{ href: '/app/audit', label: t('audit') }] : []),
    ...(can(user, 'platform:admin') ? [{ href: '/app/admin', label: t('admin') }] : []),
  ];
  const logout = (
    <form action={logoutAction}>
      <input type="hidden" name="locale" value={locale} />
      <button type="submit" className="btn btn-sm">{t('logout')}</button>
    </form>
  );
  return (
    <header className="topbar">
      <div className="inner">
        <Brand href="/app" sub={user.companyName} />
        <div className="bar-wide">
          <NavLinks items={items} label={t('label')} />
          <div className="userbox">
            <LangSwitch />
            <Link href="/app/account" className="btn btn-sm" title={tr(user.role)}>{user.name}</Link>
            {logout}
          </div>
        </div>
        <details className="menu">
          <summary><span className="burger" aria-hidden="true" />{t('menu')}</summary>
          <div className="menu-panel">
            <NavLinks items={items} label={t('label')} />
            <div className="menu-foot">
              <Link href="/app/account" className="who"><b>{user.name}</b><span>{tr(user.role)} · {user.companyName}</span></Link>
              <LangSwitch />
              {logout}
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}
