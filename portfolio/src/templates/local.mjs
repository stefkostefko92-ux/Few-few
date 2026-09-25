// local.mjs — локалните GEO страници: „Изработка на сайт в <град>": уникален абзац за града, кои демота
// пасват на местния бизнес, цени накратко, контакт. LocalBusiness/ProfessionalService JSON-LD с areaServed +
// geo на града, geo meta тагове (geo.region · geo.placename · geo.position · ICBM), карта на Leaflet няма —
// само статична връзка към OpenStreetMap (нула външни скриптове по CSP).
import { esc, join, head, jsonLd, ICON, ORG, PATHS, SITE, LANGS, demoPath, BRAND_ADDRESS } from "../lib/html.mjs";
import { I18N } from "../i18n/index.mjs";
import { CITIES } from "../local/cities.mjs";
import { DEMOS } from "../demos/index.mjs";
import { TIERS, money, shown, tx } from "../pricing.mjs";
import { siteNav, siteFooter, contact, HUB_FONTS, BRAND_BG } from "./hub.mjs";

export const localPath = (lang, c) => `${PATHS.local[lang]}${c.slug[lang]}/`;

export function renderLocalIndex(lang) {
  const ui = I18N[lang], L = ui.local, path = PATHS.local[lang];
  const schema = jsonLd({ "@context": "https://schema.org", "@graph": [
    { "@type": "CollectionPage", "@id": SITE + path, url: SITE + path, name: L.indexTitle, description: L.indexDesc, inLanguage: lang, isPartOf: { "@id": `${SITE}/#website` }, hasPart: CITIES.map((c) => ({ "@type": "WebPage", name: tx(L.h1, lang).replace("{city}", c.name[lang]), url: SITE + localPath(lang, c) })) },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Carbon Stealth Portfolio", item: SITE + PATHS.hub[lang] }, { "@type": "ListItem", position: 2, name: L.eyebrow, item: SITE + path }] },
  ] });
  return join([
    head({ lang, title: L.indexTitle, description: L.indexDesc, keywords: L.keywords, path, paths: PATHS.local, fonts: HUB_FONTS, css: ["/assets/site.css"], themeColor: BRAND_BG, extra: schema }),
    `<body class="hub">`, siteNav(lang, ui, PATHS.local),
    `<main id="main"><section class="section" style="padding-top:140px"><div class="wrap"><div class="tag">${esc(L.eyebrow)}</div><h1 class="h2">${L.indexH1}</h1><p class="lede">${esc(L.indexLede)}</p><div class="grid1"><article class="cell"><h2>${esc(L.bg)}</h2><ul class="city-list">${CITIES.filter((c) => c.country === "BG").map((c) => `<li><a href="${localPath(lang, c)}">${esc(c.name[lang])} →</a></li>`).join("")}</ul></article><article class="cell"><h2>${esc(L.it)}</h2><ul class="city-list">${CITIES.filter((c) => c.country === "IT").map((c) => `<li><a href="${localPath(lang, c)}">${esc(c.name[lang])} →</a></li>`).join("")}</ul></article><article class="cell"><h2>${esc(L.remote)}</h2><p>${esc(L.remoteText)}</p></article></div></div></section>`,
    contact(lang, ui), `</main>`,
    siteFooter(lang, ui), `<script src="/assets/site.js" defer></script>`, `</body></html>`,
  ]);
}

