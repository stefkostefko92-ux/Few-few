// hub.mjs — началната страница във визията на „Двубой в Рейвънхолд“ (boy/): бурята в hero-то е единственото
// шумно нещо; под нея — тиха програма: демотата като кадри с надпис, реалните проекти, процесът като римски
// глави, „защо", ценоразпис, въпроси и контактът като краен надпис. Общите части (nav/footer/contact/ghost)
// се ползват и от цените, правната, блога и вертикалите.
import { esc, join, head, credit, jsonLd, ORG, PATHS, demoPath, SITE, LANGS, BRAND_EMAIL, BRAND_URL, BROCHURE_PDF } from "../lib/html.mjs";
import { I18N } from "../i18n/index.mjs";
import { DEMOS } from "../demos/index.mjs";
import { DEMO_ICONS } from "./icons.mjs";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PUBLIC = fileURLToPath(new URL("../../public/", import.meta.url));
const LAB_FILE = fileURLToPath(new URL("../../perf/lab.json", import.meta.url));
/** Лабораторното измерване (tools/perf.mjs → perf/lab.json); липсва ли — няма бадж, не измисляме числа. */
export const LAB = existsSync(LAB_FILE) ? JSON.parse(readFileSync(LAB_FILE, "utf8")) : null;
export function labBadge(id, ui) {
  const p = LAB?.pages?.[id]; if (!p) return "";
  const m = p.mobile?.score, d = p.desktop?.score; if (m == null || d == null) return "";
  const cls = (s) => (s >= 90 ? "ok" : s >= 50 ? "mid" : "bad");
  return `<span class="lab" title="${esc(ui.demos.labTitle)} · ${LAB.date}"><i class="${cls(m)}">${m}</i><i class="${cls(d)}">${d}</i><span>${esc(ui.demos.lab)}</span></span>`;
}
/** Статичното превю от tools/previews.mjs (960×600 webp) — картата го показва вместо 10 живи iframe-а. */
const previewShot = (lang, demo, alt) => existsSync(`${PUBLIC}img/previews/${lang}/${demo.id}.webp`) ? `<img class="cover-shot" src="/img/previews/${lang}/${demo.id}.webp" alt="${esc(alt)}" width="960" height="600" loading="lazy" decoding="async">` : "";
import { TIERS, money, shown, tx, VAT_CONVENTION } from "../pricing.mjs";
import { PROJECTS } from "../projects.mjs";
import { projectCard } from "./projects.mjs";
import { VERTICALS, verticalPath } from "../verticals/index.mjs";

export const HUB_FONTS = ["brand"];
export const BRAND_BG = "#000000";
const CONTACT_URL = { bg: `${BRAND_URL}/bg/contact/`, en: `${BRAND_URL}/en/contact/`, it: `${BRAND_URL}/contact/` };

/** Заглавие на секция (името е историческо — ехо копията и boot екранът отпаднаха с новата визия). */
export const ghost = (html) => `<h2 class="h2">${html}</h2>`;

const logo = (extra = "") => `<picture><source srcset="/logo.webp" type="image/webp"><img class="logo" src="/logo.png" alt="Carbon Stealth VCC" width="673" height="160"${extra}></picture>`;

export function siteNav(lang, ui, current) {
  const links = [[`${PATHS.hub[lang]}#demos`, ui.nav.demos], [PATHS.projects[lang], ui.nav.projects], [`${PATHS.hub[lang]}#process`, ui.nav.process], [PATHS.vertical[lang], ui.nav.vertical], [PATHS.pricing[lang], ui.nav.pricing], [PATHS.quote[lang], ui.nav.quoteNav], [PATHS.blog[lang], ui.nav.blogNav], [`${PATHS.hub[lang]}#contact`, ui.nav.contact]];
  const langs = LANGS.map((l) => `<a href="${current[l]}" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="page"' : ""}>${I18N[l].short}</a>`).join("");
  return `<a class="cs-skip" href="#main">${esc(ui.nav.demos)}</a><header class="nav"><a href="${PATHS.hub[lang]}" aria-label="Carbon Stealth VCC">${logo()}</a><nav class="nav-links" aria-label="Menu">${links.map(([h, l]) => `<a href="${h}">${esc(l)}</a>`).join("")}</nav><div class="nav-right"><button type="button" class="fx-toggle" data-fx-toggle data-on="${esc(ui.nav.pauseOn)}" aria-pressed="false">${esc(ui.nav.pause)}</button><nav class="langs" aria-label="Language">${langs}</nav><button class="burger" aria-expanded="false" aria-controls="menu" aria-label="${esc(ui.nav.menu)}">≡</button></div></header><nav id="menu" class="mobile-menu" aria-label="Menu">${links.map(([h, l]) => `<a href="${h}">${esc(l)}</a>`).join("")}<button type="button" class="fx-toggle fx-mobile" data-fx-toggle data-on="${esc(ui.nav.pauseOn)}" aria-pressed="false">${esc(ui.nav.pause)}</button></nav>`;
}

