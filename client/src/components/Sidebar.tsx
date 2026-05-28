import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  IconHome,
  IconScroll,
  IconSword,
  IconBag,
  IconCoin,
  IconMap,
  IconCrown,
  IconUser,
  IconMail,
} from '../lib/icons';
import { useStore } from '../lib/store';

const sections = [
  {
    heading: 'Main',
    items: [
      { to: '/app', label: 'Overview', icon: IconHome, end: true },
      { to: '/app/character', label: 'Character', icon: IconUser },
      { to: '/app/inventory', label: 'Inventory', icon: IconBag },
    ],
  },
  {
    heading: 'Adventure',
    items: [
      { to: '/app/quests', label: 'Quests', icon: IconScroll },
      { to: '/app/world', label: 'World Map', icon: IconMap },
      { to: '/app/arena', label: 'Arena', icon: IconSword },
      { to: '/app/history', label: 'Battle History', icon: IconSword },
    ],
  },
  {
    heading: 'Town',
    items: [
      { to: '/app/shop', label: 'Merchant', icon: IconCoin },
      { to: '/app/mail', label: 'Mail', icon: IconMail, badgeKey: 'mail' as const },
      { to: '/app/leaderboard', label: 'Hall of Fame', icon: IconCrown },
    ],
  },
  {
    heading: 'Account',
    items: [
      { to: '/app/help', label: 'How to Play', icon: IconScroll },
      { to: '/app/settings', label: 'Settings', icon: IconUser },
    ],
  },
];

export default function Sidebar(): React.ReactElement {
  const char = useStore((s) => s.character);
  const unreadMail = useStore((s) => s.unreadMail);

  return (
    <aside className="sidebar">
      {sections.map((sec) => (
        <div key={sec.heading} className="sidebar-section">
          <div className="sidebar-heading">{sec.heading}</div>
          {sec.items.map((it: any) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
            >
              <it.icon />
              <span>{it.label}</span>
              {it.badgeKey === 'mail' && unreadMail > 0 && <span className="badge">{unreadMail}</span>}
            </NavLink>
          ))}
        </div>
      ))}

      {char && (
        <div className="sidebar-section">
          <div className="sidebar-heading">Vitals</div>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Bar label="HP" value={char.hp} max={char.hp_max} kind="hp" />
            <Bar label="MP" value={char.mp} max={char.mp_max} kind="mp" />
            <Bar label="EN" value={char.energy} max={char.energy_max} kind="energy" />
          </div>
        </div>
      )}
    </aside>
  );
}

function Bar({ label, value, max, kind }: { label: string; value: number; max: number; kind: 'hp' | 'mp' | 'energy' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="flex between" style={{ marginBottom: 4, fontSize: 11, color: 'var(--text-3)' }}>
        <span>{label}</span>
        <span>{value} / {max}</span>
      </div>
      <div className="bar">
        <div className={`bar-fill ${kind}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
