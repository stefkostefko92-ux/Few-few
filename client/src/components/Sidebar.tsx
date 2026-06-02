import React, { useState } from 'react';
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
  IconBolt,
  IconStar,
  IconChart,
  IconSkull,
  IconChevron,
  IconFlame,
} from '../lib/icons';
import Avatar from './Avatar';
import { useStore } from '../lib/store';

interface SectionDef {
  heading: string;
  items: { to: string; label: string; icon: any; end?: boolean; badgeKey?: 'mail' }[];
}

const SECTIONS: SectionDef[] = [
  {
    heading: 'Main',
    items: [
      // Overview / Profile / Character / Inventory / Statistics are now tabs
      // inside the one Hero page.
      { to: '/app', label: 'Hero', icon: IconHome, end: true },
    ],
  },
  {
    heading: 'Adventure',
    items: [
      // World Map + Quests are merged into the one Realm page (two tabs).
      { to: '/app/world', label: 'Realm · Map & Quests', icon: IconMap },
      { to: '/app/bounties', label: 'Bounty Board', icon: IconSkull },
      { to: '/app/hunting', label: 'Hunting Grounds', icon: IconBolt },
      { to: '/app/camp', label: 'Camp · Idle Tasks', icon: IconFlame },
      { to: '/app/tower', label: 'Tower of Trials', icon: IconCrown },
      { to: '/app/trial-cache', label: 'Trial Cache', icon: IconStar },
      { to: '/app/dungeons', label: 'Dungeons', icon: IconCrown },
      { to: '/app/forge', label: 'The Forge', icon: IconBolt },
      { to: '/app/recipes', label: 'Recipe Board', icon: IconStar },
      { to: '/app/arena', label: 'Arena', icon: IconSword },
      { to: '/app/history', label: 'Battle History', icon: IconSword },
    ],
  },
  {
    heading: 'Daily',
    items: [
      { to: '/app/battlepass', label: 'Battle Pass', icon: IconStar },
      { to: '/app/daily', label: 'Daily Tribute', icon: IconStar },
      { to: '/app/wheel', label: 'Wheel of Fortune', icon: IconCoin },
    ],
  },
  {
    heading: 'Society',
    items: [
      { to: '/app/guild', label: 'Guild', icon: IconCrown },
      { to: '/app/mail', label: 'Mail', icon: IconMail, badgeKey: 'mail' },
      { to: '/app/leaderboard', label: 'Hall of Fame', icon: IconCrown },
    ],
  },
  {
    heading: 'Town',
    items: [
      { to: '/app/shop', label: 'NPC Merchant', icon: IconCoin },
      { to: '/app/market', label: 'Player Market', icon: IconBag },
      { to: '/app/auction', label: 'Auction House', icon: IconCrown },
      { to: '/app/stables', label: 'Stables', icon: IconBolt },
      { to: '/app/premium', label: 'Premium Mint', icon: IconStar },
    ],
  },
  {
    heading: 'Lore',
    items: [
      { to: '/app/achievements', label: 'Achievements', icon: IconStar },
      { to: '/app/bestiary', label: 'Bestiary', icon: IconSkull },
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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggle(heading: string) {
    setCollapsed((c) => ({ ...c, [heading]: !c[heading] }));
  }

  // Close the mobile drawer whenever the user picks a link (the body class
  // controls visibility below 900px — see Navbar.tsx + globals.css).
  function closeMobile() { document.body.classList.remove('mobile-open'); }

  return (
    <>
      <div className="sidebar-backdrop" onClick={closeMobile} aria-hidden />
    <aside className="sidebar">
      {char && (
        <div className="sidebar-hero">
          <div className="sidebar-hero-frame">
            <Avatar avatar={(char as any).avatar || `${char.class}_01`} frame={(char as any).frame_slug || 'plain'} size={56} />
            <div className="sidebar-hero-lvl">{char.level}</div>
          </div>
          <div className="sidebar-hero-meta">
            <div className="sidebar-hero-name">{char.name}</div>
            {(char as any).current_title && <div className="sidebar-hero-title">{(char as any).current_title}</div>}
            <div className="sidebar-hero-class">{char.class.toUpperCase()} · LV {char.level}</div>
          </div>
        </div>
      )}
      {SECTIONS.map((sec) => (
        <div key={sec.heading} className={`sidebar-section ${collapsed[sec.heading] ? 'collapsed' : ''}`}>
          <div className="sidebar-heading" onClick={() => toggle(sec.heading)}>
            <span>{sec.heading}</span>
            <IconChevron className="chev" size={10} />
          </div>
          <div className="items">
            {sec.items.map((it: any) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                onClick={closeMobile}
                className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              >
                <it.icon />
                <span>{it.label}</span>
                {it.badgeKey === 'mail' && unreadMail > 0 && <span className="badge">{unreadMail}</span>}
              </NavLink>
            ))}
          </div>
        </div>
      ))}

      {char && (
        <div className="sidebar-section">
          <div className="sidebar-heading"><span>Vitals</span></div>
          <div className="sidebar-vitals">
            <Bar label="HP" value={char.hp} max={char.hp_max} kind="hp" />
            <Bar label="MP" value={char.mp} max={char.mp_max} kind="mp" />
            <div style={{ height: 1, background: 'var(--border-1)', margin: '10px 0' }} />
            <Bar label="XP" value={xpInLevel(char.level, char.xp)} max={xpToNext(char.level)} kind="xp" />
          </div>
        </div>
      )}
    </aside>
    </>
  );
}

function xpInLevel(level: number, xp: number): number {
  const xpAt = Math.floor(50 * Math.pow(level, 1.7));
  return Math.max(0, xp - xpAt);
}
function xpToNext(level: number): number {
  const xpAt = Math.floor(50 * Math.pow(level, 1.7));
  const xpNext = Math.floor(50 * Math.pow(level + 1, 1.7));
  return xpNext - xpAt;
}

function Bar({
  label,
  value,
  max,
  kind,
}: {
  label: string;
  value: number;
  max: number;
  kind: 'hp' | 'mp' | 'energy' | 'xp';
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 4,
          fontSize: 10,
          color: 'var(--text-3)',
          textTransform: 'uppercase',
          letterSpacing: '.12em',
          fontWeight: 800,
        }}
      >
        <span>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>
          {value} / {max}
        </span>
      </div>
      <div className="bar">
        <div className={`bar-fill ${kind}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
