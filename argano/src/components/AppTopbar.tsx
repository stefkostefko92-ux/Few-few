import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { can } from '@/lib/rbac';
import type { SessionUser } from '@/lib/auth';
import { logoutAction } from '@/server/auth-actions';
import LangSwitch from './LangSwitch';
import NavLinks, { type NavItem } from './NavLinks';

export default async function AppTopbar({ user }: { user: SessionUser }) {
  const t = await getTranslations('nav'), tr = await getTranslations('roles'), locale = await getLocale();
  const items: NavItem[] = [
    { href: '/app', label: t('projects') },
    { href: '/app/norme', label: t('norms') },
    ...(can(user.role, 'users:manage') ? [{ href: '/app/team', label: t('team') }] : []),
    ...(can(user.role, 'audit:view') ? [{ href: '/app/audit', label: t('audit') }] : []),
    ...(can(user.role, 'platform:admin') ? [{ href: '/app/admin', label: t('admin') }] : []),
  ];
  return (
    <header className="topbar">
      <div className="inner">
        <Link href="/app" className="brand"><b>Argano</b><span>{user.companyName}</span></Link>
        <NavLinks items={items} label={t('label')} />
        <div className="userbox">
          <LangSwitch />
          <Link href="/app/account" className="btn btn-sm" title={tr(user.role)}>{user.name}</Link>
          <form action={logoutAction}>
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className="btn btn-sm">{t('logout')}</button>
          </form>
        </div>
      </div>
    </header>
  );
}
