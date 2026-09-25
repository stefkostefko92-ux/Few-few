import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  // Стабилен id за collapse състоянието; текстът идва от i18n ключа.
  id: string;
  headingKey: string;
  items: { to: string; labelKey: string; icon: any; end?: boolean; badgeKey?: 'mail' }[];
}

const SECTIONS: SectionDef[] = [
  {
    id: 'main',
    headingKey: 'sidebar.main',
    items: [
      // Overview / Profile / Character / Inventory / Statistics are now tabs
      // inside the one Hero page.
      { to: '/app', labelKey: 'sidebar.hero', icon: IconHome, end: true },
    ],
  },
  {
    id: 'adventure',
    headingKey: 'sidebar.adventure',
    items: [
      // World Map + Quests are merged into the one Realm page (two tabs).
      { to: '/app/world', labelKey: 'sidebar.realm', icon: IconMap },
      { to: '/app/bounties', labelKey: 'sidebar.bounties', icon: IconSkull },
      { to: '/app/hunting', labelKey: 'sidebar.hunting', icon: IconBolt },
      { to: '/app/camp', labelKey: 'sidebar.camp', icon: IconFlame },
      { to: '/app/tower', labelKey: 'sidebar.tower', icon: IconCrown },
      { to: '/app/trial-cache', labelKey: 'sidebar.trialCache', icon: IconStar },
      { to: '/app/dungeons', labelKey: 'sidebar.dungeons', icon: IconCrown },
      { to: '/app/forge', labelKey: 'sidebar.forge', icon: IconBolt },
      { to: '/app/recipes', labelKey: 'sidebar.recipes', icon: IconStar },
      { to: '/app/arena', labelKey: 'sidebar.arena', icon: IconSword },
      { to: '/app/history', labelKey: 'sidebar.history', icon: IconSword },
    ],
  },
  {
    id: 'daily',
    headingKey: 'sidebar.daily',
    items: [
      { to: '/app/battlepass', labelKey: 'sidebar.battlePass', icon: IconStar },
      { to: '/app/daily', labelKey: 'sidebar.dailyTribute', icon: IconStar },
      { to: '/app/wheel', labelKey: 'sidebar.wheel', icon: IconCoin },
    ],
  },
  {
    id: 'endgame',
    headingKey: 'sidebar.endgame',
    items: [
      { to: '/app/realm-boss', labelKey: 'sidebar.realmBoss', icon: IconSkull },
      { to: '/app/factions', labelKey: 'sidebar.factions', icon: IconCrown },
      { to: '/app/events', labelKey: 'sidebar.events', icon: IconFlame },
      { to: '/app/mythic-plus', labelKey: 'sidebar.mythicPlus', icon: IconCrown },
    ],
  },
  {
    id: 'society',
    headingKey: 'sidebar.society',
    items: [
      { to: '/app/guild', labelKey: 'sidebar.guild', icon: IconCrown },
      { to: '/app/social', labelKey: 'sidebar.friends', icon: IconUser },
      { to: '/app/chat', labelKey: 'sidebar.chat', icon: IconMail },
      { to: '/app/mail', labelKey: 'sidebar.mail', icon: IconMail, badgeKey: 'mail' },
      { to: '/app/leaderboard', labelKey: 'sidebar.leaderboard', icon: IconCrown },
    ],
  },
  {
    id: 'town',
    headingKey: 'sidebar.town',
    items: [
      { to: '/app/shop', labelKey: 'sidebar.shop', icon: IconCoin },
      { to: '/app/market', labelKey: 'sidebar.market', icon: IconBag },
      { to: '/app/auction', labelKey: 'sidebar.auction', icon: IconCrown },
      { to: '/app/stables', labelKey: 'sidebar.stables', icon: IconBolt },
      { to: '/app/premium', labelKey: 'sidebar.premium', icon: IconStar },
    ],
  },
  {
    id: 'lore',
    headingKey: 'sidebar.lore',
    items: [
      { to: '/app/achievements', labelKey: 'sidebar.achievements', icon: IconStar },
      { to: '/app/bestiary', labelKey: 'sidebar.bestiary', icon: IconSkull },
    ],
  },
  {
    id: 'account',
    headingKey: 'sidebar.account',
    items: [
      { to: '/app/help', labelKey: 'sidebar.help', icon: IconScroll },
      { to: '/app/settings', labelKey: 'sidebar.settings', icon: IconUser },
    ],
  },
];

export default function Sidebar(): React.ReactElement {
  const { t } = useTranslation();
  const char = useStore((s) => s.character);
  const unreadMail = useStore((s) => s.unreadMail);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggle(id: string) {
    setCollapsed((c) => ({ ...c, [id]: !c[id] }));
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
      {SECTIONS.map((sec, si) => (
        <div
          key={sec.id}
          className={`sidebar-section ${collapsed[sec.id] ? 'collapsed' : ''}`}
          style={{ ['--si' as any]: si }}
        >
          <div className="sidebar-heading" onClick={() => toggle(sec.id)}>
            <span>{t(sec.headingKey)}</span>
            <IconChevron className="chev" size={10} />
          </div>
          <div className="items">
            {sec.items.map((it: any, i: number) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                onClick={closeMobile}
                style={{ ['--i' as any]: i }}
                className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              >
                <it.icon />
                <span>{t(it.labelKey)}</span>
                {it.badgeKey === 'mail' && unreadMail > 0 && <span className="badge">{unreadMail}</span>}
              </NavLink>
            ))}
          </div>
        </div>
      ))}

      {char && (
        <div className="sidebar-section">
          <div className="sidebar-heading"><span>{t('sidebar.vitals')}</span></div>
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

// Mirror the server curve exactly (server/src/game/progression.ts):
// xpForLevel(1) === 0, floor(50 * level^1.7) for level >= 2. Using the raw
// formula at level 1 over-counted the base by 50 XP and shrank the bar.
function xpForLevel(level: number): number {
  return level <= 1 ? 0 : Math.floor(50 * Math.pow(level, 1.7));
}
function xpInLevel(level: number, xp: number): number {
  return Math.max(0, xp - xpForLevel(level));
}
function xpToNext(level: number): number {
  return xpForLevel(level + 1) - xpForLevel(level);
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
