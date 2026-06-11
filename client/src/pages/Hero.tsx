import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
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

const TABS: { to: string; label: string; end?: boolean }[] = [
  { to: '/app', label: 'Overview', end: true },
  { to: '/app/profile', label: 'Profile' },
  { to: '/app/character', label: 'Character' },
  { to: '/app/inventory', label: 'Inventory' },
  { to: '/app/stats', label: 'Statistics' },
];

export default function Hero(): React.ReactElement {
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
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => `hero-tab ${isActive ? 'active' : ''}`}
          >
            {t.label}
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
