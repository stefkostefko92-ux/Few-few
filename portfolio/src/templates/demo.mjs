// demo.mjs — шаблонът на ВСЯКО демо: една структура, десет визуални идентичности (theme токени +
// hero вариант + декоративна дума). Съдържанието идва от src/demos/<id>.mjs за текущия език.
// Премиум слой: premium.css/js (киношен hero, ред с доказателства, оферта, галерия с надписи, навигация).
// Снимки: ако tools/photos.mjs е свалил public/img/<id>/, hero/about/галерия ги ползват; иначе —
// генеративна графика. Всичко интерактивно (форми, график, кошница, lightbox) живее в demo.js.
import { esc, join, head, credit, jsonLd, ICON, ORG, PATHS, demoPath, SITE, LANGS } from "../lib/html.mjs";
import { I18N } from "../i18n/index.mjs";
import { widget } from "./widgets.mjs";
import { photosOf, picture, creditsLine } from "./photos.mjs";

/** Демота с интерактивна добавка (проба на цвят/материал, калкулатор) — само те зареждат fx/. */
const FX_MODULES = new Set(["salon", "mebeli", "schetovodstvo", "avtokashta"]);
const initials = (name) => name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase().replace(/\./g, "");
const stars = (n) => `<span class="stars" aria-label="${n}/5">${ICON.star.repeat(n)}</span>`;

function themeCss(th) {
  // Резервните семейства (Inter Tight) покриват кирилица за шрифтове без нея (Barlow, Syne, Fraunces…).
  return `<style>:root{--bg:${th.bg};--surface:${th.surface};--surface2:${th.surface2};--text:${th.text};--muted:${th.muted};--accent:${th.accent};--accent2:${th.accent2};--on-accent:${th.onAccent};--line:${th.line};--radius:${th.radius};--display:${th.display.replace(/,\s*[^,]+$/, "")}, 'Inter Tight', sans-serif;--body:${th.body.replace(/,\s*[^,]+$/, "")}, 'Inter Tight', sans-serif}</style>`;
}

function demoBar(lang, demo, ui) {
  const alt = LANGS.map((l) => `<a href="${demoPath(l, demo)}" hreflang="${l}"${l === lang ? ' aria-current="page"' : ""}>${I18N[l].short}</a>`).join("");
  return `<div class="cs-bar" role="region" aria-label="Carbon Stealth"><a class="cs-mark" href="${PATHS.hub[lang]}" aria-label="Carbon Stealth VCC"><picture><source srcset="/mark.webp" type="image/webp"><img src="/mark.png" alt="" width="320" height="320" decoding="async"></picture></a><a class="cs-back" href="${PATHS.hub[lang]}#demos">${esc(ui.demoBar.back)}</a><span class="cs-hint" title="${esc(ui.demoBar.hint)}">// ${esc(ui.demoBar.label)} · ${esc(demo.t[lang].category)}</span><nav class="cs-langs" aria-label="Language">${alt}</nav><a class="cs-want" href="${PATHS.pricing[lang]}">${esc(ui.demoBar.want)}</a></div><div class="progress" aria-hidden="true"><i></i></div>`;
}

function nav(t, c, phone, hasGallery) {
  const links = [t.catalog ? ["#catalog", c.nav.catalog] : null, ["#services", c.nav.services], ["#about", c.nav.about], hasGallery ? ["#gallery", c.nav.gallery] : null, ["#reviews", c.nav.reviews], ["#faq", c.nav.faq], ["#contact", c.nav.contact]].filter(Boolean);
  return `<header class="nav" id="top"><a class="brand" href="#top">${esc(t.name)}</a><button class="burger" aria-expanded="false" aria-controls="menu" aria-label="${esc(c.nav.menu)}">${ICON.menu}</button><nav id="menu" class="menu">${links.map(([h, l]) => `<a href="${h}">${esc(l)}</a>`).join("")}</nav><a class="btn btn-nav" href="tel:${phone.replace(/\s/g, "")}">${ICON.phone}<span>${esc(c.call)}</span></a>${t.catalog ? `<button type="button" class="cart-btn" data-cart-open aria-label="${esc(c.shop.cart)}">${ICON.cart}<b data-cart-count hidden>0</b></button>` : ""}</header>`;
}

