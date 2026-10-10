import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Logo from '../components/Logo';
import LanguageSelector from '../components/LanguageSelector';
import LandingDuel from '../components/LandingDuel';
import LandingSetShowcase from '../components/LandingSetShowcase';
import { WorldSection, ClassSection, SystemsSection, RegionsSection, EnterSection, FaqSection } from '../components/landing/LandingSections';
import { KeyArt } from '../components/landing/KeyArt';
import '../styles/landing.css';

// Заглавие/описание по език — пишат се в <title>/<meta>, за да виждат търсачките
// и AI ботовете текст на езика на заявката (IT/BG), не английския по подразбиране.
const LOCALES: Record<string, { html: string; title: string; description: string }> = {
  en: {
    html: 'en',
    title: 'Nexus Dominion — Free Browser MMORPG',
    description: 'Server-authoritative turn-based MMORPG. Four classes, 21 regions, 500 levels, ELO arena, real-time auction, five-tier guilds. Free, browser-based, no installer.',
  },
  it: {
    html: 'it-IT',
    title: 'Nexus Dominion — MMORPG da browser, gratuito',
    description: "MMORPG a turni validato dal server. Quattro classi, 21 regioni, 500 livelli, arena ELO, asta in tempo reale, gilde a cinque livelli. Gratuito, senza installazione.",
  },
  bg: {
    html: 'bg-BG',
    title: 'Nexus Dominion — Безплатна браузърна MMORPG',
    description: 'Пошагова MMORPG, валидирана на сървъра. Четири класа, 21 региона, 500 нива, ELO арена, аукцион в реално време, гилдии на пет нива. Безплатна, без инсталация.',
  },
};

function pickLocale(lng: string): string {
  const q = new URLSearchParams(window.location.search).get('lang');
  if (q && LOCALES[q]) return q;
  const base = lng.slice(0, 2).toLowerCase();
  return LOCALES[base] ? base : 'en';
}

/** Плавно появяване при скрол (шаблонът: .reveal → .is-visible). Без IntersectionObserver
    или при reduced-motion всичко е видимо веднага — съдържанието никога не се крие. */
function useReveal(root: React.RefObject<HTMLElement>): void {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>('.reveal'));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) { items.forEach((i) => i.classList.add('is-visible')); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
    }, { threshold: 0.08 });
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
  }, [root]);
}

const NAV = [['world', 'world'], ['classes', 'classes'], ['systems', 'systems'], ['sets', 'sets'], ['regions', 'regions'], ['faq', 'faq']] as const;

