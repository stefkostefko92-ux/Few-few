import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import World from './World';
import Quests from './Quests';

/**
 * The Realm hub merges the World Map and the Quest log into one page with
 * two tabs. Both /app/world and /app/quests route here; the tab is chosen
 * from the path so existing links and the sidebar keep working.
 */

const TABS: { to: string; label: string }[] = [
  { to: '/app/world', label: 'World Map' },
  { to: '/app/quests', label: 'Quests' },
];

export default function Realm(): React.ReactElement {
  const { pathname } = useLocation();
  const body = pathname.startsWith('/app/quests') ? <Quests /> : <World />;

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="hero-tabs">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => `hero-tab ${isActive ? 'active' : ''}`}>
            {t.label}
          </NavLink>
        ))}
      </div>
      <div>{body}</div>
    </div>
  );
}
