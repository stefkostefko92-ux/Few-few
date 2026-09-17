// hub.mjs — началната страница в дизайн езика на carbonstealth.eu (HUD брутализъм): boot, canvas
// hero с магнитно заглавие, тикер, демота като 1px решетка с живи прегледи, процес като номерирани
// редове, „защо", цени, контакт. Общи части (nav/footer/contact/boot/ghost) се ползват и от цените/правната.
import { esc, join, head, credit, jsonLd, ICON, ORG, PATHS, demoPath, SITE, LANGS, BRAND_EMAIL, BRAND_URL } from "../lib/html.mjs";
import { I18N } from "../i18n/index.mjs";
import { DEMOS } from "../demos/index.mjs";
import { DEMO_ICONS } from "./icons.mjs";
import { TIERS, fmt } from "../pricing.mjs";

export const HUB_FONTS = ["brand"];
export const BRAND_BG = "#000000";
const CONTACT_URL = { bg: `${BRAND_URL}/bg/contact/`, en: `${BRAND_URL}/en/contact/`, it: `${BRAND_URL}/contact/` };

/** Ghost/Echo заглавие: 5 cyan копия зад плътния текст (aria-label = чистият текст). */
export function ghost(html) {
  const plain = html.replace(/<[^>]+>/g, "");
  return `<h2 class="h2 reveal" aria-label="${esc(plain)}">${[1, 2, 3, 4, 5].map((n) => `<span class="ghost ghost-${n}" aria-hidden="true">${plain}</span>`).join("")}<span class="real">${html}</span></h2>`;
}

/** BIOS POST boot екран — редовете се пълнят от site.js с реални данни от Navigator API. */
export function boot(ui) {
  return `<div class="boot" id="boot" aria-hidden="true"><i class="boot-corner tl"></i><i class="boot-corner tr"></i><i class="boot-corner bl"></i><i class="boot-corner br"></i><div class="boot-scan"></div><div class="boot-cs">CS</div><div class="boot-list hud"></div><div class="hud"><span style="animation:cs-blink 1s infinite">●</span> ${esc(ui.brand.boot)}</div></div>`;
}

const logo = (extra = "") => `<picture><source srcset="/logo.webp" type="image/webp"><img class="logo" src="/logo.png" alt="Carbon Stealth VCC" width="560" height="239"${extra}></picture>`;

export function siteNav(lang, ui, current) {
  const links = [[`${PATHS.hub[lang]}#demos`, ui.nav.demos], [`${PATHS.hub[lang]}#process`, ui.nav.process], [`${PATHS.hub[lang]}#why`, ui.nav.why], [PATHS.pricing[lang], ui.nav.pricing], [`${PATHS.hub[lang]}#contact`, ui.nav.contact]];
  const langs = LANGS.map((l) => `<a href="${current[l]}" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="page"' : ""}>${I18N[l].short}</a>`).join("");
  return `<a class="cs-skip" href="#main">${esc(ui.nav.demos)} ↓</a><header class="nav"><a href="${PATHS.hub[lang]}" aria-label="Carbon Stealth VCC">${logo()}</a><nav class="nav-links" aria-label="Menu">${links.map(([h, l]) => `<a href="${h}" data-scramble>${esc(l)}</a>`).join("")}</nav><div class="nav-right"><span class="hud fps"><i>●</i><span id="fps">60 FPS</span></span><nav class="langs" aria-label="Language">${langs}</nav><button class="burger" aria-expanded="false" aria-controls="menu" aria-label="${esc(ui.nav.menu)}">≡</button></div></header><nav id="menu" class="mobile-menu" aria-label="Menu">${links.map(([h, l]) => `<a href="${h}">${esc(l)}</a>`).join("")}</nav>`;
}

export function siteFooter(lang, ui) {
  const b = ui.brand;
  return `<footer class="foot"><div class="wrap"><div class="foot-grid"><div>${logo(' loading="lazy"')}<p class="desc">${esc(b.desc)}</p></div><div><h4>${esc(b.cols.demos)}</h4><ul>${DEMOS.map((d) => `<li><a href="${demoPath(lang, d)}">${esc(d.t[lang].name)} · ${esc(d.t[lang].category)}</a></li>`).join("")}</ul></div><div><h4>${esc(b.cols.company)}</h4><ul>${b.company.map(([h, l]) => `<li><a href="${h}"${h.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}>${esc(l)}</a></li>`).join("")}<li><a href="${PATHS.pricing[lang]}">${esc(ui.nav.pricing)}</a></li></ul></div><div><h4>${esc(b.cols.legal)}</h4><ul><li><a href="${PATHS.legal[lang]}">${esc(ui.footer.legal)}</a></li><li><a href="/llms.txt">llms.txt</a></li><li><a href="/sitemap.xml">sitemap.xml</a></li></ul></div></div><div class="badges hud">${b.badges.map((x) => `<span>${esc(x)}</span>`).join("")}</div><div class="impressum"><div>${esc(b.impressum)}</div><div>© ${new Date().getFullYear()} Carbon Stealth VCC · ${esc(ui.footer.rights)} ${esc(ui.footer.built)}</div>${credit(lang)}</div></div></footer>`;
}