function hero(t, th, c, demo, photos) {
  const h = t.hero;
  const photo = photos?.slots.hero ? picture(demo.id, "hero", photos.slots.hero, { w: 1600, h: 1067, alt: `${t.name} — ${t.category}`, cls: "hero-photo", eager: true }) : "";
  return `<section class="hero hero-${th.heroStyle} pattern-${th.pattern}${photo ? " has-photo" : ""}">${photo ? `<div class="hero-bg" aria-hidden="true">${photo}<i class="tint"></i></div>` : ""}<div class="hero-text"><p class="eyebrow">${esc(h.eyebrow)}</p><h1>${h.title}</h1><p class="lede">${esc(h.lede)}</p><div class="cta-row"><a class="btn btn-primary" href="#contact">${esc(h.cta)} ${ICON.arrow}</a><a class="btn btn-ghost" href="#services">${esc(h.cta2)}</a></div>${h.proof ? `<p class="proof">${esc(h.proof)}</p>` : ""}</div><div class="hero-visual">${widget(h.widget, c, t, tileImgs(demo, photos))}</div></section>
<div class="badges" aria-label="highlights">${t.badges.map((b) => `<span>${ICON.check}${esc(b)}</span>`).join("")}</div>`;
}

/** Снимките от галерията стават „обложки" на плочките в hero картата (вместо цветни квадрати). */
function tileImgs(demo, photos) {
  return photos ? ["g1", "g2", "g3", "g4", "g5", "g6"].filter((s) => photos.slots[s]).map((s) => `/img/${demo.id}/${s}-sm.webp`) : [];
}

/** Оферта-банер: конкретно предложение с условие и срок — това продава, не декорацията. */
function offer(t) {
  const o = t.offer; if (!o) return "";
  return `<section class="offer" id="offer" aria-labelledby="offer-title"><div class="wrap"><div><span class="offer-tag">${esc(o.tag)}</span><h2 id="offer-title">${esc(o.title)}</h2><p>${esc(o.text)}</p></div><div class="offer-cta"><a class="btn btn-primary" href="#contact">${esc(o.cta)} ${ICON.arrow}</a><p class="offer-note">${esc(o.note)}</p></div></div></section>`;
}

/** Онлайн магазин: каталог с истинска кошница (fx/shop.js) — продуктите носят снимки от галерията. */
function catalog(t, c, demo, photos) {
  const k = t.catalog; if (!k) return "";
  const s = c.shop;
  const img = (slot) => photos?.slots[slot] ? `<img src="/img/${demo.id}/${slot}.webp" srcset="/img/${demo.id}/${slot}-sm.webp 450w, /img/${demo.id}/${slot}.webp 900w" sizes="(max-width:700px) 100vw, 33vw" alt="" width="900" height="600" loading="lazy" decoding="async">` : `<span class="prod-ph" aria-hidden="true"></span>`;
  const prods = k.items.map((p, i) => `<article class="prod reveal"><a class="prod-img" href="#p${i}" aria-hidden="true" tabindex="-1">${img(p.img)}</a><div class="prod-body"><span class="prod-cat">${esc(p.cat)}</span><h3 id="p${i}">${esc(p.n)}</h3><p>${esc(p.d)}</p><div class="prod-row"><strong>${esc(p.price)}</strong><button type="button" class="btn btn-primary btn-sm" data-add="${i}" data-name="${esc(p.n)}" data-price="${p.num}" data-img="/img/${demo.id}/${p.img}-sm.webp">${esc(s.add)}</button></div></div></article>`).join("");
  const drawer = `<div class="cart" id="cart" hidden role="dialog" aria-modal="true" aria-label="${esc(s.cart)}"><div class="cart-panel"><div class="cart-head"><h2>${esc(s.cart)}</h2><button type="button" class="cart-close" aria-label="${esc(s.close)}">×</button></div><p class="cart-empty">${esc(s.empty)}</p><ul class="cart-list"></ul><div class="cart-foot" hidden><dl><div><dt>${esc(s.subtotal)}</dt><dd data-sub></dd></div><div><dt>${esc(s.delivery)}</dt><dd data-del></dd></div><div class="tot"><dt>${esc(s.total)}</dt><dd data-tot></dd></div></dl><p class="tiny">${esc(k.shipNote)}</p><button type="button" class="btn btn-primary w-cta" data-checkout>${esc(s.checkout)} ${ICON.arrow}</button><button type="button" class="btn btn-ghost w-cta cart-continue">${esc(s.continue)}</button></div></div></div>`;
  const pay = k.pay.map((p, i) => `<label class="co-opt"><input type="radio" name="pay" value="${i}"${i === 0 ? " checked" : ""}> ${esc(p)}</label>`).join("");
  const ship = k.ship.map((p, i) => `<label class="co-opt"><input type="radio" name="ship" value="${i}"${i === 0 ? " checked" : ""}> ${esc(p)}</label>`).join("");
  const checkout = `<dialog class="checkout" id="checkout" aria-label="${esc(s.checkout)}"><button type="button" class="co-x co-close" aria-label="${esc(s.close)}">×</button><form novalidate><h2>${esc(s.checkout)}</h2><label class="w-field"><span>${esc(c.form.name)}</span><input name="name" required autocomplete="name"></label><label class="w-field"><span>${esc(c.form.email)}</span><input name="email" type="email" required autocomplete="email"></label><label class="w-field"><span>${esc(s.address)}</span><input name="address" required autocomplete="street-address"></label><fieldset><legend>${esc(s.deliveryMethod)}</legend>${ship}</fieldset><fieldset><legend>${esc(s.payment)}</legend>${pay}</fieldset><p class="tiny">${esc(s.demoNote)}</p><button type="submit" class="btn btn-primary w-cta">${esc(s.place)} ${ICON.arrow}</button></form><div class="co-done" hidden><h2>${esc(s.orderDone)}</h2><p>${esc(s.orderNo)} <strong data-no></strong> · <span data-sum></span> · <span data-pay></span></p><p class="tiny">${esc(s.demoNote)}</p><button type="button" class="btn btn-primary w-cta co-close">${esc(s.close)}</button></div></dialog>`;
  return `<section class="section" id="catalog"><div class="wrap"><h2 class="h2">${k.title}</h2><p class="lede">${esc(k.lede)}</p><div class="grid grid-3 catalog">${prods}</div></div></section>${drawer}${checkout}`;
}

