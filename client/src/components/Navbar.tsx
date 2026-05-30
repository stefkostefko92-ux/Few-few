import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import Logo from './Logo';
import {
  IconHome,
  IconScroll,
  IconSword,
  IconBag,
  IconCrown,
  IconBolt,
  IconLogout,
  IconUser,
  IconMail,
  IconChevron,
} from '../lib/icons';

const links = [
  { to: '/app', label: 'Home', icon: IconHome, end: true },
  { to: '/app/quests', label: 'Quests', icon: IconScroll },
  { to: '/app/dungeons', label: 'Dungeons', icon: IconCrown },
  { to: '/app/arena', label: 'Arena', icon: IconSword },
  { to: '/app/daily', label: 'Daily', icon: IconBolt },
  { to: '/app/inventory', label: 'Bag', icon: IconBag },
];

export default function Navbar(): React.ReactElement {
  const char = useStore((s) => s.character);
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const initials = (char?.name || user?.username || 'A').slice(0, 2).toUpperCase();

  return (
    <header className="navbar">
      <div className="nav-brand" onClick={() => navigate('/app')} style={{ cursor: 'pointer' }}>
        <Logo size={34} />
        <span>Nexus Dominion</span>
      </div>

      <nav className="nav-links" aria-label="Primary">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end as any}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <l.icon />
            <span>{l.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="nav-spacer" />

      <div className="nav-meta">
        {char && (
          <>
            <div className="nav-stat" title="Health">
              <span className="nav-stat-dot dot-hp" />
              <span className="label">HP</span>
              <span className="value hp">{char.hp}/{char.hp_max}</span>
            </div>
            <div className="nav-stat" title="Energy">
              <span className="nav-stat-dot dot-energy" />
              <span className="label">EN</span>
              <span className="value energy">{char.energy}/{char.energy_max}</span>
            </div>
            <div className="nav-stat" title="Gold">
              <span className="nav-stat-dot dot-gold" />
              <span className="label">GP</span>
              <span className="value gold">{char.gold.toLocaleString()}</span>
            </div>
          </>
        )}

        <div className="nav-profile" ref={menuRef} onClick={() => setOpen((o) => !o)}>
          <div className="nav-avatar">{initials}</div>
          <div className="nav-profile-info">
            <div className="name">
              {char?.name || user?.username || 'Guest'}
              {char?.current_title && <span style={{ color: 'var(--amethyst-1)', marginLeft: 4 }}>, {char.current_title}</span>}
            </div>
            <div className="sub">
              {char ? `${char.class[0].toUpperCase() + char.class.slice(1)} · Lv ${char.level}` : 'Unbound'}
            </div>
          </div>
          <IconChevron size={14} />
          {open && (
            <div className="nav-menu" onClick={(e) => e.stopPropagation()}>
              <div className="nav-menu-item" onClick={() => { setOpen(false); navigate('/app/character'); }}>
                <IconUser /> <span>My Character</span>
              </div>
              <div className="nav-menu-item" onClick={() => { setOpen(false); navigate('/app/mail'); }}>
                <IconMail /> <span>Mail</span>
              </div>
              <div className="nav-menu-item" onClick={() => { setOpen(false); navigate('/app/settings'); }}>
                <IconUser /> <span>Settings</span>
              </div>
              <div className="nav-menu-item" onClick={() => { setOpen(false); navigate('/app/help'); }}>
                <IconUser /> <span>How to Play</span>
              </div>
              {user?.is_admin ? (
                <>
                  <div className="nav-menu-divider" />
                  <div className="nav-menu-item" onClick={() => { setOpen(false); navigate('/admin'); }}>
                    <IconUser /> <span style={{ color: 'var(--gold-1)' }}>Admin Control</span>
                  </div>
                </>
              ) : null}
              <div className="nav-menu-divider" />
              <div className="nav-menu-item danger" onClick={() => { setOpen(false); logout(); navigate('/login'); }}>
                <IconLogout /> <span>Sign Out</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