/** Заглавието буква по буква (магнитно отблъскване в site.js); <em> частта е cyan. */
function letters(title) {
  return title.split(/(<em>[\s\S]*?<\/em>)/).map((part) => {
    const em = part.startsWith("<em>");
    const text = part.replace(/<\/?em>/g, "");
    // Думите са неделими (inline-block букви иначе се чупят по средата на дума).
    return text.split(" ").map((word) => (word ? `<span class="w">${[...word].map((ch) => `<span class="l"${em ? ' style="color:var(--cyan)"' : ""}>${esc(ch)}</span>`).join("")}</span>` : "")).join(" ");
  }).join("");
}

function hero(ui) {
  return `<section class="hero" id="top"><canvas class="hero-canvas" id="hero-canvas" aria-hidden="true"></canvas><div class="hero-scan" aria-hidden="true"><i></i></div><div class="wrap"><div class="tag">${esc(ui.hero.eyebrow)}</div><h1 aria-label="${esc(ui.hero.title.replace(/<[^>]+>/g, ""))}">${letters(ui.hero.title)}</h1><p class="hero-sub">${esc(ui.demos.eyebrow)} · BG · EN · IT</p><p class="hero-desc">${esc(ui.hero.lede)}</p><div class="cta-row"><a class="btn btn-solid" href="#demos" data-magnetic>${esc(ui.hero.ctaDemos)} ${ICON.arrow}</a><a class="btn" href="${PATHS.pricing[ui.code]}" data-magnetic>${esc(ui.hero.ctaPricing)}</a></div><ul class="stats">${ui.hero.stats.map((s) => `<li><b>${esc(s.n)}</b><span>${esc(s.l)}</span></li>`).join("")}</ul></div><div class="hud hud-l">${esc(ui.brand.hudLeft)}</div><div class="hud hud-r">${esc(ui.brand.hudRight)}</div></section>`;
}

const ticker = (ui) => `<div class="ticker" tabindex="0" aria-label="ticker"><div class="ticker-track"><span>${esc(ui.brand.ticker)}</span><span>${esc(ui.brand.ticker)}</span></div></div>`;

function demoCard(lang, demo, ui, i) {
  const t = demo.t[lang], th = demo.theme, href = demoPath(lang, demo);
  return `<article class="cell demo-card reveal" style="--c-bg:${th.bg};--c-accent:${th.accent};--c-text:${th.text};--c-surface:${th.surface}" data-cursor><a class="demo-cover" href="${href}" data-preview="${href}" aria-label="${esc(ui.demos.open)}: ${esc(t.name)}"><span class="cover-art" aria-hidden="true">${DEMO_ICONS[demo.icon]}<span class="cover-name" style="font-family:${th.display}">${esc(t.name)}</span></span><span class="live" aria-hidden="true">${esc(ui.brand.live)}</span></a><div class="demo-meta"><div><span class="mono-num">${String(i + 1).padStart(3, "0")}</span> <span class="cat">${esc(t.category)}</span><h3 data-scramble>${esc(t.name)}</h3><span class="sw" aria-hidden="true"><i style="background:${th.bg}"></i><i style="background:${th.accent}"></i><i style="background:${th.accent2}"></i><i style="background:${th.text}"></i></span></div><a class="open" href="${href}">${esc(ui.brand.open)}</a></div></article>`;
}

function demos(lang, ui) {
  return `<section class="section" id="demos"><div class="wrap"><div class="tag reveal">// ${esc(ui.demos.eyebrow)}</div>${ghost(ui.demos.title)}<p class="lede reveal">${esc(ui.demos.lede)}</p><div class="grid1">${DEMOS.map((d, i) => demoCard(lang, d, ui, i)).join("")}</div></div></section>`;
}

function process(ui) {
  return `<section class="section alt" id="process"><div class="wrap"><div class="tag reveal">// ${esc(ui.process.eyebrow)}</div>${ghost(ui.process.title)}<div class="rows">${ui.process.steps.map((s, i) => `<div class="row reveal" data-cursor><span class="mono-num">0${i + 1}</span><h3 data-scramble>${esc(s.t)}</h3><p>${esc(s.d)}</p></div>`).join("")}</div></div></section>`;
}

