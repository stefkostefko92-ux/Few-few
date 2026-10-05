"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LOCALE_META, LOCALES, isLocale, t, type Locale } from "@/lib/i18n";
import { useUi } from "./UiProvider";

type NavItem = { id: string; label: string };

export default function SiteHeader({
  locale,
  brandName,
  brandSub,
  logo,
  nav,
}: {
  locale: Locale;
  brandName: string;
  brandSub: string;
  logo: string;
  nav: NavItem[];
}) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState<string>("");
  const toggleRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const ui = useUi();

  // Keep the current path when switching language (e.g. /it/privacy → /bg/privacy).
  const localeHref = (l: Locale) => {
    const seg = (pathname || "/").split("/");
    if (isLocale(seg[1])) { seg[1] = l; return seg.join("/") || `/${l}`; }
    return `/${l}`;
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("menu-open", menuOpen);
    // Move focus into the drawer on open; restore it to the toggle on close.
    if (menuOpen) {
      document.querySelector<HTMLElement>(".nav__menu a")?.focus();
    } else if (toggleRef.current && document.body.classList.contains("had-menu")) {
      toggleRef.current.focus();
    }
    document.body.classList.toggle("had-menu", menuOpen);
    return () => document.body.classList.remove("menu-open");
  }, [menuOpen]);

  // Mark the menu entry of the section in view.
  useEffect(() => {
    const els = nav.map((n) => document.getElementById(n.id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { threshold: 0.2, rootMargin: "-45% 0px -50% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [nav]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const close = () => setMenuOpen(false);
  const enroll = t(locale, "nav.enroll", ui);

  // Three languages, three links: one click, no menu to open.
  const Lang = (
    <ul className="lang" aria-label={t(locale, "lang.label", ui)}>
      {LOCALES.map((l) => (
        <li key={l}>
          <a
            href={localeHref(l)}
            hrefLang={LOCALE_META[l].htmlLang}
            lang={LOCALE_META[l].htmlLang}
            title={LOCALE_META[l].label}
            aria-current={l === locale ? "true" : undefined}
          >
            {l.toUpperCase()}
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <div className="topflag" aria-hidden="true" />
      <div className="menu-backdrop" aria-hidden="true" onClick={close} />
      <header className={`header ${scrolled ? "is-scrolled" : ""}`}>
        <div className="wrap header__bar">
          <a className="brand" href={`/${locale}`} aria-label={`${brandName}, home`}>
            <img src={logo} alt="" width={120} height={104} />
            <span className="brand__text">
              <span className="brand__name">{brandName}</span>
              <span className="brand__sub">{brandSub}</span>
            </span>
          </a>

          <nav aria-label="Main">
            <ul className="nav__menu" id="nav-menu">
              {nav.map((n) => (
                <li key={n.id}>
                  <a
                    className="nav__link"
                    aria-current={active === n.id ? "location" : undefined}
                    href={`/${locale}#${n.id}`}
                    onClick={close}
                  >
                    {n.label}
                  </a>
                </li>
              ))}
              <li className="nav__drawer-only"><a className="btn btn--red" href={`/${locale}#contatti`} onClick={close}>{enroll}</a></li>
              <li className="nav__drawer-only">{Lang}</li>
            </ul>
          </nav>

          <div className="header__actions">
            {Lang}
            <a className="btn btn--red btn--sm" href={`/${locale}#contatti`}>{enroll}</a>
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
        </div>
      </header>
    </>
  );
}