function services(t) {
  return `<section class="section" id="services"><div class="wrap"><h2 class="h2">${t.servicesTitle}</h2><p class="lede">${esc(t.servicesLede)}</p><div class="grid grid-3">${t.services.map((s, i) => `<article class="card reveal"><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p>${s.p ? `<strong class="price">${esc(s.p)}</strong>` : ""}<a class="card-link" href="#contact">${esc(t.hero.cta)}</a></article>`).join("")}</div></div></section>`;
}

function about(t, demo, photos) {
  const a = t.about;
  const photo = photos?.slots.about ? picture(demo.id, "about", photos.slots.about, { w: 1200, h: 800, alt: a.eyebrow, cls: "about-photo reveal" }) : "";
  return `<section class="section alt" id="about"><div class="wrap split"><div><p class="eyebrow">${esc(a.eyebrow)}</p><h2 class="h2">${a.title}</h2>${a.p.map((p) => `<p class="body">${esc(p)}</p>`).join("")}</div><div>${photo}<div class="facts">${a.facts.map((f) => `<div class="fact reveal"><strong data-countup>${esc(f.n)}</strong><span>${esc(f.l)}</span></div>`).join("")}</div></div></div></section>`;
}

function gallery(t, c, demo, photos) {
  if (!photos) return "";
  const slots = ["g1", "g2", "g3", "g4", "g5", "g6"].filter((s) => photos.slots[s]);
  if (!slots.length) return "";
  return `<section class="section" id="gallery"><div class="wrap"><h2 class="h2">${esc(c.gallery)}</h2><div class="gallery">${slots.map((s, i) => `<a class="g-item reveal" href="/img/${demo.id}/${s}.webp" data-lightbox="${i}" data-cap="${esc(t.services[i]?.t || t.name)}">${picture(demo.id, s, photos.slots[s], { w: 900, h: 600, alt: photos.slots[s].alt || `${t.name} — ${t.services[i]?.t || i + 1}` })}</a>`).join("")}</div>${creditsLine(photos, c.credits, c.creditsEdited)}</div></section><div class="lightbox" id="lightbox" hidden role="dialog" aria-modal="true" aria-label="${esc(c.gallery)}"><button class="lb-close" type="button" aria-label="×">×</button><button class="lb-prev" type="button" aria-label="‹">‹</button><img alt=""><p class="lb-cap" aria-live="polite"></p><span class="lb-count" aria-hidden="true"></span><button class="lb-next" type="button" aria-label="›">›</button></div>`;
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
  return `<section class="section" id="reviews"><div class="wrap"><h2 class="h2">${esc(c.reviewsTitle)}</h2><div class="grid grid-3">${t.reviews.map((r) => `<blockquote class="review reveal">${stars(r.stars)}<p>${esc(r.text)}</p><footer><span class="avatar" aria-hidden="true">${esc(initials(r.name))}</span><span>${esc(r.name)}</span></footer></blockquote>`).join("")}</div></div></section>`;
}

