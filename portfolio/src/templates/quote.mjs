// quote.mjs — конфигуратор на оферта: пакет → добавки (брой/месеци) → кой сте (ДДС режим) → сума на живо.
// Числата идват САМО от src/pricing.mjs (нето = бруто ÷ 1,20); ДДС логиката е в quote.js по типа клиент:
// BG фирма/лице и ЕС лице → +20%; ЕС фирма с ДДС номер → reverse charge; извън ЕС → без БГ ДДС.
import { esc, join, head, jsonLd, ICON, ORG, PATHS, SITE, BRAND_EMAIL } from "../lib/html.mjs";
import { I18N } from "../i18n/index.mjs";
import { TIERS, ADDONS, net, money, shown, tx } from "../pricing.mjs";
import { siteNav, siteFooter, boot, HUB_FONTS, BRAND_BG } from "./hub.mjs";

export function renderQuote(lang) {
  const ui = I18N[lang], q = ui.quote, p = ui.pricing, path = PATHS.quote[lang];
  const cfg = { lang, tiers: TIERS.map((t) => ({ id: t.id, net: net(t.price), days: t.days, name: p.tiers[t.id].name })), addons: ADDONS.map((a) => ({ id: a.id, net: net(a.price), kind: a.kind, name: p.addons[a.id] })), labels: { ...q.lines, ...q.actions, months: q.months, qty: q.qty, mailSubject: q.mailSubject, mailIntro: q.mailIntro, email: BRAND_EMAIL, vatNote: q.vatNote, client: q.client }, sep: lang === "en" ? "," : lang === "it" ? "." : " ", pre: lang === "en" };
  const tiers = TIERS.map((t, i) => `<label class="q-tier${t.popular ? " pop" : ""}"><input type="radio" name="tier" value="${t.id}"${t.popular ? " checked" : ""}><span class="q-tier-tag">${esc(p.tiers[t.id].tag)}</span><strong>${esc(p.tiers[t.id].name)}</strong><b>${money(shown(t.price, lang), lang)}</b><small>${esc(p.delivery)}: ${t.days[0]}–${t.days[1]} ${esc(p.days)}</small></label>`).join("");
  const qtyOf = { language: [0, 5, 0], page: [0, 20, 0], copy: [0, 20, 0], logo: null, maintenance: [0, 24, 12], seo: [0, 24, 0], hosting: [0, 36, 0] };
  const addons = ADDONS.map((a) => {
    const r = qtyOf[a.id];
    const ctl = r ? `<span class="q-qty"><button type="button" data-dec aria-label="−">−</button><input type="number" name="${a.id}" min="${r[0]}" max="${r[1]}" value="${r[2]}" inputmode="numeric" aria-label="${esc(p.addons[a.id])}"><button type="button" data-inc aria-label="+">+</button><i>${esc(a.kind === "monthly" ? q.months : q.qty)}</i></span>` : `<span class="q-qty"><input type="checkbox" name="${a.id}" value="1" aria-label="${esc(p.addons[a.id])}"></span>`;
    return `<div class="q-addon"><div><span>${esc(p.addons[a.id])}</span><small>${money(shown(a.price, lang), lang)} ${esc(a.kind === "monthly" ? p.monthly : p.once)}</small></div>${ctl}</div>`;
  }).join("");
  const clients = ["bgCompany", "bgPrivate", "euCompany", "euPrivate", "nonEu"].map((c, i) => `<label class="q-client"><input type="radio" name="client" value="${c}"${(lang === "bg" ? c === "bgCompany" : c === "euCompany") ? " checked" : ""}> ${esc(q.client[c])}</label>`).join("");
  const schema = jsonLd({ "@context": "https://schema.org", "@graph": [
    { "@type": "WebPage", "@id": SITE + path, url: SITE + path, name: q.title, description: q.desc, inLanguage: lang, isPartOf: { "@id": `${SITE}/#website` }, publisher: ORG },
    { "@type": "WebApplication", name: q.eyebrow, applicationCategory: "BusinessApplication", operatingSystem: "Web", browserRequirements: "Requires JavaScript", offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" }, provider: { "@id": ORG["@id"] } },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Carbon Stealth Portfolio", item: SITE + PATHS.hub[lang] }, { "@type": "ListItem", position: 2, name: q.eyebrow, item: SITE + path }] },
  ] });
  return join([
    head({ lang, title: q.title, description: q.desc, keywords: q.keywords, path, paths: PATHS.quote, fonts: HUB_FONTS, css: ["/assets/site.css"], themeColor: BRAND_BG, extra: schema }),
    `<body class="hub">`, boot(ui), siteNav(lang, ui, PATHS.quote),
    `<main id="main"><section class="section" style="padding-top:140px;padding-bottom:32px"><div class="wrap"><div class="tag reveal">// ${esc(q.eyebrow)}</div><h1 class="h2 reveal">${q.h1}</h1><p class="lede reveal">${esc(q.lede)}</p></div></section>`,
    `<section class="wrap q-wrap"><form class="q-form" id="quote" data-quote="${esc(JSON.stringify(cfg))}" novalidate><div class="q-steps"><fieldset class="q-step"><legend class="tag">// ${esc(q.stepTier)}</legend><div class="q-tiers">${tiers}</div></fieldset><fieldset class="q-step"><legend class="tag">// ${esc(q.stepAddons)}</legend><div class="q-addons">${addons}</div></fieldset><fieldset class="q-step"><legend class="tag">// ${esc(q.stepClient)}</legend><div class="q-clients">${clients}</div><p class="q-vatnote tiny" data-vatnote></p></fieldset></div><aside class="q-summary"><div class="tag">// ${esc(q.summary)}</div><ul class="q-lines" data-lines></ul><dl class="q-totals"><div><dt>${esc(q.lines.net)}</dt><dd data-net></dd></div><div data-vatrow><dt>${esc(q.lines.vat)}</dt><dd data-vat></dd></div><div class="q-total"><dt>${esc(q.lines.total)}</dt><dd data-total></dd></div><div class="q-total q-monthly" data-monthlyrow hidden><dt>${esc(q.lines.totalMonthly)}</dt><dd data-monthly></dd></div></dl><p class="tiny" data-delivery></p><div class="q-actions"><a class="btn btn-solid" data-mail href="mailto:${BRAND_EMAIL}">${esc(q.actions.email)} ${ICON.arrow}</a><button type="button" class="btn" data-print>${esc(q.actions.print)}</button><button type="reset" class="btn q-reset">${esc(q.actions.reset)}</button></div><p class="tiny">${esc(q.disclaimer)}</p></aside></form></section></main>`,
    siteFooter(lang, ui), `<script src="/assets/site.js" defer></script><script src="/assets/quote.js" defer></script>`, `</body></html>`,
  ]);
}
