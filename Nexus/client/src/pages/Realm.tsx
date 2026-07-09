import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import World from './World';
import Quests from './Quests';

/**
 * The Realm hub merges the World Map and the Quest log into one page with
 * two tabs. Both /app/world and /app/quests route here; the tab is chosen
 * from the path so existing links and the sidebar keep working.
 */

const TABS: { to: string; labelKey: string }[] = [
  { to: '/app/world', labelKey: 'realm.tabs.worldMap' },
  { to: '/app/quests', labelKey: 'realm.tabs.quests' },
];

export default function Realm(): React.ReactElement {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const body = pathname.startsWith('/app/quests') ? <Quests /> : <World />;

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="hero-tabs">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `hero-tab ${isActive ? 'active' : ''}`}>
            {t(tab.labelKey)}
          </NavLink>
        ))}
      </div>
      <div>{body}</div>
    </div>
  );
}