export function renderLocal(lang, c) {
  const ui = I18N[lang], L = ui.local, path = localPath(lang, c), city = c.name[lang];
  const paths = Object.fromEntries(LANGS.map((l) => [l, localPath(l, c)]));
  const rep = (s) => tx(s, lang).replace(/\{city\}/g, city);
  const picks = DEMOS.slice(0, 6);
  const schema = jsonLd({ "@context": "https://schema.org", "@graph": [
    { "@type": "ProfessionalService", "@id": SITE + path + "#service", name: `Carbon Stealth VCC — ${rep(L.h1)}`, url: SITE + path, description: rep(L.desc), image: `${SITE}/og.png`, telephone: undefined, email: ORG.email, address: ORG.address, areaServed: { "@type": "City", name: city, geo: { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lng } }, priceRange: `${money(shown(TIERS[0].price, lang), lang)} – ${money(shown(TIERS[2].price, lang), lang)}`, parentOrganization: { "@id": ORG["@id"] }, serviceType: "Web design and development" },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Carbon Stealth Portfolio", item: SITE + PATHS.hub[lang] }, { "@type": "ListItem", position: 2, name: L.eyebrow, item: SITE + PATHS.local[lang] }, { "@type": "ListItem", position: 3, name: city, item: SITE + path }] },
    { "@type": "FAQPage", mainEntity: L.faq.map((f) => ({ "@type": "Question", name: rep(f.q), acceptedAnswer: { "@type": "Answer", text: rep(f.a) } })) },
  ] });
  const geo = `<meta name="geo.region" content="${c.region}"><meta name="geo.placename" content="${esc(city)}"><meta name="geo.position" content="${c.lat};${c.lng}"><meta name="ICBM" content="${c.lat}, ${c.lng}">`;
  return join([
    head({ lang, title: rep(L.title), description: rep(L.desc), keywords: [...L.keywords.map(rep), city], path, paths, fonts: HUB_FONTS, css: ["/assets/site.css"], themeColor: BRAND_BG, extra: schema + geo }),
    `<body class="hub">`, siteNav(lang, ui, PATHS.local),
    `<main id="main"><section class="section" style="padding-top:140px"><div class="wrap"><nav class="crumbs" aria-label="breadcrumb"><a href="${PATHS.hub[lang]}">Portfolio</a> / <a href="${PATHS.local[lang]}">${esc(L.eyebrow)}</a> / ${esc(city)}</nav><h1 class="h2">${rep(L.h1)}</h1><p class="lede">${esc(c.text[lang])}</p><p class="lede">${esc(rep(L.lede))}</p><ul class="stats" style="margin:0 0 48px;grid-template-columns:repeat(3,1fr)"><li><b>${money(shown(TIERS[0].price, lang), lang)}</b><span>${esc(ui.pricing.tiers.start.tag)}</span></li><li><b>${TIERS[0].days[0]}–${TIERS[1].days[1]}</b><span>${esc(ui.pricing.days)}</span></li><li><b>${DEMOS.length}</b><span>${esc(ui.demos.eyebrow)}</span></li></ul></div></section>`,
    `<section class="section alt"><div class="wrap"><h2 class="sh">${esc(rep(L.demosTitle))}</h2><div class="grid1">${picks.map((d) => `<a class="cell" href="${demoPath(lang, d)}"><span class="cat">${esc(d.t[lang].category)}</span><h3>${esc(d.t[lang].name)}</h3><p>${esc(d.t[lang].hero.proof)}</p><span class="open">${esc(ui.brand.open)}</span></a>`).join("")}</div><p class="more"><a class="btn" href="${PATHS.hub[lang]}#demos">${esc(ui.hero.ctaDemos)}</a></p></div></section>`,
    `<section class="section"><div class="wrap" style="max-width:820px"><h2 class="sh">FAQ · ${esc(city)}</h2>${L.faq.map((f, i) => `<details class="faq"${i === 0 ? " open" : ""}><summary><h3>${esc(rep(f.q))}</h3></summary><p style="padding:0 0 18px;font-size:12px;line-height:1.9;color:var(--text-2)">${esc(rep(f.a))}</p></details>`).join("")}<p class="tiny" style="margin-top:20px">${esc(L.mapNote)} <a href="https://www.openstreetmap.org/?mlat=${c.lat}&amp;mlon=${c.lng}#map=12/${c.lat}/${c.lng}" target="_blank" rel="noopener">OpenStreetMap ↗</a> · ${esc(BRAND_ADDRESS.street)}, ${BRAND_ADDRESS.zip} ${esc(BRAND_ADDRESS.city)}</p></div></section>`,
    contact(lang, ui, rep(L.contactTitle)), `</main>`,
    siteFooter(lang, ui), `<script src="/assets/site.js" defer></script>`, `</body></html>`,
  ]);
}