export function siteFooter(lang, ui) {
  const b = ui.brand;
  return `<footer class="foot"><div class="wrap"><div class="foot-grid"><div>${logo(' loading="lazy"')}<p class="desc">${esc(b.desc)}</p></div><div><h2 class="foot-h">${esc(b.cols.demos)}</h2><ul>${DEMOS.map((d) => `<li><a href="${demoPath(lang, d)}">${esc(d.t[lang].name)} · ${esc(d.t[lang].category)}</a></li>`).join("")}</ul></div><div><h2 class="foot-h">${esc(b.cols.company)}</h2><ul>${b.company.map(([h, l]) => `<li><a href="${h}"${h.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}>${esc(l)}</a></li>`).join("")}<li><a href="${PATHS.projects[lang]}">${esc(ui.nav.projects)}</a></li><li><a href="${PATHS.admin[lang]}">${esc(ui.admin.eyebrow)}</a></li><li><a href="${PATHS.pricing[lang]}">${esc(ui.nav.pricing)}</a></li><li><a href="${PATHS.quote[lang]}">${esc(ui.nav.quoteNav)}</a></li><li><a href="${PATHS.hosting[lang]}">${esc(ui.nav.hostingNav)}</a></li><li><a href="${PATHS.blog[lang]}">${esc(ui.nav.blogNav)}</a></li><li><a href="${PATHS.local[lang]}">${esc(ui.local.eyebrow)}</a></li><li><a href="${PATHS.vertical[lang]}">${esc(ui.vertical.eyebrow)}</a></li></ul></div><div><h2 class="foot-h">${esc(b.cols.legal)}</h2><ul><li><a href="${PATHS.legal[lang]}">${esc(ui.footer.legal)}</a></li><li><a href="${PATHS.a11y[lang]}">${esc(ui.nav.a11y)}</a></li><li><a href="${BROCHURE_PDF[lang]}" download>${esc(ui.nav.brochure)} · PDF A5</a></li><li><a href="/llms.txt">llms.txt</a></li><li><a href="/sitemap.xml">sitemap.xml</a></li></ul></div></div><div class="badges">${b.badges.map((x) => `<span>${esc(x)}</span>`).join("")}</div><div class="impressum"><div>${esc(b.impressum)}</div><div>© ${new Date().getFullYear()} Carbon Stealth VCC · ${esc(ui.footer.rights)} ${esc(ui.footer.built)}</div>${credit(lang)}</div></div></footer>`;
}

/** Hero: бурята (hero.js върху #hero-canvas, CSS кадър отдолу) и надпис на филмов кадър долу вляво. */
function hero(ui) {
  return `<section class="hero" id="top"><canvas class="hero-canvas" id="hero-canvas" aria-hidden="true"></canvas><div class="wrap"><p class="tag">${esc(ui.hero.eyebrow)}</p><h1>${ui.hero.title}</h1><p class="hero-desc">${esc(ui.hero.lede)}</p><div class="cta-row"><a class="btn btn-solid" href="#demos">${esc(ui.hero.ctaDemos)}</a><a class="btn" href="${PATHS.pricing[ui.code]}">${esc(ui.hero.ctaPricing)}</a></div>${ui.hero.proof ? `<p class="hero-proof">${esc(ui.hero.proof)}</p>` : ""}<ul class="stats">${ui.hero.stats.map((s) => `<li><b>${esc(s.n)}</b>${esc(s.l)}</li>`).join("")}</ul></div></section>`;
}

