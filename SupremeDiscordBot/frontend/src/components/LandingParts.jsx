// frontend/src/components/LandingParts.jsx
// Общите части на лендинга — една за английския (Login.jsx) и 7-те превода
// (LandingLocalized.jsx). Живеят в главния бъндъл (Login е там), затова
// чънкът на преводите олеква, вместо да расте (бюджет 30 KB gz).
//
// Премиум ниво (10.10.2026): без низове, слепени с „·“, без главни букви и
// моно надписи — ред с отметки и истински футър с колони.
import { Check } from "lucide-react";
import SupremeLogo, { SupremeWordmark } from "./SupremeLogo";
import { FEATURES_HUB, FEATURE_PAGES } from "../data/featurePages";

/** „А · Б · В“ от превода → кратък списък с отметки (един ред на широк екран). */
export function TrustLine({ text, className = "" }) {
  const items = String(text || "").split(/\s+·\s+/).filter(Boolean);
  return (
    <ul className={`flex flex-wrap items-center justify-center lg:justify-start gap-x-5 gap-y-2 text-sm text-cs-dim ${className}`}>
      {items.map((it) => (
        <li key={it} className="inline-flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 text-cs-cyan flex-none" aria-hidden="true" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

const LANGS = [
  ["en", "/", "English"], ["bg", "/bg", "Български"], ["de", "/de", "Deutsch"], ["es", "/es", "Español"],
  ["fr", "/fr", "Français"], ["it", "/it", "Italiano"], ["nl", "/nl", "Nederlands"], ["pl", "/pl", "Polski"],
];

function Col({ title, children }) {
  return (
    <div className="min-w-0">
      <h2 className="text-sm font-semibold text-cs-text mb-4 font-sans tracking-normal">{title}</h2>
      <ul className="space-y-2.5 text-sm text-cs-dim">{children}</ul>
    </div>
  );
}
const L = ({ href, children, ext }) => (
  // Списък от връзки (навигация): разпознава се по контекста, затова без постоянно
  // подчертаване (WCAG 1.4.1 важи за връзки В ТЕКСТ) — подчертава се при посочване/фокус.
  <li><a href={href} {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="no-underline hover:underline focus-visible:underline hover:text-cs-text transition-colors">{children}</a></li>
);

/**
 * @param {{ lang: string, ui: object, guides: object, nav: object, supportUrl: string, company: string }} p
 *  ui     — LANDING_UI[lang].footer (заглавия на колоните и правните връзки)
 *  guides — етикетите на ръководствата (landing.js → guides; за EN — от Login.jsx)
 *  nav    — LANDING_UI[lang].nav (Функции, Цени…)
 */
export function LandingFooter({ lang, ui, guides, nav, supportUrl, company }) {
  return (
    <footer className="px-6 sm:px-8 pt-16 pb-10 border-t border-cs-border/50 bg-cs-bg/60">
      <div className="max-w-6xl mx-auto">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.2fr_1.2fr_1fr]">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-3">
              <SupremeLogo size={36} />
              <SupremeWordmark className="text-base" />
            </div>
            <p className="text-sm text-cs-dim mt-4 max-w-xs leading-relaxed">{ui.tagline}</p>
          </div>
          <Col title={ui.product}>
            <L href="#features">{nav.features}</L>
            <L href="#pricing">{nav.pricing}</L>
            <L href="/commands">{ui.commands}</L>
            <L href="/status">{ui.status}</L>
            <L href={supportUrl} ext>{ui.support}</L>
          </Col>
          <Col title={guides.features}>
            {FEATURE_PAGES.slice(0, 7).map((p) => <L key={p.path} href={p.path}>{p.nav}</L>)}
            <li><a href={FEATURES_HUB.path} className="no-underline hover:underline text-cs-cyan hover:text-cs-text transition-colors">{FEATURES_HUB.nav}</a></li>
          </Col>
          <Col title={guides.heading}>
            <L href="/guides/ticket-panel-setup">{guides.panel}</L>
            <L href="/guides/best-discord-ticket-bot">{guides.best}</L>
            <L href="/guides/gdpr-discord-bot">{guides.gdpr}</L>
            <L href="/compare/ticket-tool-alternative">{guides.vsTicketTool}</L>
            <L href="/compare/appy-alternative">{guides.vsAppy}</L>
          </Col>
          <Col title={ui.legal}>
            <L href="/terms">{ui.terms}</L>
            <L href="/privacy">{ui.privacy}</L>
            <L href="/cookies">{ui.cookies}</L>
            <L href="/eula">{ui.eula}</L>
            <L href="/accessibility">{ui.accessibility}</L>
          </Col>
        </div>

        <nav aria-label={ui.language} className="mt-12 pt-6 border-t border-cs-border/40 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {LANGS.map(([code, href, name]) => (code === lang
            ? <span key={code} className="text-cs-cyan" aria-current="page" lang={code}>{name}</span>
            : <a key={code} href={href} lang={code} hrefLang={code} className="text-cs-dim hover:text-cs-text transition-colors">{name}</a>))}
        </nav>

        <div className="mt-6 flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs text-cs-dim leading-relaxed">
          <p>
            © 2026 {company}. EIK 208725180, VAT BG208725180.<br />
            ul. Samuil 3, 2670 Bobov dol, Bulgaria. <a href="mailto:legal@carbonstealth.eu" className="text-cs-muted underline hover:text-cs-text">legal@carbonstealth.eu</a>
          </p>
          <p>{ui.made} <a href="https://carbonstealth.eu" target="_blank" rel="noopener" className="text-cs-cyan underline">Carbon Stealth VCC</a></p>
        </div>
      </div>
    </footer>
  );
}
