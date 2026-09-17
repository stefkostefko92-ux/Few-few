// pricing.mjs — страницата с цени: пазарна таблица (доказателство) → пакети → добавки → ДДС →
// условия → FAQ → източници. Числата идват САМО от src/pricing.mjs.
import { esc, join, head, jsonLd, ICON, ORG, PATHS, SITE, BRAND_EMAIL } from "../lib/html.mjs";
import { I18N } from "../i18n/index.mjs";
import { TIERS, ADDONS, MARKET_RANGES, SOURCES, RESEARCH_DATE, VAT_RATE_BG, discountPct, fmt } from "../pricing.mjs";
import { siteNav, siteFooter, contact, HUB_FONTS, BRAND_BG } from "./hub.mjs";

const range = ([a, b], suffix = "") => `${fmt(a)} – ${fmt(b)} €${suffix}`;

function market(p) {
  const monthly = new Set(["maint", "seo"]);
  return `<section class="section alt" id="market"><div class="wrap"><h2 class="h2">${esc(p.marketTitle)}</h2><p class="lede">${esc(p.marketLede)}</p><div class="table-wrap"><table class="table"><thead><tr><th>${esc(p.marketCols.item)}</th><th>${esc(p.marketCols.bg)}</th><th>${esc(p.marketCols.it)}</th><th>${esc(p.marketCols.eu)}</th></tr></thead><tbody>${MARKET_RANGES.map((r) => { const s = monthly.has(r.id) ? " " + p.perMonth : ""; return `<tr><th scope="row">${esc(p.marketRows[r.id])}</th><td>${range(r.bg, s)}</td><td>${range(r.it, s)}</td><td>${range(r.eu, s)}</td></tr>`; }).join("")}</tbody></table></div></div></section>`;
}

function tiers(p) {
  return `<section class="section" id="packages"><div class="wrap"><h2 class="h2">${esc(p.packagesTitle)}</h2><p class="lede">${esc(p.packagesLede)}</p><div class="tiers">${TIERS.map((t) => { const x = p.tiers[t.id]; return `<article class="tier${t.popular ? " pop" : ""} reveal" id="${t.id}">${t.popular ? `<span class="pop-badge">${esc(p.popular)}</span>` : ""}<p class="tier-tag">${esc(x.tag)}</p><h3>${esc(x.name)}</h3><p class="tier-desc">${esc(x.desc)}</p><p class="tier-price"><strong>${fmt(t.price)} €</strong><span class="tier-market"><s>${fmt(t.market)} €</s> ${esc(p.market)} · <b>−${discountPct(t)}%</b> ${esc(p.saving)}</span></p><ul>${x.features.map((f) => `<li>${ICON.check}<span>${esc(f)}</span></li>`).join("")}</ul><p class="tier-delivery">${ICON.clock} ${esc(p.delivery)}: ${t.days[0]}–${t.days[1]} ${esc(p.days)}</p><a class="btn ${t.popular ? "btn-primary" : "btn-ghost"}" href="mailto:${BRAND_EMAIL}?subject=${encodeURIComponent(x.name + " — Carbon Stealth")}">${esc(p.choose)} ${ICON.arrow}</a></article>`; }).join("")}</div></div></section>`;
}

function addons(p) {
  return `<section class="section alt" id="addons"><div class="wrap"><h2 class="h2">${esc(p.addonsTitle)}</h2><p class="lede">${esc(p.addonsLede)}</p><div class="addons">${ADDONS.map((a) => `<div class="addon reveal"><span>${esc(p.addons[a.id])}</span><span class="addon-price"><strong>${fmt(a.price)} €</strong> <small>${esc(a.kind === "monthly" ? p.monthly : p.once)}</small><em>−${discountPct(a)}%</em></span></div>`).join("")}</div></div></section>`;
}

function vat(p) {
  const v = p.vat;
  return `<section class="section" id="vat"><div class="wrap"><h2 class="h2">${esc(p.vatTitle)}</h2><div class="grid grid-3">${[v.bg, v.eu, v.world].map((x, i) => `<article class="card vat-card${i === 1 ? " vat-eu" : ""} reveal"><span class="ic">${i === 0 ? ICON.euro : i === 1 ? ICON.globe : ICON.layers}</span><h3>${esc(x.t)}</h3><p>${esc(x.d)}</p></article>`).join("")}</div><p class="tiny vat-note">${esc(v.note)}</p></div></section>`;
}