function demoCard(lang, demo, ui) {
  const t = demo.t[lang], th = demo.theme, href = demoPath(lang, demo);
  return `<article class="demo-card" style="--c-bg:${th.bg};--c-accent:${th.accent};--c-text:${th.text};--c-surface:${th.surface}"><a class="demo-cover" href="${href}" data-preview="${href}" aria-label="${esc(ui.demos.open)}: ${esc(t.name)}"><span class="cover-art" aria-hidden="true">${DEMO_ICONS[demo.icon]}<span class="cover-name" style="font-family:${th.display}">${esc(t.name)}</span></span>${previewShot(lang, demo, t.name)}<span class="live" aria-hidden="true">${esc(ui.brand.live)}</span></a><div class="demo-meta"><span class="cat">${esc(t.category)}</span><h3>${esc(t.name)}</h3><span class="inc">${esc(ui.demos.includes[t.hero.widget.kind] || "")}. ${esc(ui.demos.includes.always)}</span>${labBadge(demo.id, ui)}<span class="sw" aria-hidden="true"><i style="background:${th.bg}"></i><i style="background:${th.accent}"></i><i style="background:${th.accent2}"></i><i style="background:${th.text}"></i></span><div class="demo-actions"><a class="open" href="${href}">${esc(ui.brand.open)}</a><button class="dev-btn" type="button" data-device="${href}" data-name="${esc(t.name)}">${esc(ui.brand.preview)}</button></div><a class="v-link" href="${verticalPath(lang, demo)}">${esc(ui.vertical.priceFor.replace("{business}", t.category.charAt(0).toLowerCase() + t.category.slice(1)))}</a></div></article>`;
}

/** Модал „преглед на устройства": iframe на демото в десктоп · таблет · телефон рамка (site.js). */
function devModal(ui) {
  const b = ui.brand;
  return `<div class="devmodal" id="devmodal" hidden role="dialog" aria-modal="true" aria-label="${esc(b.preview)}"><div class="dev-bar"><span class="dev-name hud"></span><div class="dev-switch" role="group" aria-label="${esc(b.preview)}"><button type="button" class="on" data-w="1440">${esc(b.devices.desktop)}</button><button type="button" data-w="834">${esc(b.devices.tablet)}</button><button type="button" data-w="390">${esc(b.devices.phone)}</button></div><a class="dev-open" href="#" target="_blank" rel="noopener">${esc(b.openNew)}</a><button type="button" class="dev-close" aria-label="${esc(b.close)}">✕</button></div><div class="dev-stage"><div class="dev-frame" style="--w:1440px"><iframe title="" loading="lazy"></iframe></div></div></div>`;
}

function demos(lang, ui) {
  return `<section class="section" id="demos"><div class="wrap"><p class="tag">${esc(ui.demos.eyebrow)}</p>${ghost(ui.demos.title)}<p class="lede">${esc(ui.demos.lede)}</p><div class="reel">${DEMOS.map((d) => demoCard(lang, d, ui)).join("")}</div><p class="more"><a class="btn" href="${PATHS.vertical[lang]}">${esc(ui.vertical.eyebrow)}</a><a class="btn" href="${PATHS.admin[lang]}">${esc(ui.admin.eyebrow)}</a></p></div></section>${devModal(ui)}`;
}

/** Реалните проекти (6 от 10 в хъба, всичките на /proekti/) — доказателството, че демотата не са само демота. */
function projects(lang, ui) {
  const p = ui.projects;
  return `<section class="section alt" id="projects"><div class="wrap"><p class="tag">${esc(p.eyebrow)}</p>${ghost(p.title)}<p class="lede">${esc(p.lede)}</p><div class="grid1 projects">${PROJECTS.slice(0, 6).map((pr, i) => projectCard(lang, pr, ui, i, false)).join("")}</div><p class="more"><a class="btn" href="${PATHS.projects[lang]}">${esc(p.all)}</a></p></div></section>`;
}

/** Процесът е истинска последователност → римски глави (като главите на boy), единствените номера на сайта. */
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
function process(ui) {
  return `<section class="section" id="process"><div class="wrap"><p class="tag">${esc(ui.process.eyebrow)}</p>${ghost(ui.process.title)}<ol class="chapters">${ui.process.steps.map((s, i) => `<li><span class="num" aria-hidden="true">${ROMAN[i]}</span><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></li>`).join("")}</ol></div></section>`;
}