export default function Landing(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState<string>('');
  useReveal(rootRef);

  useEffect(() => {
    const loc = LOCALES[pickLocale(i18n.language || 'en')];
    document.documentElement.lang = loc.html;
    document.title = loc.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', loc.description);
  }, [i18n.language]);

  // Активната точка в навигацията следва секцията, която се чете.
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
    }, { rootMargin: '-20% 0px -65% 0px' });
    NAV.forEach(([id]) => { const s = document.getElementById(id); if (s) io.observe(s); });
    return () => io.disconnect();
  }, []);

  const year = new Date().getFullYear();

  return (
    <div className="nd-landing" ref={rootRef}>
      <a className="nd-skip" href="#main">{t('a11y.skipToContent', { defaultValue: 'Skip to content' })}</a>
      <header className="nd-header">
        <a className="nd-brand" href="#top" aria-label={t('nd.nav.home')}><Logo size={36} withWordmark /></a>
        <nav id="nd-main-nav" className={`nd-main-nav${menuOpen ? ' is-open' : ''}`} aria-label="Main">
          {NAV.map(([id, key]) => (
            <a key={id} href={`#${id}`} className={active === id ? 'active' : undefined} onClick={() => setMenuOpen(false)}>{t(`nd.nav.${key}`)}</a>
          ))}
        </nav>
        <div className="nd-header-actions">
          <LanguageSelector />
          <Link className="nd-login" to="/login">{t('nd.nav.login')} <span aria-hidden>↗</span></Link>
          <Link className="nd-btn nd-btn-primary nd-btn-small" to="/register">{t('nd.nav.start')}</Link>
        </div>
        <button
          type="button"
          className="nd-menu-btn"
          aria-expanded={menuOpen}
          aria-controls="nd-main-nav"
          aria-label={menuOpen ? t('nd.nav.menuClose') : t('nd.nav.menuOpen')}
          onClick={() => setMenuOpen((o) => !o)}
        ><span /><span /></button>
      </header>

      <main id="main">
        <section className="nd-hero" id="top" aria-labelledby="nd-hero-title">
          <KeyArt className="nd-hero-art" alt={t('nd.hero.artAlt')} priority />
          <div className="nd-hero-shade" aria-hidden />
          <div className="nd-hero-grid" aria-hidden />
          <div className="nd-hero-content reveal">
            <div className="nd-eyebrow"><span className="nd-dot" />{t('nd.hero.eyebrowA')}<span className="nd-eyebrow-divider" />{t('nd.hero.eyebrowB')}</div>
            <h1 id="nd-hero-title">{t('nd.hero.line1')}<br /><span>{t('nd.hero.line2')}</span><span className="nd-period">.</span></h1>
            <p className="nd-hero-copy">{t('nd.hero.copy')}</p>
            <div className="nd-hero-buttons">
              <Link to="/register" className="nd-btn nd-btn-primary nd-btn-large"><span>{t('nd.hero.ctaEnter')}</span><span className="nd-btn-arrow" aria-hidden>↗</span></Link>
              <a href="#world" className="nd-btn nd-btn-ghost nd-btn-large"><span className="nd-play" aria-hidden>▶</span>{t('nd.hero.ctaExplore')}</a>
            </div>
            <div className="nd-hero-note"><span className="nd-note-line" />{t('nd.hero.note')}</div>
          </div>
          <div className="nd-hero-index" aria-hidden><span>{t('nd.hero.indexA')}</span><span className="nd-index-line" /><span>{t('nd.hero.indexB')}</span></div>
          <div className="nd-hero-bar">
            <div className="nd-hero-bar-label"><span className="nd-dot" />{t('nd.hero.bottomLabel')}</div>
            <div className="nd-hero-stats">
              <div><strong>4</strong><span>{t('nd.hero.statClasses')}</span></div>
              <div><strong>21</strong><span>{t('nd.hero.statRegions')}</span></div>
              <div><strong>500</strong><span>{t('nd.hero.statLevels')}</span></div>
            </div>
            <a className="nd-scroll-cue" href="#world"><span>{t('nd.hero.scroll')}</span><i aria-hidden>↓</i></a>
          </div>
        </section>

        <section className="nd-ticker" aria-label={t('nd.nav.systems')}>
          <div className="nd-ticker-track" aria-hidden>
            {[0, 1].map((k) => (t('nd.ticker', { returnObjects: true }) as string[]).map((s, i) => (
              <React.Fragment key={`${k}-${i}`}><span>{s}</span><i>✦</i></React.Fragment>
            )))}
          </div>
          <ul className="nd-sr-only">{(t('nd.ticker', { returnObjects: true }) as string[]).map((s) => <li key={s}>{s}</li>)}</ul>
        </section>

        <WorldSection />
        <div className="nd-duel-wrap"><LandingDuel /></div>
        <ClassSection />
        <SystemsSection />
        <section className="nd-section nd-sets" id="sets">
          <div className="nd-kicker reveal">{t('nd.sets.kicker')}</div>
          <LandingSetShowcase />
        </section>
        <RegionsSection />
        <EnterSection />
        <FaqSection />
      </main>

      <footer className="nd-footer">
        <a className="nd-brand" href="#top" aria-label={t('nd.nav.home')}><Logo size={30} withWordmark /></a>
        <span className="nd-footer-legal">{t('nd.footer.legal')}</span>
        <nav className="nd-footer-links" aria-label="Footer">
          <a href="#world">{t('nd.nav.world')}</a>
          <a href="#systems">{t('nd.nav.systems')}</a>
          <a href="#faq">{t('nd.nav.faq')}</a>
          <Link to="/terms">{t('footer.terms')}</Link>
          <Link to="/privacy">{t('footer.privacy')}</Link>
          <a href="mailto:info@carbonstealth.eu">{t('footer.contactSupport')}</a>
          {/* GDPR чл. 7(3): оттеглянето е толкова лесно, колкото даването — отваря банера наново. */}
          <button type="button" className="nd-linklike" onClick={() => { try { window.dispatchEvent(new CustomEvent('nd:open-cookie-banner')); } catch { /* стар браузър */ } }}>
            {t('footer.cookieSettings')}
          </button>
        </nav>
        <span className="nd-copyright">{t('nd.footer.rights', { year })}</span>
      </footer>
    </div>
  );
}
