"use client";

import Link from "next/link";
import { SITE } from "../lib/site";
import { useT } from "../i18n/I18nProvider";
import { LangSwitcher } from "./LangSwitcher";

export function Header() {
  const t = useT();
  return (
    <header className="site-header">
      <div
        className="container"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem" }}
      >
        <Link href="/" style={{ fontFamily: "Playfair Display, serif", fontSize: "1.5rem", color: "var(--brass-300)" }}>
          {SITE.name}
        </Link>
        <nav style={{ display: "flex", gap: "1.25rem", alignItems: "center" }}>
          <Link href="/games/">{t.nav.games}</Link>
          <Link href="/faq/">{t.nav.faq}</Link>
          <Link href="/about/">{t.nav.about}</Link>
          <LangSwitcher />
          <a className="cta" href={SITE.playUrl}>
            {t.nav.play}
          </a>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  const t = useT();
  return (
    <footer className="site-footer">
      <div className="container" style={{ padding: "1.5rem 1.25rem" }}>
        <nav
          style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1.25rem", marginBottom: "0.75rem", fontSize: "0.9rem" }}
        >
          <Link href="/games/">{t.footer.games}</Link>
          <Link href="/faq/">{t.footer.faq}</Link>
          <Link href="/about/">{t.footer.about}</Link>
          <Link href="/terms/">{t.footer.terms}</Link>
          <Link href="/privacy/">{t.footer.privacy}</Link>
          <Link href="/cookies/">{t.footer.cookies}</Link>
          <Link href="/responsible/">{t.footer.responsible}</Link>
        </nav>
        <p>{t.footer.disclaimer}</p>
        <p style={{ marginTop: "0.25rem" }}>
          <a href={SITE.org.url} target="_blank" rel="noopener noreferrer">
            {t.footer.credit}
          </a>
        </p>
      </div>
    </footer>
  );
}
