// hosting.mjs — страницата „Хостинг и поддръжка": двата плана (цените от src/pricing.mjs по ДДС конвенцията),
// как е устроено, какво не е включено, FAQ (FAQPage JSON-LD).
import { esc, join, head, jsonLd, ICON, ORG, PATHS, SITE, BRAND_EMAIL } from "../lib/html.mjs";
import { I18N } from "../i18n/index.mjs";
import { ADDONS, money, shown } from "../pricing.mjs";
import { siteNav, siteFooter, ghost, contact, HUB_FONTS, BRAND_BG } from "./hub.mjs";

export function renderHosting(lang) {
  const ui = I18N[lang], h = ui.hosting, p = ui.pricing, path = PATHS.hosting[lang];
  const price = (id) => ADDONS.find((a) => a.id === id);
  const plans = h.plans.map((pl) => { const a = price(pl.price); return `<article class="tier${pl.popular ? " pop" : ""}">${pl.popular ? `<span class="pop-badge">${esc(p.popular)}</span>` : ""}<h2>${esc(pl.name)}</h2><p class="tier-price"><strong>${money(shown(a.price, lang), lang)}</strong><span class="tier-market">${esc(p.monthly)} · ${esc(ui.pricing.hud)}</span></p><ul>${pl.items.map((i) => `<li>${ICON.check}<span>${esc(i)}</span></li>`).join("")}</ul><a class="btn ${pl.popular ? "btn-solid" : ""}" href="mailto:${BRAND_EMAIL}?subject=${encodeURIComponent(pl.name + " — Carbon Stealth")}">${esc(p.choose)}</a></article>`; }).join("");
  const schema = jsonLd({ "@context": "https://schema.org", "@graph": [
    { "@type": "WebPage", "@id": SITE + path, url: SITE + path, name: h.title, description: h.desc, inLanguage: lang, isPartOf: { "@id": `${SITE}/#website` }, publisher: ORG },
    { "@type": "Service", name: h.eyebrow, serviceType: "Web hosting and maintenance", provider: { "@id": ORG["@id"] }, areaServed: ["BG", "IT", "EU"], offers: h.plans.map((pl) => ({ "@type": "Offer", name: pl.name, price: shown(price(pl.price).price, lang), priceCurrency: "EUR", priceSpecification: { "@type": "UnitPriceSpecification", price: shown(price(pl.price).price, lang), priceCurrency: "EUR", unitCode: "MON", valueAddedTaxIncluded: lang === "bg" } })) },
    { "@type": "FAQPage", mainEntity: h.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Carbon Stealth Portfolio", item: SITE + PATHS.hub[lang] }, { "@type": "ListItem", position: 2, name: h.eyebrow, item: SITE + path }] },
  ] });
  return join([
    head({ lang, title: h.title, description: h.desc, keywords: h.keywords, path, paths: PATHS.hosting, fonts: HUB_FONTS, css: ["/assets/site.css"], themeColor: BRAND_BG, extra: schema }),
    `<body class="hub">`, siteNav(lang, ui, PATHS.hosting),
    `<main id="main"><section class="section" style="padding-top:140px;padding-bottom:40px"><div class="wrap"><div class="tag">${esc(h.eyebrow)}</div><h1 class="h2">${h.h1}</h1><p class="lede">${esc(h.lede)}</p><div class="tiers tiers-2">${plans}</div></div></section>`,
    `<section class="section alt"><div class="wrap">${ghost(esc(h.factsTitle))}<div class="grid1" style="margin-top:40px">${h.facts.map(([t, d]) => `<article class="cell"><h3>${esc(t)}</h3><p>${esc(d)}</p></article>`).join("")}</div></div></section>`,
    `<section class="section"><div class="wrap" style="max-width:820px">${ghost(esc(h.notTitle))}<div style="height:24px"></div><ul class="terms">${h.not.map((n) => `<li>${ICON.arrow}<span>${esc(n)}</span></li>`).join("")}</ul></div></section>`,
    `<section class="section alt"><div class="wrap" style="max-width:820px">${ghost(esc(h.faqTitle))}<div style="height:24px"></div>${h.faq.map((f, i) => `<details class="faq"${i === 0 ? " open" : ""}><summary><h3>${esc(f.q)}</h3></summary><p style="padding:0 0 18px;font-size:12px;line-height:1.9;color:var(--text-2)">${esc(f.a)}</p></details>`).join("")}</div></section>`,
    contact(lang, ui), `</main>`,
    siteFooter(lang, ui), `<script src="/assets/site.js" defer></script>`, `</body></html>`,
  ]);
}
