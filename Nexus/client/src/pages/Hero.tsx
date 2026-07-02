import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Dashboard from './Dashboard';
import Profile from './Profile';
import CharacterPage from './CharacterPage';
import Inventory from './Inventory';
import Stats from './Stats';

/**
 * Unified "Hero" hub — the five former Main pages (Overview, Profile,
 * Character, Inventory, Statistics) are now tabs of one page. Each tab is
 * a distinct route so deep links + the sidebar still work, but they all
 * render through here so the tab bar stays put and only the body swaps.
 */

const TABS: { to: string; labelKey: string; end?: boolean }[] = [
  { to: '/app', labelKey: 'hero.tabs.overview', end: true },
  { to: '/app/profile', labelKey: 'hero.tabs.profile' },
  { to: '/app/character', labelKey: 'hero.tabs.character' },
  { to: '/app/inventory', labelKey: 'hero.tabs.inventory' },
  { to: '/app/stats', labelKey: 'hero.tabs.statistics' },
];

export default function Hero(): React.ReactElement {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  let body: React.ReactElement;
  if (pathname === '/app') body = <Dashboard />;
  else if (pathname.startsWith('/app/profile')) body = <Profile />;
  else if (pathname.startsWith('/app/character')) body = <CharacterPage />;
  else if (pathname.startsWith('/app/inventory')) body = <Inventory />;
  else if (pathname.startsWith('/app/stats')) body = <Stats />;
  else body = <Dashboard />;

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="hero-tabs">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => `hero-tab ${isActive ? 'active' : ''}`}
          >
            {t(tab.labelKey)}
          </NavLink>
        ))}
      </div>
      {/* No `key={pathname}` — switching tabs should swap the body without
          remounting child components (would lose scroll position, selected
          item, in-flight forms, etc.). */}
      <div>{body}</div>
    </div>
  );
}
