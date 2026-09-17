// pricing.mjs — страницата с цени: пазарна таблица (доказателство) → пакети → добавки → ДДС →
// условия → FAQ → източници. Числата идват САМО от src/pricing.mjs, показани по ДДС конвенцията на
// carbonstealth.eu: BG бруто „с включен 20% ДДС“, EN/IT нето „excl. VAT / IVA esclusa“ (shown/shownMarket).
import { esc, join, head, jsonLd, ICON, ORG, PATHS, SITE, BRAND_EMAIL } from "../lib/html.mjs";
import { I18N } from "../i18n/index.mjs";
import { TIERS, ADDONS, MARKET_RANGES, SOURCES, RESEARCH_DATE, discountPct, fmt, money, shown, shownMarket, tx, VAT_CONVENTION } from "../pricing.mjs";
import { siteNav, siteFooter, contact, boot, ghost, HUB_FONTS, BRAND_BG } from "./hub.mjs";

const range = ([a, b], lang, suffix = "") => `${fmt(shownMarket(a, lang), lang)} – ${fmt(shownMarket(b, lang), lang)} €${suffix}`;

function market(p, lang) {
  const monthly = new Set(["maint", "seo"]);
  return `<section class="section alt" id="market"><div class="wrap"><div class="tag reveal">// 2026</div>${ghost(esc(p.marketTitle))}<p class="lede reveal">${esc(p.marketLede)}</p><div class="table-wrap reveal"><table class="table"><thead><tr><th>${esc(p.marketCols.item)}</th><th>${esc(p.marketCols.bg)}</th><th>${esc(p.marketCols.it)}</th><th>${esc(p.marketCols.eu)}</th></tr></thead><tbody>${MARKET_RANGES.map((r) => { const s = monthly.has(r.id) ? " " + p.perMonth : ""; return `<tr><th scope="row">${esc(p.marketRows[r.id])}</th><td>${range(r.bg, lang, s)}</td><td>${range(r.it, lang, s)}</td><td>${range(r.eu, lang, s)}</td></tr>`; }).join("")}</tbody></table></div></div></section>`;
}

function tiers(p, lang) {
  return `<section class="section" id="packages"><div class="wrap">${ghost(esc(p.packagesTitle))}<p class="lede">${esc(p.packagesLede)}</p><div class="tiers">${TIERS.map((t) => { const x = p.tiers[t.id]; return `<article class="tier${t.popular ? " pop" : ""} reveal" id="${t.id}" data-cursor>${t.popular ? `<span class="pop-badge">${esc(p.popular)}</span>` : ""}<p class="tier-tag">${esc(x.tag)}</p><h3>${esc(x.name)}</h3><p class="tier-desc">${esc(x.desc)}</p><p class="tier-price"><strong>${money(shown(t.price, lang), lang)}</strong><span class="tier-market"><s>${money(shownMarket(t.market, lang), lang)}</s> ${esc(p.market)} · <b>−${discountPct(t)}% ${esc(p.saving)}</b></span></p><ul>${x.features.map((f) => `<li>${ICON.check}<span>${esc(f)}</span></li>`).join("")}</ul><p class="tier-delivery">${ICON.clock} ${esc(p.delivery)}: ${t.days[0]}–${t.days[1]} ${esc(p.days)}</p><a class="btn ${t.popular ? "btn-solid" : ""}" data-magnetic href="mailto:${BRAND_EMAIL}?subject=${encodeURIComponent(x.name + " — Carbon Stealth")}">${esc(p.choose)} ${ICON.arrow}</a></article>`; }).join("")}</div></div></section>`;
}

function addons(p, lang) {
  return `<section class="section alt" id="addons"><div class="wrap">${ghost(esc(p.addonsTitle))}<p class="lede">${esc(p.addonsLede)}</p><div class="addons">${ADDONS.map((a) => `<div class="addon reveal"><span>${esc(p.addons[a.id])}</span><span class="addon-price"><strong>${money(shown(a.price, lang), lang)}</strong> <small>${esc(a.kind === "monthly" ? p.monthly : p.once)}</small><em>−${discountPct(a)}%</em></span></div>`).join("")}</div></div></section>`;
}

function vat(p) {
  const v = p.vat;
  return `<section class="section" id="vat"><div class="wrap">${ghost(esc(p.vatTitle))}<div class="grid1" style="margin-top:40px">${v.items.map(([h, d], i) => `<article class="cell${i === 1 ? " vat-eu" : ""} reveal"><span class="ic">${i === 0 ? ICON.euro : i === 1 ? ICON.globe : ICON.layers}</span><h3>${esc(h)}</h3><p>${esc(d)}</p></article>`).join("")}</div><p class="tiny vat-note">${esc(v.note)}</p></div></section>`;
}

