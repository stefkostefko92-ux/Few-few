// admin.mjs — „Демо на админ панела": работещ мок на CMS-а от пакетите Премиум/Магазин. Ляво — полета за
// редакция (начална · услуги · снимки · отзиви · настройки), дясно — жив преглед в телефонна рамка, който се
// обновява при всяко натискане на клавиш; „Публикувай" → тост + история. Данните са от демото Motor Lab
// (avtoservis) за текущия език; всичко живее в браузъра (admin.js), нищо не се качва.
import { esc, join, head, jsonLd, ICON, ORG, PATHS, SITE, LANGS, demoPath } from "../lib/html.mjs";
import { I18N } from "../i18n/index.mjs";
import { DEMOS } from "../demos/index.mjs";
import { photosOf } from "./photos.mjs";
import { siteNav, siteFooter, boot, HUB_FONTS, BRAND_BG } from "./hub.mjs";

const SRC = DEMOS.find((d) => d.id === "avtoservis");

function field(id, label, value, kind = "input") {
  const v = esc(value);
  return `<label class="ad-field"><span>${esc(label)}</span>${kind === "textarea" ? `<textarea data-bind="${id}" rows="3">${v}</textarea>` : `<input data-bind="${id}" value="${v}">`}</label>`;
}

export function renderAdmin(lang) {
  const ui = I18N[lang], a = ui.admin, t = SRC.t[lang], path = PATHS.admin[lang], photos = photosOf(SRC.id);
  const img = (slot) => photos?.slots[slot] ? `/img/${SRC.id}/${slot}-sm.webp` : "";
  const services = t.services.slice(0, 4);
  const panes = {
    home: `<h2>${esc(a.nav.home)}</h2>${field("eyebrow", a.fields.eyebrow, t.hero.eyebrow)}${field("title", a.fields.title, t.hero.title.replace(/<[^>]+>/g, ""))}${field("lede", a.fields.lede, t.hero.lede, "textarea")}${field("cta", a.fields.cta, t.hero.cta)}`,
    services: `<h2>${esc(a.nav.services)}</h2>${services.map((s, i) => `<div class="ad-row"><label class="ad-field grow"><span>${esc(a.fields.name)}</span><input data-bind="s${i}n" value="${esc(s.t)}"></label><label class="ad-field"><span>${esc(a.fields.price)}</span><input data-bind="s${i}p" value="${esc(s.p || "")}"></label></div>`).join("")}`,
    photos: `<h2>${esc(a.nav.photos)}</h2><p class="ad-hint">${esc(a.fields.drop)}</p><div class="ad-photos">${["hero", "g1", "g2", "g3"].map((s) => `<figure class="ad-photo"><img data-photo="${s}" src="${img(s)}" alt="" width="450" height="300" loading="lazy"><label class="ad-replace">${esc(a.fields.replace)}<input type="file" accept="image/*" data-file="${s}" hidden></label></figure>`).join("")}</div>`,
    reviews: `<h2>${esc(a.nav.reviews)}</h2>${t.reviews.map((r, i) => `<div class="ad-review"><label class="ad-field grow"><span>${esc(a.fields.name)}</span><input data-bind="r${i}n" value="${esc(r.name)}"></label><label class="ad-field grow"><span>${esc(a.fields.text)}</span><textarea data-bind="r${i}t" rows="2">${esc(r.text)}</textarea></label><label class="ad-switch"><input type="checkbox" data-bind="r${i}on" checked><span>${esc(a.fields.published)}</span></label></div>`).join("")}`,
    settings: `<h2>${esc(a.nav.settings)}</h2>${field("phone", a.fields.phone, t.phone)}<div class="ad-field"><span>${esc(a.fields.langs)}</span><div class="ad-langs">${LANGS.map((l) => `<label class="ad-switch"><input type="checkbox" data-bind="lang-${l}" checked><span>${I18N[l].short}</span></label>`).join("")}</div></div>`,
  };
  const preview = `<div class="ad-phone"><div class="ad-screen"><div class="ad-pv-nav"><b>${esc(t.name)}</b><span data-pv="phone">${esc(t.phone)}</span></div><div class="ad-pv-hero"><img data-pv-photo="hero" src="${img("hero")}" alt="" width="450" height="300"><div><small data-pv="eyebrow">${esc(t.hero.eyebrow)}</small><h3 data-pv="title">${esc(t.hero.title.replace(/<[^>]+>/g, ""))}</h3><p data-pv="lede">${esc(t.hero.lede)}</p><span class="ad-pv-btn" data-pv="cta">${esc(t.hero.cta)}</span></div></div><ul class="ad-pv-services">${services.map((s, i) => `<li><span data-pv="s${i}n">${esc(s.t)}</span><b data-pv="s${i}p">${esc(s.p || "")}</b></li>`).join("")}</ul><div class="ad-pv-gallery">${["g1", "g2", "g3"].map((s) => `<img data-pv-photo="${s}" src="${img(s)}" alt="" width="450" height="300" loading="lazy">`).join("")}</div><div class="ad-pv-reviews">${t.reviews.map((r, i) => `<blockquote data-pv-review="${i}"><p data-pv="r${i}t">${esc(r.text)}</p><footer data-pv="r${i}n">${esc(r.name)}</footer></blockquote>`).join("")}</div><div class="ad-pv-langs">${LANGS.map((l) => `<span data-pv-lang="${l}">${I18N[l].short}</span>`).join("")}</div></div></div>`;
  const schema = jsonLd({ "@context": "https://schema.org", "@graph": [
    { "@type": "WebPage", "@id": SITE + path, url: SITE + path, name: a.title, description: a.desc, inLanguage: lang, isPartOf: { "@id": `${SITE}/#website` }, publisher: ORG },
    { "@type": "SoftwareApplication", name: `Carbon Stealth CMS (${a.eyebrow})`, applicationCategory: "BusinessApplication", operatingSystem: "Web", description: a.desc, provider: { "@id": ORG["@id"] } },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Carbon Stealth Portfolio", item: SITE + PATHS.hub[lang] }, { "@type": "ListItem", position: 2, name: a.eyebrow, item: SITE + path }] },
  ] });
  return join([
    head({ lang, title: a.title, description: a.desc, keywords: a.keywords, path, paths: PATHS.admin, fonts: [...HUB_FONTS, "Inter:wght@400;500;600"], css: ["/assets/site.css", "/assets/admin.css"], themeColor: BRAND_BG, extra: schema }),
    `<body class="hub admin-page">`, boot(ui), siteNav(lang, ui, PATHS.admin),
    `<main id="main"><section class="section" style="padding-top:140px;padding-bottom:40px"><div class="wrap"><div class="tag reveal">// ${esc(a.eyebrow)}</div><h1 class="h2 reveal">${a.h1}</h1><p class="lede reveal">${esc(a.lede)}</p></div></section>`,
    `<section class="wrap ad-wrap"><div class="ad-app" data-admin="${esc(JSON.stringify({ saved: a.actions.saved, changed: a.actions.changed, none: a.actions.none }))}"><aside class="ad-side"><div class="ad-brand">${ICON.layers}<span>${esc(a.brand)}</span></div><nav class="ad-nav" aria-label="${esc(a.eyebrow)}">${Object.entries(a.nav).map(([k, v], i) => `<button type="button" class="${i === 0 ? "on" : ""}" data-pane="${k}">${esc(v)}</button>`).join("")}</nav><div class="ad-history"><h3>${esc(a.actions.history)}</h3><ul data-history><li class="ad-none">${esc(a.actions.none)}</li></ul></div></aside><div class="ad-main"><div class="ad-top"><span class="ad-dirty" data-dirty hidden></span><button type="button" class="ad-undo" data-undo>${esc(a.actions.undo)}</button><button type="button" class="ad-save" data-save>${esc(a.actions.save)}</button></div>${Object.entries(panes).map(([k, html], i) => `<div class="ad-pane" data-pane-body="${k}"${i ? " hidden" : ""}>${html}</div>`).join("")}</div><div class="ad-preview"><div class="ad-pv-head"><span class="hud">${esc(a.actions.preview)}</span><a href="${demoPath(lang, SRC)}" target="_blank" rel="noopener">${esc(a.actions.openDemo)}</a></div>${preview}</div></div><p class="ad-note">${esc(a.note)}</p><p class="ad-note"><strong>${esc(a.included)}</strong> <a href="${PATHS.pricing[lang]}">${esc(ui.nav.pricing)} →</a></p></section><div class="ad-toast" data-toast hidden></div></main>`,
    siteFooter(lang, ui), `<script src="/assets/site.js" defer></script><script src="/assets/admin.js" defer></script>`, `</body></html>`,
  ]);
}
