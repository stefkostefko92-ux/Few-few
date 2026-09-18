// misc.mjs — правна страница, коренов избор на език, 404, robots, llms, sitemap, security.txt.
import { esc, join, head, credit, jsonLd, PATHS, demoPath, SITE, LANGS, ORG, BRAND_URL } from "../lib/html.mjs";
import { PROJECTS } from "../projects.mjs";
import { I18N } from "../i18n/index.mjs";
import { DEMOS } from "../demos/index.mjs";
import { siteNav, siteFooter, boot, HUB_FONTS, BRAND_BG } from "./hub.mjs";
import { TIERS, ADDONS, fmt, shown, net } from "../pricing.mjs";

export function renderLegal(lang) {
  const ui = I18N[lang], path = PATHS.legal[lang];
  return join([
    head({ lang, title: ui.meta.legalTitle, description: ui.meta.legalDesc, keywords: ui.meta.legalKeywords, path, paths: PATHS.legal, fonts: HUB_FONTS, css: ["/assets/site.css"], themeColor: BRAND_BG, noindex: false, extra: jsonLd({ "@context": "https://schema.org", "@type": "WebPage", url: SITE + path, name: ui.legal.title, inLanguage: lang, publisher: ORG }) }),
    `<body class="hub">`, boot(ui), siteNav(lang, ui, PATHS.legal),
    `<main id="main" class="section legal" style="padding-top:140px"><div class="wrap" style="max-width:820px"><div class="tag">// ${esc(ui.nav.legal)}</div><h1 class="h2">${esc(ui.legal.title)}</h1>${ui.legal.sections.map((s) => `<h2>${esc(s.t)}</h2>${s.p.map((p) => `<p>${esc(p)}</p>`).join("")}`).join("")}</div></main>`,
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
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
<meta name="theme-color" content="${BRAND_BG}">
<link rel="stylesheet" href="/assets/fonts/brand.css"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#ccc;font:400 12px/1.8 'Space Mono',monospace;letter-spacing:.02em}nav{display:grid;gap:8px;text-align:center}h1{font:900 clamp(2.4rem,9vw,6rem)/1 'Inter Tight',sans-serif;color:#00e5ff;letter-spacing:-.05em;text-shadow:0 0 40px rgba(0,229,255,.3);margin-bottom:24px}a{color:#00e5ff;border:1px solid rgba(0,229,255,.4);padding:12px 28px;text-decoration:none;text-transform:uppercase;letter-spacing:.15em;font-size:11px}a:hover{background:#00e5ff;color:#000}</style>
<script>(function(){var s={bg:1,en:1,it:1},l;try{l=localStorage.getItem("cs-lang")}catch(e){}l=l||(navigator.language||"bg").slice(0,2).toLowerCase();location.replace("/"+(s[l]?l:"bg")+"/")})();</script>
</head>
<body><div><h1><picture><source srcset="/mark.webp" type="image/webp"><img src="/mark.png" alt="Carbon Stealth VCC" width="320" height="320" style="width:clamp(120px,30vw,200px);height:auto"></picture></h1><nav aria-label="Language">${links}</nav></div></body>
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
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
<link rel="stylesheet" href="/assets/fonts/brand.css"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#ccc;font:400 12px/1.9 'Space Mono',monospace;padding:24px;text-align:center;letter-spacing:.02em}h1{font:900 clamp(80px,20vw,160px)/1 'Inter Tight',sans-serif;margin:0;color:#00e5ff;letter-spacing:-.05em;text-shadow:0 0 40px rgba(0,229,255,.3)}a{color:#00e5ff}p{max-width:52ch;margin:10px auto}strong{color:#f5f5f0}</style>
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
  const tiers = TIERS.map((t) => `- ${I18N.bg.pricing.tiers[t.id].name} / ${I18N.en.pricing.tiers[t.id].name}: ${fmt(shown(t.price, "en"), "en")} EUR excl. VAT (${fmt(t.price, "en")} EUR incl. 20% VAT for clients in Bulgaria) — ${I18N.en.pricing.tiers[t.id].tag}`).join("\n");
  const addons = ADDONS.map((a) => `- ${I18N.en.pricing.addons[a.id]}: ${fmt(net(a.price), "en")} EUR excl. VAT (${fmt(a.price, "en")} EUR incl. VAT in Bulgaria) ${a.kind === "monthly" ? "per month" : "one-off"}`).join("\n");
  return `# Carbon Stealth Portfolio

> Портфолио на Carbon Stealth VCC (${BRAND_URL}) — уеб студио от България, работещо с клиенти в България и Италия. Сайтът показва 10 напълно работещи демо лендинг страници за 10 вида бизнес (автосервиз, фитнес, мебелен магазин, адвокатска кантора, салон за красота, хотел/къща за гости, счетоводна къща, автокъща, магазин за дрехи, бързо хранене) на български, английски и италиански, плюс прозрачни цени, поне 15% под пазарните за 2026 г.

> Portfolio of Carbon Stealth VCC — a web studio from Bulgaria serving clients in Bulgaria and Italy. ${DEMOS.length} fully working demo landing pages for ten kinds of business, in Bulgarian, English and Italian, plus transparent pricing at least 15% below the 2026 market.

## Компания / Company
- Carbon Stealth VCC · ЕИК/VAT BG208725180 · ул. Самуил 3, 2670 Бобов дол, България · info@carbonstealth.eu
- Услуги: уеб сайтове, лендинг страници, онлайн магазини, софтуер по поръчка, SEO/GEO/AEO, хостинг в ЕС.
- Езици: български, английски, италиански.

## Цени / Pricing (EUR)
Същите цени като на carbonstealth.eu. Българската версия показва крайни цени с включен 20% ДДС; английската и италианската — нето (÷1,20), без ДДС само за фирми с валиден ДДС номер. / Same prices as on carbonstealth.eu: the Bulgarian page shows prices including 20% VAT, the English and Italian pages show net prices (÷1.20); VAT is waived only for companies with a valid VAT number, private individuals always pay 20%.
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

## Реални проекти / Real projects (live)
${PROJECTS.map((p) => `- ${p.t.en.name} (${p.t.en.category}): ${p.url} — ${p.t.en.desc}`).join("\n")}
- ${SITE}${PATHS.projects.bg} · ${SITE}${PATHS.projects.en} · ${SITE}${PATHS.projects.it}

## Правна информация / Legal
- ${SITE}${PATHS.legal.bg} · ${SITE}${PATHS.legal.en} · ${SITE}${PATHS.legal.it}
`;
}

export function sitemap(urls, lastmod) {
  const alt = (a) => LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE}${a[l]}"/>`).concat([`    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${a.bg}"/>`]).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map((u) => `  <url>\n    <loc>${SITE}${u.loc}</loc>\n    <lastmod>${u.lastmod || lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n${alt(u.alt)}\n  </url>`).join("\n")}
</urlset>
`;
}

export const securityTxt = () => `Contact: mailto:info@carbonstealth.eu
Contact: ${BRAND_URL}
Preferred-Languages: bg, en, it
Canonical: ${SITE}/.well-known/security.txt
Expires: 2027-09-17T00:00:00.000Z
`;