function terms(p, lang) {
  return `<section class="section alt" id="terms"><div class="wrap" style="max-width:820px">${ghost(esc(p.termsTitle))}<div style="height:24px"></div><ul class="terms">${p.terms.map((t) => tx(t, lang)).map((t) => `<li>${ICON.check}<span>${esc(t)}</span></li>`).join("")}</ul></div></section>`;
}

function faq(p) {
  return `<section class="section" id="faq"><div class="wrap" style="max-width:820px">${ghost(esc(p.faqTitle))}<div style="height:24px"></div>${p.faq.map((f, i) => `<details class="faq"${i === 0 ? " open" : ""}><summary><h3>${esc(f.q)}</h3></summary><p>${esc(f.a)}</p></details>`).join("")}</div></section>`;
}

function sources(p) {
  return `<section class="section alt" id="sources"><div class="wrap" style="max-width:820px"><div class="tag">// ${esc(p.sourcesTitle)}</div><p class="tiny">${esc(p.sourcesLede)} ${RESEARCH_DATE}.</p><ol class="sources">${SOURCES.map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener nofollow">${esc(s.name)}</a></li>`).join("")}</ol></div></section>`;
}

function schema(lang, ui, path) {
  const p = ui.pricing, gross = VAT_CONVENTION[lang] === "gross";
  return jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": SITE + path, url: SITE + path, name: tx(ui.meta.pricingTitle, lang), description: tx(ui.meta.pricingDesc, lang), inLanguage: lang, isPartOf: { "@id": `${SITE}/#website` }, publisher: ORG },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Carbon Stealth Portfolio", item: SITE + PATHS.hub[lang] }, { "@type": "ListItem", position: 2, name: p.packagesTitle, item: SITE + path }] },
      ...TIERS.map((t) => ({ "@type": "Product", name: `${p.tiers[t.id].name} — ${p.tiers[t.id].tag}`, description: p.tiers[t.id].desc, brand: { "@type": "Brand", name: "Carbon Stealth" }, offers: { "@type": "Offer", price: shown(t.price, lang), priceCurrency: "EUR", url: SITE + path + "#" + t.id, availability: "https://schema.org/InStock", priceValidUntil: "2026-12-31", priceSpecification: { "@type": "UnitPriceSpecification", price: shown(t.price, lang), priceCurrency: "EUR", valueAddedTaxIncluded: gross }, seller: { "@id": ORG["@id"] } } })),
      { "@type": "FAQPage", mainEntity: p.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  });
}

export function renderPricing(lang) {
  const ui = I18N[lang], p = ui.pricing, path = PATHS.pricing[lang];
  return join([
    head({ lang, title: tx(ui.meta.pricingTitle, lang), description: tx(ui.meta.pricingDesc, lang), keywords: ui.meta.pricingKeywords, path, paths: PATHS.pricing, fonts: HUB_FONTS, css: ["/assets/site.css"], themeColor: BRAND_BG, extra: schema(lang, ui, path) }),
    `<body class="hub">`, boot(ui), siteNav(lang, ui, PATHS.pricing),
    `<main id="main"><section class="hero hero-sm"><div class="hero-scan" aria-hidden="true"><i></i></div><div class="wrap"><div class="tag">// ${esc(p.eyebrow)}</div><h1 style="font-size:clamp(2.2rem,6vw,4.6rem);letter-spacing:-.04em;max-width:900px">${p.title}</h1><p class="lede">${esc(p.lede)}</p><p class="hud">${esc(p.hud)}</p></div></section>`,
    market(p, lang), tiers(p, lang), addons(p, lang), vat(p), terms(p, lang), faq(p), sources(p),
    `<section class="section"><div class="wrap"><div class="contact-box reveal"><i class="corner c1"></i><i class="corner c2"></i><i class="corner c3"></i><i class="corner c4"></i><h2 class="contact-title">${p.ctaTitle}</h2><p class="lede">${esc(p.ctaLede)}</p><div class="cta-row"><a class="btn btn-solid" href="mailto:${BRAND_EMAIL}" data-magnetic>${ICON.mail} ${esc(ui.contact.email)}</a><a class="btn" href="${PATHS.hub[lang]}#demos" data-magnetic>${esc(ui.nav.demos)} ${ICON.arrow}</a></div></div></div></section></main>`,
    siteFooter(lang, ui), `<script src="/assets/site.js" defer></script>`, `</body></html>`,
  ]);
}
