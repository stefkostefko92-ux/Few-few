// vertical.mjs — SEO страниците „Изработка на сайт за <бизнес>“ (една на демо ×3 езика) + индексът им.
// Целят точно фразите, с които бизнес търси сайт („сайт за автосервиз“, „sito per ristorante“…): H1 с фразата,
// уникален увод (verticals/<lang>.mjs), какво включва (от данните на демото — нищо измислено), цена и срок от
// pricing.mjs, реалният Lighthouse резултат от perf/lab.json, демото със статично превю, FAQ (3 уникални + 2
// общи), Service + FAQPage + BreadcrumbList + Speakable JSON-LD и гъста вътрешна мрежа: демо ↔ вертикала ↔
// оферта ↔ блог ↔ градове ↔ други вертикали.
import { esc, join, head, jsonLd, ICON, ORG, PATHS, demoPath, SITE, LANGS, previewPath, ogPath } from "../lib/html.mjs";
import { I18N } from "../i18n/index.mjs";
import { DEMOS } from "../demos/index.mjs";
import { DEMO_ICONS } from "./icons.mjs";
import { TIERS, money, shown, tx } from "../pricing.mjs";
import { VERTICALS, verticalPath, verticalPaths } from "../verticals/index.mjs";
import { siteNav, siteFooter, boot, contact, ghost, HUB_FONTS, BRAND_BG, LAB } from "./hub.mjs";
import { ARTICLES } from "../blog/index.mjs";
import { articlePath } from "./blog.mjs";
import { CITIES } from "../local/cities.mjs";
import { localPath } from "./local.mjs";

const tier = (id) => TIERS.find((t) => t.id === id);
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);
export { previewPath, ogPath };

/** Плейсхолдърите на вертикалата: {business} = браншът (преди tx, защото tx има {business} = цената на пакета). */
function filler(lang, demo) {
  const business = lc(demo.t[lang].category);
  return (s) => tx(String(s).replace(/\{business_price\}/g, money(shown(tier("business").price, lang), lang).replace(/\s€$/, "")).replace(/\{business\}/g, business).replace(/\{n\}/g, DEMOS.length), lang);
}

function includesList(lang, demo, V) {
  const t = demo.t[lang], ui = I18N[lang], inc = V.includes, lab = LAB?.pages?.[demo.id];
  const items = [];
  const feature = ui.demos.includes[t.hero.widget?.kind];
  if (feature) items.push(inc.widget.replace("{feature}", feature));
  if (t.catalog) items.push(inc.catalog);
  items.push(inc.services.replace("{examples}", t.services.slice(0, 3).map((s) => s.t).join(", ")));
  if (t.offer) items.push(inc.offer);
  items.push(inc.always, inc.langs, inc.schema.replace("{schema}", demo.schemaType));
  if (lab?.mobile?.score != null && lab?.desktop?.score != null) items.push(inc.speed.replace("{mobile}", lab.mobile.score).replace("{desktop}", lab.desktop.score));
  items.push(inc.hosting, inc.admin);
  return items;
}

