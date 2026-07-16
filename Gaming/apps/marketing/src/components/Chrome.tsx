"use client";

import Link from "next/link";
import { SITE } from "../lib/site";
import { useLocale, useT } from "../i18n/I18nProvider";
import type { Locale } from "../i18n/locales";
import { LangSwitcher } from "./LangSwitcher";

/**
 * Service impressum labels. Localised inline here because the impressum lives
 * only in the footer (and the Terms §1 block); the values come from SITE.org.
 */
const IMPRESSUM: Record<Locale, {
  operator: string;
  address: string;
  companyId: string;
  vatId: string;
  contact: string;
  adr: string;
}> = {
  bg: {
    operator: "Оператор",
    address: "Седалище и адрес на управление",
    companyId: "ЕИК/рег. №",
    vatId: "ДДС №",
    contact: "Контакт",
    adr: "Алтернативно решаване на спорове: Комисия за защита на потребителите (КЗП) и помирителните комисии към нея.",
  },
  en: {
    operator: "Operator",
    address: "Registered seat and address",
    companyId: "Company ID",
    vatId: "VAT No.",
    contact: "Contact",
    adr: "Alternative dispute resolution: the Bulgarian Commission for Consumer Protection (CCP) and its conciliation commissions.",
  },
  it: {
    operator: "Operatore",
    address: "Sede legale e indirizzo",
    companyId: "Codice azienda",
    vatId: "P. IVA",
    contact: "Contatto",
    adr: "Risoluzione alternativa delle controversie: la Commissione bulgara per la tutela dei consumatori (CCP) e le sue commissioni di conciliazione.",
  },
};

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
  const locale = useLocale();
  const imp = IMPRESSUM[locale];
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
        <address
          style={{ marginTop: "0.5rem", fontStyle: "normal", fontSize: "0.8rem", lineHeight: 1.6, opacity: 0.85 }}
        >
          {imp.operator}:{" "}
          <a href={SITE.org.url} target="_blank" rel="noopener noreferrer">
            {SITE.org.legalName}
          </a>
          {" · "}
          {imp.address}: {SITE.org.address}
          {" · "}
          {imp.companyId}: {SITE.org.companyId}
          {" · "}
          {imp.vatId}: {SITE.org.vatId}
          {" · "}
          {imp.contact}:{" "}
          <a href={`mailto:${SITE.org.contactEmail}`}>{SITE.org.contactEmail}</a>
          <br />
          {imp.adr}
        </address>
        <p style={{ marginTop: "0.25rem" }}>
          <a href={SITE.org.url} target="_blank" rel="noopener noreferrer">
            {t.footer.credit}
          </a>
        </p>
      </div>
    </footer>
  );
}
