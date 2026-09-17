// demo.mjs — шаблонът на ВСЯКО демо: една структура, десет визуални идентичности (theme токени +
// hero вариант + декоративна дума). Съдържанието идва от src/demos/<id>.mjs за текущия език.
import { esc, join, head, credit, jsonLd, ICON, ORG, PATHS, demoPath, SITE, LANGS } from "../lib/html.mjs";
import { I18N } from "../i18n/index.mjs";
import { widget } from "./widgets.mjs";

const stars = (n) => `<span class="stars" aria-label="${n}/5">${ICON.star.repeat(n)}</span>`;

function themeCss(th) {
  return `<style>:root{--bg:${th.bg};--surface:${th.surface};--surface2:${th.surface2};--text:${th.text};--muted:${th.muted};--accent:${th.accent};--accent2:${th.accent2};--on-accent:${th.onAccent};--line:${th.line};--radius:${th.radius};--display:${th.display};--body:${th.body}}</style>`;
}

function demoBar(lang, demo, ui) {
  const alt = LANGS.map((l) => `<a href="${demoPath(l, demo)}" hreflang="${l}"${l === lang ? ' aria-current="page"' : ""}>${I18N[l].short}</a>`).join("");
  return `<div class="cs-bar" role="region" aria-label="Carbon Stealth"><a class="cs-back" href="${PATHS.hub[lang]}#demos">${esc(ui.demoBar.back)}</a><span class="cs-hint" title="${esc(ui.demoBar.hint)}">${esc(ui.demoBar.label)} · ${esc(demo.t[lang].category)}</span><nav class="cs-langs" aria-label="Language">${alt}</nav><a class="cs-want" href="${PATHS.pricing[lang]}">${esc(ui.demoBar.want)}</a></div>`;
}

function nav(t, c, phone) {
  const links = [["#services", c.nav.services], ["#about", c.nav.about], ["#reviews", c.nav.reviews], ["#faq", c.nav.faq], ["#contact", c.nav.contact]];
  return `<header class="nav" id="top"><a class="brand" href="#top">${esc(t.name)}</a><button class="burger" aria-expanded="false" aria-controls="menu" aria-label="${esc(c.nav.menu)}">${ICON.menu}</button><nav id="menu" class="menu">${links.map(([h, l]) => `<a href="${h}">${esc(l)}</a>`).join("")}</nav><a class="btn btn-nav" href="tel:${phone.replace(/\s/g, "")}">${ICON.phone}<span>${esc(c.call)}</span></a></header>`;
}

function hero(t, th) {
  const h = t.hero;
  return `<section class="hero hero-${th.heroStyle} pattern-${th.pattern}"><span class="word" aria-hidden="true">${esc(th.word)}</span><div class="hero-text"><p class="eyebrow">${esc(h.eyebrow)}</p><h1>${h.title}</h1><p class="lede">${esc(h.lede)}</p><div class="cta-row"><a class="btn btn-primary" href="#contact">${esc(h.cta)} ${ICON.arrow}</a><a class="btn btn-ghost" href="#services">${esc(h.cta2)}</a></div></div><div class="hero-visual">${widget(h.widget)}</div></section>
<div class="badges" aria-label="highlights">${t.badges.map((b) => `<span>${ICON.check}${esc(b)}</span>`).join("")}</div>`;
}

function services(t) {
  return `<section class="section" id="services"><div class="wrap"><h2 class="h2">${t.servicesTitle}</h2><p class="lede">${esc(t.servicesLede)}</p><div class="grid grid-3">${t.services.map((s, i) => `<article class="card reveal"><span class="num">0${i + 1}</span><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p>${s.p ? `<strong class="price">${esc(s.p)}</strong>` : ""}</article>`).join("")}</div></div></section>`;
}

function about(t) {
  const a = t.about;
  return `<section class="section alt" id="about"><div class="wrap split"><div><p class="eyebrow">${esc(a.eyebrow)}</p><h2 class="h2">${a.title}</h2>${a.p.map((p) => `<p class="body">${esc(p)}</p>`).join("")}</div><div class="facts">${a.facts.map((f) => `<div class="fact reveal"><strong>${esc(f.n)}</strong><span>${esc(f.l)}</span></div>`).join("")}</div></div></section>`;
}

function steps(t) {
  if (!t.steps) return "";
  return `<section class="section" id="steps"><div class="wrap"><h2 class="h2">${t.steps.title}</h2><ol class="steps">${t.steps.items.map((s) => `<li class="reveal"><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></li>`).join("")}</ol></div></section>`;
}