function faq(t, c) {
  return `<section class="section alt" id="faq"><div class="wrap narrow"><h2 class="h2">${esc(c.faqTitle)}</h2>${t.faq.map((f, i) => `<details class="faq"${i === 0 ? " open" : ""}><summary><h3>${esc(f.q)}</h3></summary><div class="fa"><div><p>${esc(f.a)}</p></div></div></details>`).join("")}</div></section>`;
}

function contact(t, c) {
  const f = c.form, tel = t.phone.replace(/\s/g, "");
  return `<section class="section" id="contact"><div class="wrap split"><div><p class="eyebrow">${esc(t.contact.eyebrow)}</p><h2 class="h2">${t.contact.title}</h2><p class="body">${esc(t.contact.lede)}</p><ul class="info"><li>${ICON.pin}<span>${esc(t.address)}</span></li><li>${ICON.phone}<a href="tel:${tel}">${esc(t.phone)}</a></li><li>${ICON.mail}<a href="mailto:${esc(t.email)}">${esc(t.email)}</a></li><li>${ICON.clock}<span>${t.hours.map(esc).join("<br>")}</span></li></ul></div><form class="form demo-form" action="#contact" method="get" novalidate><label><span>${esc(f.name)}</span><input name="name" autocomplete="name" required></label><label><span>${esc(f.phone)}</span><input name="phone" type="tel" autocomplete="tel"></label><label><span>${esc(f.email)}</span><input name="email" type="email" autocomplete="email" required></label><label><span>${esc(f.msg)}</span><textarea name="msg" rows="4" required></textarea></label><button class="btn btn-primary" type="submit">${esc(f.send)} ${ICON.arrow}</button><p class="tiny">${esc(f.privacy)}</p><output class="sent" data-msg="${esc(f.sent)}" aria-live="polite"></output></form></div></section>`;
}

function footer(t, c, lang) {
  return `<footer class="foot"><div class="wrap"><span class="brand">${esc(t.name)}</span><span class="tiny">${esc(c.demoNote)}</span>${credit(lang)}</div></footer>`;
}

const sticky = (t, c) => `<div class="sticky" aria-hidden="true"><a class="btn btn-ghost" href="tel:${t.phone.replace(/\s/g, "")}">${ICON.phone} ${esc(c.sticky.call)}</a><a class="btn btn-primary" href="#contact">${esc(c.sticky.book)} ${ICON.arrow}</a></div><a class="totop" href="#top" aria-label="${esc(c.top)}">↑</a>`;

function schema(lang, demo, t, path, photos) {
  const tel = t.phone.replace(/\s/g, "");
  return jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": demo.schemaType, "@id": `${SITE}${path}#business`, name: t.name, description: t.metaDesc, telephone: tel, email: t.email, url: SITE + path, address: { "@type": "PostalAddress", streetAddress: t.address, addressLocality: t.city }, priceRange: "€€", ...(photos?.slots.hero ? { image: `${SITE}/img/${demo.id}/hero.webp` } : {}) },
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
  const photos = photosOf(demo.id);
  const og = photos?.slots.hero ? `/img/${demo.id}/hero.webp` : undefined;
  return join([
    head({ lang, title: t.metaTitle, description: t.metaDesc, keywords: demo.keywords[lang], path, paths, fonts: [...th.fonts, "brand"], css: ["/assets/demo.css", "/assets/premium.css"], themeColor: th.bg, ogImage: og, extra: themeCss(th) + schema(lang, demo, t, path, photos) }),
    `<body class="demo mode-${th.mode}" data-i18n="${esc(JSON.stringify({ tryColor: c.widget.tryColor }))}"${t.catalog ? ` data-shop="${esc(JSON.stringify({ currency: "€", format: lang === "en" ? "pre" : "post", freeFrom: t.catalog.freeFrom, shipping: t.catalog.shipping, added: c.shop.added, remove: c.shop.remove, free: c.shop.free }))}"` : ""}>`,
    demoBar(lang, demo, ui),
    nav(t, c, t.phone, !!photos),
    `<main>`, hero(t, th, c, demo, photos), catalog(t, c, demo, photos), services(t), offer(t), about(t, demo, photos), gallery(t, c, demo, photos), steps(t), list(t), reviews(t, c), faq(t, c), contact(t, c), `</main>`,
    footer(t, c, lang), sticky(t, c),
    `<script src="/assets/demo.js" defer></script>${FX_MODULES.has(demo.id) ? `<script src="/assets/fx/core.js" defer></script><script src="/assets/fx/${demo.id}.js" defer></script>` : ""}${t.catalog ? `<script src="/assets/fx/shop.js" defer></script>` : ""}<script src="/assets/premium.js" defer></script>`,
    `</body></html>`,
  ]);
}
