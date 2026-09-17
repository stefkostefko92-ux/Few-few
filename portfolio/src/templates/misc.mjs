// misc.mjs — правна страница, коренов избор на език, 404, robots, llms, sitemap, security.txt.
import { esc, join, head, credit, jsonLd, PATHS, demoPath, SITE, LANGS, ORG, BRAND_URL } from "../lib/html.mjs";
import { I18N } from "../i18n/index.mjs";
import { DEMOS } from "../demos/index.mjs";
import { siteNav, siteFooter, HUB_FONTS, BRAND_BG } from "./hub.mjs";
import { TIERS, ADDONS, fmt } from "../pricing.mjs";

export function renderLegal(lang) {
  const ui = I18N[lang], path = PATHS.legal[lang];
  return join([
    head({ lang, title: ui.meta.legalTitle, description: ui.meta.legalDesc, keywords: ui.meta.legalKeywords, path, paths: PATHS.legal, fonts: HUB_FONTS, css: ["/assets/site.css"], themeColor: BRAND_BG, noindex: false, extra: jsonLd({ "@context": "https://schema.org", "@type": "WebPage", url: SITE + path, name: ui.legal.title, inLanguage: lang, publisher: ORG }) }),
    `<body class="hub">`, siteNav(lang, ui, PATHS.legal),
    `<main class="section"><div class="wrap narrow"><h1 class="h2">${esc(ui.legal.title)}</h1>${ui.legal.sections.map((s) => `<h2>${esc(s.t)}</h2>${s.p.map((p) => `<p class="body">${esc(p)}</p>`).join("")}`).join("")}</div></main>`,
    siteFooter(lang, ui), `<script src="/assets/site.js" defer></script>`, `</body></html>`,
  ]);
}

/** Коренът: избор на език с автоматично пренасочване по езика на браузъра (noindex; x-default → /bg/). */
export function renderRoot() {
  const links = LANGS.map((l) => `<a href="${PATHS.hub[l]}" hreflang="${l}" lang="${l}">${I18N[l].name}</a>`).join("");
  return `<!doctype html>
<html lang="bg">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Carbon Stealth · Portfolio</title>
<meta name="description" content="Портфолио на Carbon Stealth VCC — изберете език: български, English, italiano.">
<meta name="keywords" content="Carbon Stealth, портфолио, portfolio, уеб студио, web agency">
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${SITE}/bg/">
${LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${SITE}${PATHS.hub[l]}">`).join("\n")}
<link rel="alternate" hreflang="x-default" href="${SITE}/bg/">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta name="theme-color" content="${BRAND_BG}">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:${BRAND_BG};color:#f4faea;font:500 18px/1.5 system-ui,sans-serif}nav{display:grid;gap:12px;text-align:center}a{color:#99e72a;border:1px solid #1d2a14;border-radius:999px;padding:12px 28px;text-decoration:none}a:hover{background:#0d4a02}</style>
<script>(function(){var s={bg:1,en:1,it:1},l;try{l=localStorage.getItem("cs-lang")}catch(e){}l=l||(navigator.language||"bg").slice(0,2).toLowerCase();location.replace("/"+(s[l]?l:"bg")+"/")})();</script>
</head>
<body><nav aria-label="Language">${links}</nav></body>
</html>`;
}

export function renderNotFound() {
  const rows = LANGS.map((l) => `<p lang="${l}"><strong>${esc(I18N[l].notFound.title)}.</strong> ${esc(I18N[l].notFound.p)} <a href="${PATHS.hub[l]}">${esc(I18N[l].notFound.cta)} →</a></p>`).join("");
  return `<!doctype html>
<html lang="bg">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, follow">
<title>404 · Carbon Stealth Portfolio</title>
<meta name="keywords" content="Carbon Stealth, 404, страница не е намерена, page not found, pagina non trovata">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:${BRAND_BG};color:#c8dda6;font:400 17px/1.6 system-ui,sans-serif;padding:24px;text-align:center}h1{font-size:clamp(80px,20vw,160px);margin:0;color:#5ab60d;line-height:1}a{color:#99e72a}p{max-width:52ch;margin:10px auto}</style>
</head>
<body><div><h1>404</h1>${rows}</div></body>
</html>`;
}

export const robots = () => `# robots.txt — Carbon Stealth Portfolio
User-agent: *
Allow: /

# AI ботове: съдържанието е свободно цитируемо за генеративни асистенти
User-agent: GPTBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;

export function llms() {
  const demoLines = (l) => DEMOS.map((d) => `- ${d.t[l].name} (${d.t[l].category}): ${SITE}${demoPath(l, d)}`).join("\n");
  const tiers = TIERS.map((t) => `- ${I18N.bg.pricing.tiers[t.id].name} / ${I18N.en.pricing.tiers[t.id].name}: ${fmt(t.price)} EUR (${I18N.en.pricing.tiers[t.id].tag})`).join("\n");
  const addons = ADDONS.map((a) => `- ${I18N.en.pricing.addons[a.id]}: ${fmt(a.price)} EUR ${a.kind === "monthly" ? "per month" : "one-off"}`).join("\n");
  return `# Carbon Stealth Portfolio

> Портфолио на Carbon Stealth VCC (${BRAND_URL}) — уеб студио от България, работещо с клиенти в България и Италия. Сайтът показва 10 напълно работещи демо лендинг страници за 10 вида бизнес (автосервиз, фитнес, мебелен магазин, адвокатска кантора, салон за красота, хотел/къща за гости, счетоводна къща, автокъща, магазин за дрехи, бързо хранене) на български, английски и италиански, плюс прозрачни цени, поне 15% под пазарните за 2026 г.

> Portfolio of Carbon Stealth VCC — a web studio from Bulgaria serving clients in Bulgaria and Italy. Ten fully working demo landing pages for ten kinds of business, in Bulgarian, English and Italian, plus transparent pricing at least 15% below the 2026 market.

## Компания / Company
- Carbon Stealth VCC · ЕИК/VAT BG208725180 · ул. Самуил 3, 2670 Бобов дол, България · info@carbonstealth.eu
- Услуги: уеб сайтове, лендинг страници, онлайн магазини, софтуер по поръчка, SEO/GEO/AEO, хостинг в ЕС.
- Езици: български, английски, италиански.

## Цени (EUR, без ДДС) / Pricing (EUR, excl. VAT)
${tiers}
${addons}
- ДДС: клиенти от България +20%; фирми от ЕС извън България — обратно начисляване (reverse charge, чл. 196 Директива 2006/112/ЕО), без български ДДС; фирми извън ЕС — без български ДДС.
- Цени: ${SITE}${PATHS.pricing.bg} · ${SITE}${PATHS.pricing.en} · ${SITE}${PATHS.pricing.it}

## Демота / Demos (BG)
${demoLines("bg")}

## Demos (EN)
${demoLines("en")}

## Demo (IT)
${demoLines("it")}

## Правна информация / Legal
- ${SITE}${PATHS.legal.bg} · ${SITE}${PATHS.legal.en} · ${SITE}${PATHS.legal.it}
`;
}

export function sitemap(urls, lastmod) {
  const alt = (a) => LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE}${a[l]}"/>`).concat([`    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${a.bg}"/>`]).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map((u) => `  <url>\n    <loc>${SITE}${u.loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n${alt(u.alt)}\n  </url>`).join("\n")}
</urlset>
`;
}

export const securityTxt = () => `Contact: mailto:info@carbonstealth.eu
Contact: ${BRAND_URL}
Preferred-Languages: bg, en, it
Canonical: ${SITE}/.well-known/security.txt
Expires: 2027-09-17T00:00:00.000Z
`;
