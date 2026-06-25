"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LOCALE_META, LOCALES, isLocale, t, type Locale } from "@/lib/i18n";

type NavItem = { id: string; label: string };

export default function SiteHeader({
  locale,
  brandName,
  brandSub,
  nav,
}: {
  locale: Locale;
  brandName: string;
  brandSub: string;
  nav: NavItem[];
}) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [active, setActive] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const langRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  // Keep the current path when switching language (e.g. /it/privacy → /bg/privacy).
  const localeHref = (l: Locale) => {
    const seg = (pathname || "/").split("/");
    if (isLocale(seg[1])) { seg[1] = l; return seg.join("/") || `/${l}`; }
    return `/${l}`;
  };

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12);
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setProgress(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("menu-open", menuOpen);
    // Move focus into the drawer on open; restore it to the toggle on close.
    if (menuOpen) {
      const first = document.querySelector<HTMLElement>(".nav__menu a");
      first?.focus();
    } else if (toggleRef.current && document.body.classList.contains("had-menu")) {
      toggleRef.current.focus();
    }
    document.body.classList.toggle("had-menu", menuOpen);
    return () => document.body.classList.remove("menu-open");
  }, [menuOpen]);

  // Highlight the nav item for the section in view.
  useEffect(() => {
    const els = nav.map((n) => document.getElementById(n.id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => e.isIntersecting && setActive(e.target.id));
      },
      { threshold: 0.25, rootMargin: "-45% 0px -50% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [nav]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setLangOpen(false); setMenuOpen(false); }
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("keydown", onKey); };
  }, []);

  const close = () => setMenuOpen(false);

  const LangSwitcher = (
    <div className="langsw" data-open={langOpen} ref={langRef}>
      <button
        className="langsw__btn"
        aria-haspopup="true"
        aria-expanded={langOpen}
        aria-label={t(locale, "lang.label")}
        onClick={() => setLangOpen((v) => !v)}
        type="button"
      >
        <span className="flag" aria-hidden="true">{LOCALE_META[locale].flag}</span>
        {locale.toUpperCase()}
        <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="langsw__menu" role="menu">
        {LOCALES.map((l) => (
          <a key={l} className={`langsw__item ${l === locale ? "is-active" : ""}`} href={localeHref(l)} role="menuitem" hrefLang={LOCALE_META[l].htmlLang}>
            <span className="flag" aria-hidden="true">{LOCALE_META[l].flag}</span>
            {LOCALE_META[l].label}
            {l === locale && (
              <svg className="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            )}
          </a>
        ))}
      </div>
    </div>
  );

  return (
    <>
    {/* Bulgarian national tricolour */}
    <div className="topflag" role="presentation" aria-hidden="true" />
    <div className="scrollprogress" aria-hidden="true"><i style={{ ["--p" as string]: `${progress}%` }} /></div>
    <div className="menu-backdrop" aria-hidden="true" onClick={close} />
    <header className={`header ${scrolled ? "is-scrolled" : ""}`}>
      <div className="container">
        <nav className="nav" aria-label="Main">
          <a className="brand" href={`/${locale}`} aria-label={`${brandName} — home`}>
            <img src="/assets/img/brand/logo.webp" alt={`${brandName} logo`} width={120} height={104} />
            <span className="brand__text">
              <span className="brand__name">{brandName}</span>
              <span className="brand__sub">{brandSub}</span>
            </span>
          </a>

          <ul className="nav__menu" id="nav-menu">
            {nav.map((n) => (
              <li key={n.id}>
                <a
                  className={`nav__link ${active === n.id ? "is-active" : ""}`}
                  href={`/${locale}#${n.id}`}
                  onClick={close}
                >
                  {n.label}
                </a>
              </li>
            ))}
            <li><a className="btn btn--primary" href={`/${locale}#contatti`} onClick={close}>{t(locale, "nav.enroll")}</a></li>
            {LangSwitcher}
          </ul>

          <div className="nav__actions">
            {LangSwitcher}
            <a className="btn btn--primary" href={`/${locale}#contatti`}>{t(locale, "nav.enroll")}</a>
            <button
              ref={toggleRef}
              className="nav__toggle"
              aria-label="Menu"
              aria-expanded={menuOpen}
              aria-controls="nav-menu"
              onClick={() => setMenuOpen((v) => !v)}
              type="button"
            >
              <span />
            </button>
          </div>
        </nav>
      </div>
    </header>
    </>
  );
}