function terms(p) {
  return `<section class="section alt" id="terms"><div class="wrap narrow"><h2 class="h2">${esc(p.termsTitle)}</h2><ul class="terms">${p.terms.map((t) => `<li>${ICON.check}<span>${esc(t)}</span></li>`).join("")}</ul></div></section>`;
}

function faq(p) {
  return `<section class="section" id="faq"><div class="wrap narrow"><h2 class="h2">${esc(p.faqTitle)}</h2>${p.faq.map((f, i) => `<details class="faq"${i === 0 ? " open" : ""}><summary><h3>${esc(f.q)}</h3></summary><p>${esc(f.a)}</p></details>`).join("")}</div></section>`;
}

function sources(p) {
  return `<section class="section alt" id="sources"><div class="wrap narrow"><h2 class="h3">${esc(p.sourcesTitle)}</h2><p class="tiny">${esc(p.sourcesLede)} ${RESEARCH_DATE}.</p><ol class="sources">${SOURCES.map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener nofollow">${esc(s.name)}</a></li>`).join("")}</ol></div></section>`;
}

function schema(lang, ui, path) {
  const p = ui.pricing;
  return jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": SITE + path, url: SITE + path, name: ui.meta.pricingTitle, description: ui.meta.pricingDesc, inLanguage: lang, isPartOf: { "@id": `${SITE}/#website` }, publisher: ORG },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Carbon Stealth Portfolio", item: SITE + PATHS.hub[lang] }, { "@type": "ListItem", position: 2, name: p.packagesTitle, item: SITE + path }] },
      ...TIERS.map((t) => ({ "@type": "Product", name: `${p.tiers[t.id].name} — ${p.tiers[t.id].tag}`, description: p.tiers[t.id].desc, brand: { "@type": "Brand", name: "Carbon Stealth" }, offers: { "@type": "Offer", price: t.price, priceCurrency: "EUR", url: SITE + path + "#" + t.id, availability: "https://schema.org/InStock", priceValidUntil: "2026-12-31", seller: { "@id": ORG["@id"] } } })),
      { "@type": "FAQPage", mainEntity: p.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  });
}

export function renderPricing(lang) {
  const ui = I18N[lang], p = ui.pricing, path = PATHS.pricing[lang];
  return join([
    head({ lang, title: ui.meta.pricingTitle, description: ui.meta.pricingDesc, keywords: ui.meta.pricingKeywords, path, paths: PATHS.pricing, fonts: HUB_FONTS, css: ["/assets/site.css"], themeColor: BRAND_BG, extra: schema(lang, ui, path) }),
    `<body class="hub">`, siteNav(lang, ui, PATHS.pricing),
    `<main><section class="hero hero-sm"><div class="hex" aria-hidden="true"></div><div class="wrap"><p class="eyebrow">${esc(p.eyebrow)}</p><h1>${p.title}</h1><p class="lede">${esc(p.lede)}</p><p class="tiny">${esc(p.vat.bg.t)}: +${VAT_RATE_BG}% ${lang === "bg" ? "ДДС" : lang === "it" ? "IVA" : "VAT"} · ${esc(p.vat.eu.t)}: reverse charge</p></div></section>`,
    market(p), tiers(p), addons(p), vat(p), terms(p), faq(p), sources(p),
    `<section class="section"><div class="wrap contact-box reveal"><h2 class="h2">${p.ctaTitle}</h2><p class="lede">${esc(p.ctaLede)}</p><div class="cta-row"><a class="btn btn-primary" href="mailto:${BRAND_EMAIL}">${ICON.mail} ${esc(ui.contact.email)}</a><a class="btn btn-ghost" href="${PATHS.hub[lang]}#demos">${esc(ui.nav.demos)} ${ICON.arrow}</a></div></div></section></main>`,
    siteFooter(lang, ui), `<script src="/assets/site.js" defer></script>`, `</body></html>`,
  ]);
}
