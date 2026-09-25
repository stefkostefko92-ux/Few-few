// frontend/src/site/SiteChrome.jsx
// Хедър и футър на публичния сайт (редизайн 25.09.2026) — едни и същи за
// лендинга на 8 езика и за страниците с функции, сравнения, ръководства и
// правни текстове. Таблото (приложението след вход) има своя обвивка.
import { FEATURE_PAGES, FEATURES_HUB } from "../data/featurePages";
import { HEADER } from "./heroClasses";
import "./site.css";

export const COMPANY_NAME = import.meta.env.VITE_COMPANY_NAME || "Carbon Stealth VCC";
export const SUPPORT_URL = import.meta.env.VITE_SUPPORT_URL || "https://discord.gg/wpCRpy8B";
export const BOT_INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${import.meta.env.VITE_CLIENT_ID}&permissions=361045814416&scope=bot+applications.commands`;

export const LANGS = [
  ["en", "English", "/"], ["bg", "Български", "/bg"], ["de", "Deutsch", "/de"], ["es", "Español", "/es"],
  ["fr", "Français", "/fr"], ["it", "Italiano", "/it"], ["nl", "Nederlands", "/nl"], ["pl", "Polski", "/pl"],
];

export function signIn() {
  window.location.href = `${import.meta.env.VITE_API_URL || "/api"}/auth/login`;
}

export function DiscordMark({ className = "w-5 h-5" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1a19.9 19.9 0 0 0 6 3l1.3-2.1c-.7-.3-1.4-.6-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.7ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.5 8 10.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
    </svg>
  );
}

/** @param {{ nav: object, home?: string, onLanding?: boolean }} p */
export function SiteHeader({ nav, home = "/", onLanding = false }) {
  const at = (id) => (onLanding ? `#${id}` : `${home}#${id}`);
  const links = [["features", nav.features], ["game", nav.game], ["pricing", nav.pricing], ["faq", nav.faq]];
  return (
    <header className="relative z-20">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 site-btn">{nav.skip}</a>
      <div className={HEADER.bar}>
        <a href={home} className={HEADER.brand}>
          <img src="/logo-emblem.png" alt="" width="36" height="36" className="w-9 h-9" />
          <span className={HEADER.name}>Supreme Bot</span>
        </a>
        <nav aria-label="Primary" className={HEADER.nav}>
          {links.map(([id, label]) => <a key={id} href={at(id)} className="no-underline hover:text-site-chrome hover:underline underline-offset-4">{label}</a>)}
        </nav>
        <div className={HEADER.actions}>
          <button type="button" onClick={signIn} className={HEADER.signIn}>{nav.signIn}</button>
          <a href={BOT_INVITE_URL} target="_blank" rel="noopener noreferrer" className={HEADER.invite}>
            {nav.invite}
          </a>
        </div>
      </div>
      <nav aria-label="Primary (mobile)" className={HEADER.mobileNav}>
        {links.map(([id, label]) => <a key={id} href={at(id)} className="py-2 whitespace-nowrap hover:text-site-chrome">{label}</a>)}
      </nav>
    </header>
  );
}

/** @param {{ locale?: string, t?: object }} p  t = преводът (footer/guides); без него — английски */
export function SiteFooter({ locale = "en", t }) {
  const f = t?.footer || { terms: "Terms", privacy: "Privacy", cookies: "Cookies", accessibility: "Accessibility", status: "Status" };
  const g = t?.guides || { heading: "Guides", features: "Features", panel: "Panel & button setup", best: "Choosing a ticket bot", gdpr: "GDPR for Discord bots", vsTicketTool: "vs Ticket Tool", vsAppy: "vs Appy" };
  return (
    <footer className="bg-site-deep border-t border-site-line text-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid gap-10 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <img src="/logo-emblem.png" alt="" width="32" height="32" className="w-8 h-8" loading="lazy" />
            <span className="site-h font-bold text-site-chrome">Supreme Bot</span>
          </div>
          <p className="mt-4 text-site-steel leading-relaxed max-w-xs">
            {COMPANY_NAME}, ul. Samuil 3, 2670 Bobov dol, Bulgaria. EIK 208725180, VAT BG208725180.
          </p>
          <p className="mt-2"><a href="mailto:legal@carbonstealth.eu" className="text-site-chrome underline decoration-site-line underline-offset-4 hover:decoration-site-chrome">legal@carbonstealth.eu</a></p>
        </div>
        {/* Всички 13 — без връзка оттук страниците са сираци (noOrphanPages.test.js). */}
        <FooterCol title={g.features} items={[[FEATURES_HUB.path, FEATURES_HUB.nav], ...FEATURE_PAGES.map((p) => [p.path, p.nav])]} />
        <FooterCol title={g.heading} items={[
          ["/guides/ticket-panel-setup", g.panel], ["/guides/best-discord-ticket-bot", g.best], ["/guides/gdpr-discord-bot", g.gdpr],
          ["/compare/ticket-tool-alternative", g.vsTicketTool], ["/compare/appy-alternative", g.vsAppy], ["/commands", "/commands"],
        ]} />
        <FooterCol title="Supreme" items={[
          ["/terms", f.terms], ["/privacy", f.privacy], ["/cookies", f.cookies], ["/eula", "EULA"],
          ["/accessibility", f.accessibility], ["/status", f.status], [SUPPORT_URL, "Discord"],
        ]} />
      </div>
      <div className="border-t border-site-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between text-site-steel">
          <p>© 2026 {COMPANY_NAME}. Created and designed by <a href="https://carbonstealth.eu" target="_blank" rel="noopener" className="text-site-chrome underline decoration-site-line underline-offset-4">Carbon Stealth VCC</a>.</p>
          <nav aria-label="Language" className="flex flex-wrap gap-x-4 gap-y-1">
            {LANGS.map(([code, name, href]) => code === locale
              ? <span key={code} aria-current="page" className="text-site-chrome">{name}</span>
              : <a key={code} href={href} hrefLang={code} lang={code} className="no-underline hover:text-site-chrome hover:underline underline-offset-4">{name}</a>)}
          </nav>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, items }) {
  return (
    <div>
      <h2 className="text-site-chrome font-semibold text-sm tracking-normal font-body mb-3">{title}</h2>
      <ul className="space-y-2 text-site-steel">
        {items.map(([href, label]) => (
          <li key={href}>
            <a href={href} {...(/^https?:/.test(href) ? { target: "_blank", rel: "noopener" } : {})} className="no-underline hover:text-site-chrome hover:underline underline-offset-4">{label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