function why(ui) {
  return `<section class="section" id="why"><div class="wrap"><div class="tag reveal">// ${esc(ui.why.eyebrow)}</div>${ghost(ui.why.title)}<div class="grid1" style="margin-top:48px">${ui.why.items.map((i, n) => `<article class="cell reveal" data-cursor><span class="ic">${ICON[i.icon]}</span><span class="mono-num">0${n + 1}</span><h3 data-scramble>${esc(i.t)}</h3><p>${esc(i.d)}</p></article>`).join("")}</div></div></section>`;
}

function pricingTeaser(lang, ui) {
  return `<section class="section alt" id="pricing"><div class="wrap"><div class="tag reveal">// ${esc(ui.pricingTeaser.eyebrow)}</div>${ghost(ui.pricingTeaser.title)}<p class="lede reveal">${esc(ui.pricingTeaser.lede)}</p><div class="mini reveal">${TIERS.map((t) => `<a class="${t.popular ? "pop" : ""}" href="${PATHS.pricing[lang]}#${t.id}" data-cursor><span>${esc(ui.pricing.tiers[t.id].name)} — ${esc(ui.pricing.tiers[t.id].tag)}</span><b>${fmt(t.price)} €</b></a>`).join("")}</div><p style="margin-top:32px"><a class="btn" href="${PATHS.pricing[lang]}" data-magnetic>${esc(ui.pricingTeaser.cta)} ${ICON.arrow}</a></p></div></section>`;
}

export function contact(lang, ui, title = ui.contact.title, lede = ui.contact.lede) {
  return `<section class="section" id="contact"><div class="wrap"><div class="contact-box reveal"><i class="corner c1"></i><i class="corner c2"></i><i class="corner c3"></i><i class="corner c4"></i><div class="tag">// ${esc(ui.contact.eyebrow)}</div><h2 class="contact-title">${title}</h2><p class="lede">${esc(lede)}</p><div class="cta-row"><a class="btn btn-solid" href="mailto:${BRAND_EMAIL}" data-magnetic>${ICON.mail} ${esc(ui.contact.email)}</a><a class="btn" href="${CONTACT_URL[lang]}" target="_blank" rel="noopener" data-magnetic>${esc(ui.contact.site)} ${ICON.arrow}</a></div><p class="hud" style="margin-top:28px">${esc(ui.contact.where)}</p></div></div></section>`;
}

function schema(lang, ui, path) {
  return jsonLd({ "@context": "https://schema.org", "@graph": [
    ORG,
    { "@type": "WebSite", "@id": `${SITE}/#website`, url: SITE, name: "Carbon Stealth Portfolio", inLanguage: LANGS, publisher: { "@id": ORG["@id"] } },
    { "@type": "CollectionPage", "@id": SITE + path, url: SITE + path, name: ui.meta.hubTitle, description: ui.meta.hubDesc, inLanguage: lang, isPartOf: { "@id": `${SITE}/#website` }, hasPart: DEMOS.map((d) => ({ "@type": "WebPage", name: d.t[lang].name, url: SITE + demoPath(lang, d), about: d.t[lang].category })) },
    { "@type": "Service", name: ui.meta.hubTitle.split("|")[0].trim(), provider: { "@id": ORG["@id"] }, areaServed: ["BG", "IT", "EU"], serviceType: "Web design and development", offers: TIERS.map((t) => ({ "@type": "Offer", name: ui.pricing.tiers[t.id].name, price: t.price, priceCurrency: "EUR", url: SITE + PATHS.pricing[lang] + "#" + t.id })) },
  ] });
}

export function renderHub(lang) {
  const ui = I18N[lang], path = PATHS.hub[lang];
  return join([
    head({ lang, title: ui.meta.hubTitle, description: ui.meta.hubDesc, keywords: ui.meta.hubKeywords, path, paths: PATHS.hub, fonts: HUB_FONTS, css: ["/assets/site.css"], themeColor: BRAND_BG, extra: schema(lang, ui, path) }),
    `<body class="hub">`, boot(ui), siteNav(lang, ui, PATHS.hub),
    `<main id="main">`, hero(ui), ticker(ui), demos(lang, ui), `<div class="divider"></div>`, process(ui), why(ui), pricingTeaser(lang, ui), contact(lang, ui), `</main>`,
    siteFooter(lang, ui),
    `<script src="/assets/site.js" defer></script><script src="/assets/hero.js" defer></script>`,
    `</body></html>`,
  ]);
}
