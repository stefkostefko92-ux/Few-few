import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import Logo from './Logo';
import Avatar from './Avatar';
import AnimatedNumber from './AnimatedNumber';
import LanguageSelector from './LanguageSelector';
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

// Етикетите се превеждат при рендер — тук държим само i18n ключовете.
const links = [
  { to: '/app', labelKey: 'navbar.home', icon: IconHome, end: true },
  { to: '/app/quests', labelKey: 'navbar.quests', icon: IconScroll },
  { to: '/app/dungeons', labelKey: 'navbar.dungeons', icon: IconCrown },
  { to: '/app/arena', labelKey: 'navbar.arena', icon: IconSword },
  { to: '/app/daily', labelKey: 'navbar.daily', icon: IconBolt },
  { to: '/app/inventory', labelKey: 'navbar.bag', icon: IconBag },
];

export default function Navbar(): React.ReactElement {
  const { t } = useTranslation();
  const char = useStore((s) => s.character);
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);
  const toast = useStore((s) => s.toast);
  const refreshCharacter = useStore((s) => s.refreshCharacter);
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
      {/* Mobile-only hamburger: toggles the .mobile-open class on body so the
          sidebar slides in as a drawer below 900px. The button itself is
          hidden by CSS at desktop widths. */}
      <button
        className="nav-hamburger"
        aria-label={t('navbar.openMenu')}
        onClick={() => document.body.classList.toggle('mobile-open')}
      >
        <span /><span /><span />
      </button>
      <div className="nav-brand" onClick={() => navigate('/app')} style={{ cursor: 'pointer' }}>
        <Logo size={34} />
        <span>Nexus Dominion</span>
      </div>

      <nav className="nav-links" aria-label={t('navbar.primaryNav')}>
        {links.map((l, ni) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end as any}
            style={{ ['--ni' as any]: ni }}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <l.icon />
            <span>{t(l.labelKey)}</span>
          </NavLink>
        ))}
      </nav>

      <div className="nav-spacer" />

      <div className="nav-meta">
        {char && (
          <>
            <div className="nav-stat hp-stat" title={t('navbar.healthTitle', { value: char.hp_max })}>
              <span className="nav-stat-dot dot-hp" />
              <span className="label">HP</span>
              <span className="value hp"><AnimatedNumber value={char.hp_max} /></span>
            </div>
            <div className="nav-stat gp-stat" title={t('navbar.goldTitle', { value: char.gold.toLocaleString() })}>
              <span className="nav-stat-dot dot-gold" />
              <span className="label">GP</span>
              <span className="value gold"><AnimatedNumber value={char.gold} /></span>
            </div>
            <div className="nav-stat gem-stat" title={t('navbar.gemsTitle')} onClick={() => navigate('/app/premium')} style={{ cursor: 'pointer' }}>
              <span className="nav-stat-dot dot-gem" />
              <span className="label">GM</span>
              <span className="value gem">
                <AnimatedNumber value={(char as any).gems || 0} />
              </span>
            </div>
          </>
        )}

        <LanguageSelector compact />

        <div className="nav-profile" ref={menuRef} onClick={() => setOpen((o) => !o)}>
          {char ? (
            <Avatar
              avatar={(char as any).avatar || `${char.class}_01`}
              frame={(char as any).frame_slug || 'plain'}
              size={36}
            />
          ) : (
            <div className="nav-avatar">{initials}</div>
          )}
          <div className="nav-profile-info">
            <div className="name">
              {char?.name || user?.username || t('navbar.guest')}
              {char?.current_title && <span style={{ color: 'var(--amethyst-1)', marginLeft: 4 }}>, {char.current_title}</span>}
            </div>
            <div className="sub">
              {char ? `${char.class[0].toUpperCase() + char.class.slice(1)} · Lv ${char.level}` : t('navbar.unbound')}
            </div>
          </div>
          <IconChevron size={14} />
          {open && (
            <div className="nav-menu" onClick={(e) => e.stopPropagation()}>
              <div className="nav-menu-item" onClick={() => { setOpen(false); navigate('/app/profile'); }}>
                <IconUser /> <span>{t('navbar.menuProfile')}</span>
              </div>
              <div className="nav-menu-item" onClick={() => { setOpen(false); navigate('/app/character'); }}>
                <IconUser /> <span>{t('navbar.menuCharacter')}</span>
              </div>
              <div className="nav-menu-item" onClick={() => { setOpen(false); navigate('/app/guild'); }}>
                <IconCrown /> <span>{t('navbar.menuGuild')}</span>
              </div>
              <div className="nav-menu-item" onClick={() => { setOpen(false); navigate('/app/mail'); }}>
                <IconMail /> <span>{t('navbar.menuMail')}</span>
              </div>
              <div className="nav-menu-item" onClick={() => { setOpen(false); navigate('/app/settings'); }}>
                <IconUser /> <span>{t('navbar.menuSettings')}</span>
              </div>
              <div className="nav-menu-item" onClick={() => { setOpen(false); navigate('/app/help'); }}>
                <IconUser /> <span>{t('navbar.menuHelp')}</span>
              </div>
              {user?.is_admin ? (
                <>
                  <div className="nav-menu-divider" />
                  <div className="nav-menu-item" onClick={() => { setOpen(false); navigate('/admin'); }}>
                    <IconUser /> <span style={{ color: 'var(--gold-1)' }}>{t('navbar.menuAdmin')}</span>
                  </div>
                </>
              ) : null}
              <div className="nav-menu-divider" />
              <div className="nav-menu-item danger" onClick={() => { setOpen(false); logout(); navigate('/login'); }}>
                <IconLogout /> <span>{t('navbar.signOut')}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