function why(ui) {
  return `<section class="section alt" id="why"><div class="wrap"><p class="tag">${esc(ui.why.eyebrow)}</p>${ghost(ui.why.title)}<div class="grid1" style="margin-top:48px">${ui.why.items.map((i) => `<article class="cell"><h3>${esc(i.t)}</h3><p>${esc(i.d)}</p></article>`).join("")}</div></div></section>`;
}

function pricingTeaser(lang, ui) {
  return `<section class="section" id="pricing"><div class="wrap"><p class="tag">${esc(ui.pricingTeaser.eyebrow)}</p>${ghost(tx(ui.pricingTeaser.title, lang))}<p class="lede">${esc(ui.pricingTeaser.lede)}</p><div class="mini">${TIERS.map((t) => `<a class="${t.popular ? "pop" : ""}" href="${PATHS.pricing[lang]}#${t.id}"><span>${esc(ui.pricing.tiers[t.id].name)}<small>${t.popular ? `${esc(ui.pricing.popular)}. ` : ""}${esc(ui.pricing.tiers[t.id].tag)}</small></span><b>${money(shown(t.price, lang), lang)}</b></a>`).join("")}</div><p class="more"><a class="btn" href="${PATHS.pricing[lang]}">${esc(ui.pricingTeaser.cta)}</a><a class="btn" href="${PATHS.quote[lang]}">${esc(ui.quote.eyebrow)}</a></p></div></section>`;
}

// Формата праща POST /api/contact (api/server.mjs зад Nginx). С JS — fetch + съобщение на място; без JS —
// обикновен POST и HTML отговор от API-то. Honeypot полето „website" е скрито за хора, ботовете го пълнят.
function contactForm(lang, ui) {
  const f = ui.contact.form;
  const consent = esc(f.consent).replace("{legal}", `<a href="${PATHS.legal[lang]}">${esc(f.consentLink)}</a>`);
  const msgs = { sending: f.sending, sent: f.sent, invalid: f.invalid, error: f.error };
  return `<form class="c-form" id="cform" action="/api/contact" method="post" novalidate data-lang="${lang}" data-t="${esc(JSON.stringify(msgs))}"><input type="hidden" name="lang" value="${lang}">
<div class="c-grid"><label><span>${esc(f.name)}</span><input name="name" required minlength="2" maxlength="80" autocomplete="name"></label><label><span>${esc(f.email)}</span><input type="email" name="email" required maxlength="120" autocomplete="email" inputmode="email"></label><label><span>${esc(f.company)}</span><input name="company" maxlength="120" autocomplete="organization"></label><label><span>${esc(f.demo)}</span><select name="demo"><option value="">${esc(f.demoNone)}</option>${DEMOS.map((d) => `<option value="${d.id}">${esc(d.t[lang].name)} · ${esc(d.t[lang].category)}</option>`).join("")}</select></label></div>
<label class="c-msg"><span>${esc(f.message)}</span><textarea name="message" required minlength="10" maxlength="2000" rows="5" placeholder="${esc(f.messagePh)}"></textarea></label>
<label class="c-consent"><input type="checkbox" name="consent" value="on" required><span>${consent}</span></label>
<div class="c-hp" aria-hidden="true"><label>${esc(f.hp)}<input name="website" tabindex="-1" autocomplete="off"></label></div>
<div class="cta-row"><button class="btn btn-solid" type="submit">${esc(f.send)}</button><a class="btn" href="mailto:${BRAND_EMAIL}">${esc(ui.contact.email)}</a></div>
<p class="c-status" role="status" aria-live="polite"></p></form>`;
}

export function contact(lang, ui, title = ui.contact.title, lede = ui.contact.lede) {
  return `<section class="section alt" id="contact"><div class="wrap"><div class="contact-box"><p class="tag">${esc(ui.contact.eyebrow)}</p><h2 class="contact-title">${title}</h2><p class="lede">${esc(lede)}</p>${contactForm(lang, ui)}<p class="contact-where">${esc(ui.contact.where)}. <a href="${CONTACT_URL[lang]}" target="_blank" rel="noopener">${esc(ui.contact.site)}</a></p></div></div></section>`;
}

