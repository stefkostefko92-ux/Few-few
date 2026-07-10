// Фиксирана нав лента: лого, секционни линкове, езиков превключвател, live HUD.
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useContent } from '@/lib/content-context';
import { homePath, LANGS } from '@/lib/i18n';
import { alternatePathFor } from '@/lib/seo';
import { scrollToId } from '@/lib/scroll';
import type { Lang } from '@/lib/types';

const SECTIONS: { key: string; id: string }[] = [
  { key: 'nav_manifesto', id: 'about' },
  { key: 'nav_services', id: 'services' },
  { key: 'nav_work', id: 'work' },
  { key: 'nav_lab', id: 'lab' },
  { key: 'nav_contact', id: 'contact' },
];

export default function Nav(): React.JSX.Element {
  const { lang, content } = useContent();
  const ui = content.ui;
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [fps, setFps] = useState(60);

  const onHome =
    location.pathname === homePath(lang) ||
    location.pathname === homePath(lang).replace(/\/$/, '');

  // Живо измерване на FPS (декоративен HUD, като на стария сайт)
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (): void => {
      frames++;
      const now = performance.now();
      if (now - last >= 1000) {
        setFps(frames);
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const goSection = (id: string): void => {
    setOpen(false);
    if (onHome) {
      scrollToId(id);
    } else {
      navigate(homePath(lang) + '#' + id);
    }
  };

  const switchLang = (l: Lang): void => {
    // Слъговете са локализирани (servizi ↔ services ↔ uslugi), затова
    // алтернативата се резолвира през hreflang картата от seo.json.
    setOpen(false);
    void alternatePathFor(location.pathname, l).then((next) => navigate(next));
  };

  return (
    <>
    <nav
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 20px',
        background: 'rgba(0,0,0,.85)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(245,245,240,.08)',
      }}
    >
      <a
        href={homePath(lang)}
        onClick={(e) => {
          e.preventDefault();
          navigate(homePath(lang));
        }}
        style={{ display: 'flex', alignItems: 'center', gap: 10 }}
      >
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="Carbon Stealth VCC"
          style={{ height: 26, filter: 'drop-shadow(0 0 8px rgba(0,229,255,.3))' }}
        />
      </a>

      {/* Десктоп линкове */}
      <div className="cs-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => goSection(s.id)}
            style={{
              fontSize: 10,
              letterSpacing: '.15em',
              color: 'var(--text)',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {ui[s.key]}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span className="cs-hud cs-nav-fps" style={{ display: 'inline-flex', gap: 4 }}>
          <span style={{ animation: 'cs-blink 1.4s infinite' }}>●</span>
          {fps} FPS
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          {LANGS.map((l) => (
            <button
              key={l}
              onClick={() => switchLang(l)}
              style={{
                fontSize: 10,
                letterSpacing: '.1em',
                padding: '4px 6px',
                color: l === lang ? '#000' : 'var(--cyan)',
                background: l === lang ? 'var(--cyan)' : 'transparent',
                border: '1px solid rgba(0,229,255,.4)',
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              {l}
            </button>
          ))}
        </div>
        {/* Хамбургер (мобилен) */}
        <button
          className="cs-burger"
          onClick={() => setOpen((v) => !v)}
          aria-label={ui.nav_menu ?? 'Menu'}
          aria-expanded={open}
          style={{
            display: 'none',
            width: 34,
            height: 34,
            border: '1px solid rgba(0,229,255,.2)',
            color: 'var(--cyan)',
            cursor: 'pointer',
          }}
        >
          {open ? '✕' : '≡'}
        </button>
      </div>

    </nav>

    {/* Мобилно меню — извън <nav>, защото backdrop-filter на родителя прави
        containing block за position:fixed и чупи позиционирането/фона. */}
    {open && (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          paddingTop: 100,
          background: 'rgba(0,0,0,.97)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          paddingLeft: 40,
          paddingRight: 40,
          zIndex: 999,
        }}
      >
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => goSection(s.id)}
            style={{
              fontSize: 20,
              textAlign: 'left',
              color: 'var(--off-white)',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              textTransform: 'uppercase',
            }}
          >
            {ui[s.key]}
          </button>
        ))}
      </div>
    )}
    </>
  );
}