export function renderVertical(lang, demo) {
  const ui = I18N[lang], V = ui.vertical, v = VERTICALS[lang][demo.id], t = demo.t[lang], path = verticalPath(lang, demo);
  const rep = filler(lang, demo), business = lc(t.category);
  const paths = verticalPaths(demo);
  const preview = previewPath(lang, demo), og = ogPath(lang, demo);
  const start = tier("start"), biz = tier("business"), shop = tier("ecommerce");
  const lab = LAB?.pages?.[demo.id];
  const faqs = [...v.faq, ...V.faqGeneric].map((f) => ({ q: rep(f.q), a: rep(f.a) }));
  const related = DEMOS.filter((d) => d.id !== demo.id).slice(DEMOS.indexOf(demo) % 5, DEMOS.indexOf(demo) % 5 + 4);
  const relatedFilled = related.length >= 4 ? related : DEMOS.filter((d) => d.id !== demo.id).slice(0, 4);
  const articles = ARTICLES.slice(0, 3);
  const cities = CITIES.slice(0, 8);
  const includes = includesList(lang, demo, V);
  const schema = jsonLd({ "@context": "https://schema.org", "@graph": [
    ORG,
    { "@type": "WebPage", "@id": SITE + path, url: SITE + path, name: rep(v.title), description: rep(v.desc), inLanguage: lang, isPartOf: { "@id": `${SITE}/#website` }, ...(preview ? { primaryImageOfPage: { "@type": "ImageObject", url: SITE + preview, width: 960, height: 600 } } : {}), speakable: { "@type": "SpeakableSpecification", cssSelector: ["h1", ".v-lede"] } },
    { "@type": "Service", "@id": SITE + path + "#service", name: v.h1, serviceType: v.h1, description: rep(v.desc), provider: { "@id": ORG["@id"] }, areaServed: [{ "@type": "Country", name: "Bulgaria" }, { "@type": "Country", name: "Italy" }], availableLanguage: LANGS, url: SITE + path, offers: [start, biz, shop].map((tr) => ({ "@type": "Offer", name: ui.pricing.tiers[tr.id].name, price: shown(tr.price, lang), priceCurrency: "EUR", url: SITE + PATHS.pricing[lang], availability: "https://schema.org/InStock" })) },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Carbon Stealth Portfolio", item: SITE + PATHS.hub[lang] }, { "@type": "ListItem", position: 2, name: V.eyebrow, item: SITE + PATHS.vertical[lang] }, { "@type": "ListItem", position: 3, name: t.category, item: SITE + path }] },
    { "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ] });
  const hero = `<section class="section" style="padding-top:140px"><div class="wrap"><nav class="crumbs tag" aria-label="breadcrumb"><a href="${PATHS.hub[lang]}">Portfolio</a> / <a href="${PATHS.vertical[lang]}">${esc(V.crumb)}</a> / ${esc(t.category)}</nav><h1 class="h2 reveal">${esc(v.h1)}</h1><p class="lede v-lede reveal">${esc(rep(v.intro[0]))}</p><div class="cta-row reveal"><a class="btn btn-solid" href="${demoPath(lang, demo)}" data-magnetic>${esc(V.openDemo)} ${ICON.arrow}</a><a class="btn" href="${PATHS.quote[lang]}?demo=${demo.id}" data-magnetic>${esc(rep(V.quote))}</a></div><ul class="stats reveal"><li><b>${money(shown(start.price, lang), lang)}</b><span>${esc(V.stats.from)}</span></li><li><b>${start.days[0]}–${biz.days[1]}</b><span>${esc(V.stats.days)}</span></li><li><b>3</b><span>${esc(V.stats.langs)}</span></li>${lab ? `<li><b>${lab.mobile.score}/${lab.desktop.score}</b><span>${esc(V.stats.lab)}</span></li>` : ""}</ul></div></section>`;
  const demoBlock = `<section class="section alt" id="demo"><div class="wrap"><h2 class="tag reveal">// ${esc(V.demoTitle)}</h2><p class="lede reveal">${esc(V.demoLede)}</p><a class="v-shot reveal" href="${demoPath(lang, demo)}" style="--c-bg:${demo.theme.bg}">${preview ? `<img src="${preview}" alt="${esc(t.name)} — ${esc(t.category)}" width="960" height="600" loading="lazy" decoding="async">` : `<span class="v-shot-type" aria-hidden="true">${DEMO_ICONS[demo.icon] || ""}</span>`}<span class="v-shot-cta">${esc(V.openDemo)} ${ICON.arrow}</span></a></div></section>`;
  const includesBlock = `<section class="section" id="includes"><div class="wrap">${ghost(esc(rep(V.includesTitle)))}<ul class="v-includes">${includes.map((i) => `<li class="reveal">${ICON.check}<span>${esc(i)}</span></li>`).join("")}</ul></div></section>`;
  const priceBlock = `<section class="section alt" id="price"><div class="wrap">${ghost(esc(V.priceTitle))}<p class="lede reveal">${esc(V.priceLede)}</p><div class="grid1 v-tiers">${[[start, V.tierStart], [biz, V.tierBusiness], [shop, V.tierEcommerce]].map(([tr, note]) => `<a class="cell reveal" href="${PATHS.pricing[lang]}#${tr.id}" data-cursor><span class="cat">${esc(ui.pricing.tiers[tr.id].tag)}</span><h3>${esc(ui.pricing.tiers[tr.id].name)}</h3><b class="v-price">${money(shown(tr.price, lang), lang)}</b><p>${esc(note)} · ${tr.days[0]}–${tr.days[1]} ${esc(ui.pricing.days)}</p><span class="open">${esc(ui.brand.open)}</span></a>`).join("")}</div><p class="more reveal"><a class="btn" href="${PATHS.pricing[lang]}">${esc(V.allPrices)} ${ICON.arrow}</a> <a class="btn btn-solid" href="${PATHS.quote[lang]}?demo=${demo.id}">${esc(rep(V.quote))}</a></p></div></section>`;
  const whyBlock = `<section class="section" id="why"><div class="wrap" style="max-width:820px"><h2 class="tag reveal">// ${esc(rep(V.whyTitle))}</h2><p class="lede reveal">${esc(rep(v.intro[1]))}</p></div></section>`;
  const faqBlock = `<section class="section alt" id="faq"><div class="wrap" style="max-width:820px"><h2 class="tag">// ${esc(rep(V.faqTitle))}</h2>${faqs.map((f, i) => `<details class="faq"${i === 0 ? " open" : ""}><summary><h3>${esc(f.q)}</h3></summary><p style="padding:0 0 18px;font-size:12px;line-height:1.9;color:var(--text-2)">${esc(f.a)}</p></details>`).join("")}</div></section>`;
  const relatedBlock = `<section class="section" id="related"><div class="wrap"><h2 class="tag reveal">// ${esc(V.relatedTitle)}</h2><div class="grid1 grid1-4">${relatedFilled.map((d) => `<a class="cell reveal" href="${verticalPath(lang, d)}" data-cursor><span class="ic">${DEMO_ICONS[d.icon] || ""}</span><h3>${esc(VERTICALS[lang][d.id].h1)}</h3><p>${esc(d.t[lang].name)} · ${esc(d.t[lang].category)}</p><span class="open">${esc(ui.brand.open)}</span></a>`).join("")}</div><p class="more reveal"><a class="btn" href="${PATHS.vertical[lang]}">${esc(V.eyebrow)} ${ICON.arrow}</a></p></div></section>`;
  const moreBlock = `<section class="section alt" id="more"><div class="wrap"><div class="grid1 grid1-2"><div class="cell"><h3 class="tag">// ${esc(V.blogTitle)}</h3><ul class="city-list">${articles.map((a) => `<li><a href="${articlePath(lang, a)}">${esc(a.t[lang].title)} →</a></li>`).join("")}</ul></div><div class="cell"><h3 class="tag">// ${esc(V.citiesTitle)}</h3><ul class="city-list">${cities.map((c) => `<li><a href="${localPath(lang, c)}">${esc(c.name[lang])} →</a></li>`).join("")}</ul></div></div></div></section>`;
  return join([
    head({ lang, title: rep(v.title), description: rep(v.desc), keywords: [...demo.keywords[lang], ...V.keywords.slice(0, 2)], path, paths, fonts: HUB_FONTS, css: ["/assets/site.css"], themeColor: BRAND_BG, ogImage: og || preview || undefined, extra: schema }),
    `<body class="hub">`, boot(ui), siteNav(lang, ui, paths),
    `<main id="main">`, hero, demoBlock, includesBlock, priceBlock, whyBlock, faqBlock, relatedBlock, moreBlock, contact(lang, ui, rep(V.contactTitle)), `</main>`,
    siteFooter(lang, ui), `<script src="/assets/site.js" defer></script>`, `</body></html>`,
  ]);
}

export function renderVerticalIndex(lang) {
  const ui = I18N[lang], V = ui.vertical, path = PATHS.vertical[lang];
  const rep = (s) => tx(String(s).replace(/\{n\}/g, DEMOS.length), lang);
  const schema = jsonLd({ "@context": "https://schema.org", "@graph": [
    ORG,
    { "@type": "CollectionPage", "@id": SITE + path, url: SITE + path, name: rep(V.indexTitle), description: rep(V.indexDesc), inLanguage: lang, isPartOf: { "@id": `${SITE}/#website` }, hasPart: DEMOS.map((d) => ({ "@type": "WebPage", name: VERTICALS[lang][d.id].h1, url: SITE + verticalPath(lang, d) })) },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Carbon Stealth Portfolio", item: SITE + PATHS.hub[lang] }, { "@type": "ListItem", position: 2, name: V.eyebrow, item: SITE + path }] },
  ] });
  return join([
    head({ lang, title: rep(V.indexTitle), description: rep(V.indexDesc), keywords: V.keywords, path, paths: PATHS.vertical, fonts: HUB_FONTS, css: ["/assets/site.css"], themeColor: BRAND_BG, extra: schema }),
    `<body class="hub">`, boot(ui), siteNav(lang, ui, PATHS.vertical),
    `<main id="main"><section class="section" style="padding-top:140px"><div class="wrap"><div class="tag reveal">// ${esc(V.eyebrow)}</div><h1 class="h2 reveal">${V.indexH1}</h1><p class="lede reveal">${esc(rep(V.indexLede))}</p><div class="grid1">${DEMOS.map((d) => { const v = VERTICALS[lang][d.id], lab = LAB?.pages?.[d.id]; return `<a class="cell reveal" href="${verticalPath(lang, d)}" data-cursor><span class="ic">${DEMO_ICONS[d.icon] || ""}</span><span class="cat">${esc(d.t[lang].category)}</span><h2>${esc(v.h1)}</h2><p>${esc(rep(v.desc))}</p><span class="open">${esc(ui.brand.open)}${lab ? ` · Lighthouse ${lab.mobile.score}/${lab.desktop.score}` : ""}</span></a>`; }).join("")}</div></div></section>`,
    contact(lang, ui), `</main>`,
    siteFooter(lang, ui), `<script src="/assets/site.js" defer></script>`, `</body></html>`,
  ]);
}