function schema(lang, ui, path) {
  return jsonLd({ "@context": "https://schema.org", "@graph": [
    ORG,
    { "@type": "WebSite", "@id": `${SITE}/#website`, url: SITE, name: "Carbon Stealth Portfolio", inLanguage: LANGS, publisher: { "@id": ORG["@id"] } },
    { "@type": "CollectionPage", "@id": SITE + path, url: SITE + path, name: ui.meta.hubTitle, description: ui.meta.hubDesc, inLanguage: lang, isPartOf: { "@id": `${SITE}/#website` }, speakable: { "@type": "SpeakableSpecification", cssSelector: [".hero h1", ".hero-desc"] }, hasPart: DEMOS.map((d) => ({ "@type": "WebPage", name: d.t[lang].name, url: SITE + demoPath(lang, d), about: d.t[lang].category })) },
    { "@type": "ProfessionalService", "@id": `${SITE}/#business`, name: "Carbon Stealth VCC", alternateName: "Carbon Stealth", url: SITE + path, image: `${SITE}/og.png`, logo: ORG.logo, email: ORG.email, vatID: ORG.vatID, address: ORG.address, geo: { "@type": "GeoCoordinates", latitude: 42.36, longitude: 23.0 }, areaServed: [{ "@type": "Country", name: "Bulgaria" }, { "@type": "Country", name: "Italy" }], knowsLanguage: LANGS, priceRange: "€€", sameAs: [BRAND_URL], parentOrganization: { "@id": ORG["@id"] }, serviceType: "Web design and development", makesOffer: TIERS.map((t) => ({ "@type": "Offer", name: ui.pricing.tiers[t.id].name, price: shown(t.price, lang), priceCurrency: "EUR", priceSpecification: { "@type": "UnitPriceSpecification", price: shown(t.price, lang), priceCurrency: "EUR", valueAddedTaxIncluded: VAT_CONVENTION[lang] === "gross" }, url: SITE + PATHS.pricing[lang] + "#" + t.id })), hasOfferCatalog: { "@type": "OfferCatalog", name: ui.vertical.eyebrow, itemListElement: DEMOS.map((d) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: VERTICALS[lang][d.id].h1, url: SITE + verticalPath(lang, d) } })) } },
    { "@type": "FAQPage", "@id": SITE + path + "#faq", mainEntity: ui.faq.items.map((f) => ({ "@type": "Question", name: tx(f.q, lang), acceptedAnswer: { "@type": "Answer", text: tx(f.a, lang) } })) },
  ] });
}

/** Въпроси и отговори (AEO): същият текст е във FAQPage схемата; отговорът е в първото изречение. */
function faqSection(lang, ui) {
  const f = ui.faq;
  return `<section class="section" id="faq"><div class="wrap" style="max-width:860px"><p class="tag">${esc(f.eyebrow)}</p>${ghost(f.title)}<div style="height:28px"></div>${f.items.map((it, i) => `<details class="faq"${i === 0 ? " open" : ""}><summary><h3>${esc(tx(it.q, lang))}</h3></summary><p class="faq-a">${esc(tx(it.a, lang))}</p></details>`).join("")}</div></section>`;
}

export function renderHub(lang) {
  const ui = I18N[lang], path = PATHS.hub[lang];
  return join([
    head({ lang, title: ui.meta.hubTitle, description: ui.meta.hubDesc, keywords: ui.meta.hubKeywords, path, paths: PATHS.hub, fonts: HUB_FONTS, css: ["/assets/site.css"], themeColor: BRAND_BG, extra: schema(lang, ui, path) }),
    `<body class="hub">`, siteNav(lang, ui, PATHS.hub),
    `<main id="main">`, hero(ui), demos(lang, ui), projects(lang, ui), process(ui), why(ui), pricingTeaser(lang, ui), faqSection(lang, ui), contact(lang, ui), `</main>`,
    siteFooter(lang, ui),
    `<script src="/assets/site.js" defer></script><script src="/assets/raven.js" defer></script><script src="/assets/hero.js" defer></script>`,
    `</body></html>`,
  ]);
}
