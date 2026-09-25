import React, { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  IconChart, IconBag, IconSkull, IconScroll, IconUser, IconMail, IconCog, IconBolt,
  IconCrown, IconStar, IconShield, IconCoin, IconKey, IconGem, IconFlame,
} from '../../lib/icons';
import { ConfirmProvider, useAdminT } from './ui';
import '../../styles/admin.css';

type Item = { to: string; key: string; icon: typeof IconChart; end?: boolean };
const GROUPS: { key: string; items: Item[] }[] = [
  { key: 'overview', items: [{ to: '/admin', key: 'overview', icon: IconChart, end: true }] },
  { key: 'players', items: [
    { to: '/admin/users', key: 'users', icon: IconUser },
    { to: '/admin/purchases', key: 'purchases', icon: IconCoin },
    { to: '/admin/marketplace', key: 'marketplace', icon: IconBag },
    { to: '/admin/guilds', key: 'guilds', icon: IconCrown },
  ] },
  { key: 'safety', items: [
    { to: '/admin/moderation', key: 'moderation', icon: IconShield },
    { to: '/admin/logs', key: 'logs', icon: IconKey },
  ] },
  { key: 'content', items: [
    { to: '/admin/items', key: 'items', icon: IconGem },
    { to: '/admin/monsters', key: 'monsters', icon: IconSkull },
    { to: '/admin/quests', key: 'quests', icon: IconScroll },
  ] },
  { key: 'features', items: [
    { to: '/admin/tower', key: 'tower', icon: IconFlame },
    { to: '/admin/bounties', key: 'bounties', icon: IconSkull },
    { to: '/admin/battlepass', key: 'battlepass', icon: IconStar },
    { to: '/admin/trial-purchases', key: 'trial', icon: IconStar },
  ] },
  { key: 'system', items: [
    { to: '/admin/settings', key: 'settings', icon: IconCog },
    { to: '/admin/webhooks', key: 'webhooks', icon: IconBolt },
    { to: '/admin/broadcast', key: 'broadcast', icon: IconMail },
    { to: '/admin/server', key: 'server', icon: IconChart },
  ] },
];

export default function AdminLayout(): React.ReactElement {
  const { t } = useAdminT();
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement>(null);
  // Мобилно навигацията е хоризонтална лента — дръж активния чип видим.
  useEffect(() => {
    const a = navRef.current?.querySelector<HTMLElement>('a.active');
    const nav = navRef.current;
    if (!a || !nav || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollTo({ left: a.offsetLeft - nav.clientWidth / 2 + a.offsetWidth / 2, behavior: 'auto' });
  }, [pathname]);
  return (
    <ConfirmProvider>
      <div className="admin-shell">
        <a href="#admin-main" className="adm-skip">{t('skipToContent')}</a>
        <aside className="admin-sidebar">
          <p className="admin-sidebar-title">{t('title')}</p>
          <nav aria-label={t('navLabel')} ref={navRef}>
            {GROUPS.map((g) => (
              <div key={g.key} className="admin-nav-group">
                {g.key !== 'overview' && <p className="admin-nav-label">{t(`groups.${g.key}`)}</p>}
                {g.items.map(({ to, key, icon: Icon, end }) => (
                  <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                    <Icon size={16} aria-hidden="true" /> <span>{t(`nav.${key}`)}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </aside>
        <main className="admin-main" id="admin-main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </ConfirmProvider>
  );
}
