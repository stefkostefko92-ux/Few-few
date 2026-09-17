// hub.mjs — началната страница на портфолиото (бранд тема на Carbon Stealth: карбон + неон).
import { esc, join, head, credit, jsonLd, ICON, ORG, PATHS, demoPath, SITE, LANGS, BRAND_EMAIL, BRAND_URL } from "../lib/html.mjs";
import { I18N } from "../i18n/index.mjs";
import { DEMOS } from "../demos/index.mjs";
import { DEMO_ICONS } from "./icons.mjs";
import { TIERS, fmt } from "../pricing.mjs";

export const HUB_FONTS = ["Space+Grotesk:wght@500;700", "Inter:wght@400;500;600"];
export const BRAND_BG = "#050706";
const CONTACT_URL = { bg: `${BRAND_URL}/bg/contact/`, en: `${BRAND_URL}/en/contact/`, it: `${BRAND_URL}/contact/` };

/** Общата навигация + футър на хъба, цените и правната страница. */
export function siteNav(lang, ui, current) {
  const links = [[`${PATHS.hub[lang]}#demos`, ui.nav.demos], [`${PATHS.hub[lang]}#process`, ui.nav.process], [`${PATHS.hub[lang]}#why`, ui.nav.why], [PATHS.pricing[lang], ui.nav.pricing], [`${PATHS.hub[lang]}#contact`, ui.nav.contact]];
  const langs = LANGS.map((l) => `<a href="${current[l]}" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="page"' : ""}>${I18N[l].short}</a>`).join("");
  return `<header class="nav" id="top"><a class="brand" href="${PATHS.hub[lang]}"><span class="logo" aria-hidden="true"></span>Carbon Stealth <span class="brand-sub">Portfolio</span></a><button class="burger" aria-expanded="false" aria-controls="menu" aria-label="${esc(ui.nav.menu)}">${ICON.menu}</button><nav id="menu" class="menu">${links.map(([h, l]) => `<a href="${h}">${esc(l)}</a>`).join("")}</nav><nav class="langs" aria-label="Language">${langs}</nav></header>`;
}

export function siteFooter(lang, ui) {
  return `<footer class="foot"><div class="wrap"><div><span class="brand"><span class="logo" aria-hidden="true"></span>Carbon Stealth VCC</span><p class="tiny">© ${new Date().getFullYear()} Carbon Stealth VCC · ${esc(ui.footer.rights)}<br>${esc(ui.footer.built)}</p></div><div class="foot-links"><a href="${PATHS.legal[lang]}">${esc(ui.footer.legal)}</a><a href="${BRAND_URL}" target="_blank" rel="noopener">carbonstealth.eu</a><a href="mailto:${BRAND_EMAIL}">${BRAND_EMAIL}</a></div>${credit(lang)}</div></footer>`;
}

function hero(ui) {
  return `<section class="hero"><div class="hex" aria-hidden="true"></div><div class="wrap"><p class="eyebrow">${esc(ui.hero.eyebrow)}</p><h1>${ui.hero.title}</h1><p class="lede">${esc(ui.hero.lede)}</p><div class="cta-row"><a class="btn btn-primary" href="#demos">${esc(ui.hero.ctaDemos)} ${ICON.arrow}</a><a class="btn btn-ghost" href="${PATHS.pricing[ui.code]}">${esc(ui.hero.ctaPricing)}</a></div><dl class="stats">${ui.hero.stats.map((s) => `<div><dt>${esc(s.n)}</dt><dd>${esc(s.l)}</dd></div>`).join("")}</dl></div></section>`;
}

function demoCard(lang, demo, ui) {
  const t = demo.t[lang], th = demo.theme, href = demoPath(lang, demo);
  return `<article class="demo-card reveal" style="--c-bg:${th.bg};--c-accent:${th.accent};--c-text:${th.text};--c-surface:${th.surface}"><a class="demo-cover" href="${href}" data-preview="${href}" aria-label="${esc(ui.demos.open)}: ${esc(t.name)}"><span class="cover-art" aria-hidden="true">${DEMO_ICONS[demo.icon]}<span class="cover-name" style="font-family:${th.display}">${esc(t.name)}</span></span><span class="cover-frame" aria-hidden="true"></span></a><div class="demo-meta"><div><span class="cat">${esc(t.category)}</span><h3>${esc(t.name)}</h3></div><a class="btn btn-small" href="${href}">${esc(ui.demos.open)} ${ICON.arrow}</a></div></article>`;
}