function list(t) {
  if (!t.list) return "";
  return `<section class="section alt" id="list"><div class="wrap"><h2 class="h2">${t.list.title}</h2>${t.list.lede ? `<p class="lede">${esc(t.list.lede)}</p>` : ""}<div class="pricelist">${t.list.groups.map((g) => `<div class="pl-group reveal"><h3>${esc(g.t)}</h3>${g.items.map((i) => `<div class="pl-row"><span>${esc(i[0])}</span><span class="pl-dots"></span><strong>${esc(i[1])}</strong></div>`).join("")}</div>`).join("")}</div></div></section>`;
}

function reviews(t, c) {
  return `<section class="section" id="reviews"><div class="wrap"><h2 class="h2">${esc(c.reviewsTitle)}</h2><div class="grid grid-3">${t.reviews.map((r) => `<blockquote class="review reveal">${stars(r.stars)}<p>${esc(r.text)}</p><footer>— ${esc(r.name)}</footer></blockquote>`).join("")}</div></div></section>`;
}

function faq(t, c) {
  return `<section class="section alt" id="faq"><div class="wrap narrow"><h2 class="h2">${esc(c.faqTitle)}</h2>${t.faq.map((f, i) => `<details class="faq"${i === 0 ? " open" : ""}><summary><h3>${esc(f.q)}</h3></summary><p>${esc(f.a)}</p></details>`).join("")}</div></section>`;
}

function contact(t, c) {
  const f = c.form;
  const tel = t.phone.replace(/\s/g, "");
  return `<section class="section" id="contact"><div class="wrap split"><div><p class="eyebrow">${esc(t.contact.eyebrow)}</p><h2 class="h2">${t.contact.title}</h2><p class="body">${esc(t.contact.lede)}</p><ul class="info"><li>${ICON.pin}<span>${esc(t.address)}</span></li><li>${ICON.phone}<a href="tel:${tel}">${esc(t.phone)}</a></li><li>${ICON.mail}<a href="mailto:${esc(t.email)}">${esc(t.email)}</a></li><li>${ICON.clock}<span>${t.hours.map(esc).join("<br>")}</span></li></ul></div><form class="form demo-form" action="#contact" method="get" novalidate><label><span>${esc(f.name)}</span><input name="name" autocomplete="name" required></label><label><span>${esc(f.phone)}</span><input name="phone" type="tel" autocomplete="tel"></label><label><span>${esc(f.email)}</span><input name="email" type="email" autocomplete="email" required></label><label><span>${esc(f.msg)}</span><textarea name="msg" rows="4" required></textarea></label><button class="btn btn-primary" type="submit">${esc(f.send)} ${ICON.arrow}</button><p class="tiny">${esc(f.privacy)}</p><output class="sent" data-msg="${esc(f.sent)}" aria-live="polite"></output></form></div></section>`;
}

function footer(t, c, lang) {
  return `<footer class="foot"><div class="wrap"><span class="brand">${esc(t.name)}</span><span class="tiny">${esc(c.demoNote)}</span>${credit(lang)}</div></footer>`;
}

function schema(lang, demo, t, path) {
  const tel = t.phone.replace(/\s/g, "");
  return jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": demo.schemaType, "@id": `${SITE}${path}#business`, name: t.name, description: t.metaDesc, telephone: tel, email: t.email, url: SITE + path, address: { "@type": "PostalAddress", streetAddress: t.address, addressLocality: t.city }, priceRange: "€€" },
      { "@type": "FAQPage", mainEntity: t.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Carbon Stealth Portfolio", item: SITE + PATHS.hub[lang] }, { "@type": "ListItem", position: 2, name: t.name, item: SITE + path }] },
      { "@type": "WebPage", "@id": SITE + path, url: SITE + path, name: t.metaTitle, inLanguage: lang, isPartOf: { "@id": `${SITE}/#website` }, publisher: ORG },
    ],
  });
}

export function renderDemo(lang, demo) {
  const ui = I18N[lang], c = ui.common, t = demo.t[lang], th = demo.theme;
  const path = demoPath(lang, demo);
  const paths = Object.fromEntries(LANGS.map((l) => [l, demoPath(l, demo)]));
  return join([
    head({ lang, title: t.metaTitle, description: t.metaDesc, keywords: demo.keywords[lang], path, paths, fonts: th.fonts, css: ["/assets/demo.css"], themeColor: th.bg, extra: themeCss(th) + schema(lang, demo, t, path) }),
    `<body class="demo mode-${th.mode}">`,
    demoBar(lang, demo, ui),
    nav(t, c, t.phone),
    `<main>`, hero(t, th), services(t), about(t), steps(t), list(t), reviews(t, c), faq(t, c), contact(t, c), `</main>`,
    footer(t, c, lang),
    `<script src="/assets/demo.js" defer></script>`,
    `</body></html>`,
  ]);
}