function demos(lang, ui) {
  return `<section class="section" id="demos"><div class="wrap"><p class="eyebrow">${esc(ui.demos.eyebrow)}</p><h2 class="h2">${ui.demos.title}</h2><p class="lede">${esc(ui.demos.lede)}</p><div class="demo-grid">${DEMOS.map((d) => demoCard(lang, d, ui)).join("")}</div></div></section>`;
}

function process(ui) {
  return `<section class="section alt" id="process"><div class="wrap"><p class="eyebrow">${esc(ui.process.eyebrow)}</p><h2 class="h2">${ui.process.title}</h2><ol class="steps">${ui.process.steps.map((s) => `<li class="reveal"><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></li>`).join("")}</ol></div></section>`;
}

function why(ui) {
  return `<section class="section" id="why"><div class="wrap"><p class="eyebrow">${esc(ui.why.eyebrow)}</p><h2 class="h2">${ui.why.title}</h2><div class="grid grid-3">${ui.why.items.map((i) => `<article class="card reveal"><span class="ic">${ICON[i.icon]}</span><h3>${esc(i.t)}</h3><p>${esc(i.d)}</p></article>`).join("")}</div></div></section>`;
}

function pricingTeaser(lang, ui) {
  const mini = TIERS.map((t) => `<a class="mini-tier${t.popular ? " pop" : ""}" href="${PATHS.pricing[lang]}#${t.id}"><span>${esc(ui.pricing.tiers[t.id].name)}</span><strong>${fmt(t.price)} €</strong></a>`).join("");
  return `<section class="section alt" id="pricing"><div class="wrap split"><div><p class="eyebrow">${esc(ui.pricingTeaser.eyebrow)}</p><h2 class="h2">${ui.pricingTeaser.title}</h2><p class="lede">${esc(ui.pricingTeaser.lede)}</p><a class="btn btn-primary" href="${PATHS.pricing[lang]}">${esc(ui.pricingTeaser.cta)} ${ICON.arrow}</a></div><div class="mini-tiers">${mini}</div></div></section>`;
}

export function contact(lang, ui) {
  return `<section class="section" id="contact"><div class="wrap contact-box reveal"><p class="eyebrow">${esc(ui.contact.eyebrow)}</p><h2 class="h2">${ui.contact.title}</h2><p class="lede">${esc(ui.contact.lede)}</p><div class="cta-row"><a class="btn btn-primary" href="mailto:${BRAND_EMAIL}">${ICON.mail} ${esc(ui.contact.email)}</a><a class="btn btn-ghost" href="${CONTACT_URL[lang]}" target="_blank" rel="noopener">${esc(ui.contact.site)} ${ICON.arrow}</a></div><p class="tiny">${ICON.pin} ${esc(ui.contact.where)}</p></div></section>`;
}

function schema(lang, ui, path) {
  return jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      ORG,
      { "@type": "WebSite", "@id": `${SITE}/#website`, url: SITE, name: "Carbon Stealth Portfolio", inLanguage: LANGS, publisher: { "@id": ORG["@id"] } },
      { "@type": "CollectionPage", "@id": SITE + path, url: SITE + path, name: ui.meta.hubTitle, description: ui.meta.hubDesc, inLanguage: lang, isPartOf: { "@id": `${SITE}/#website` },
        hasPart: DEMOS.map((d) => ({ "@type": "WebPage", name: d.t[lang].name, url: SITE + demoPath(lang, d), about: d.t[lang].category })) },
      { "@type": "Service", name: ui.meta.hubTitle.split("|")[0].trim(), provider: { "@id": ORG["@id"] }, areaServed: ["BG", "IT", "EU"], serviceType: "Web design and development",
        offers: TIERS.map((t) => ({ "@type": "Offer", name: ui.pricing.tiers[t.id].name, price: t.price, priceCurrency: "EUR", url: SITE + PATHS.pricing[lang] + "#" + t.id })) },
    ],
  });
}

export function renderHub(lang) {
  const ui = I18N[lang], path = PATHS.hub[lang];
  return join([
    head({ lang, title: ui.meta.hubTitle, description: ui.meta.hubDesc, keywords: ui.meta.hubKeywords, path, paths: PATHS.hub, fonts: HUB_FONTS, css: ["/assets/site.css"], themeColor: BRAND_BG, extra: schema(lang, ui, path) }),
    `<body class="hub">`, siteNav(lang, ui, PATHS.hub),
    `<main>`, hero(ui), demos(lang, ui), process(ui), why(ui), pricingTeaser(lang, ui), contact(lang, ui), `</main>`,
    siteFooter(lang, ui),
    `<script src="/assets/site.js" defer></script>`,
    `</body></html>`,
  ]);
}
