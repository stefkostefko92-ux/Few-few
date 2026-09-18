import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
// html.mjs — минимални помощници за генериране на HTML без зависимости.
// Всичко потребителско минава през esc(); суровият HTML е позволен само за наш код.

export const LANGS = ["bg", "en", "it"];
export const SITE = "https://portfolio.carbonstealth.eu";
export const BRAND = "Carbon Stealth VCC";
export const BRAND_URL = "https://carbonstealth.eu";
export const BRAND_EMAIL = "info@carbonstealth.eu";
export const BRAND_EIK = "BG208725180";
export const BRAND_ADDRESS = { street: "ул. Самуил 3", city: "Бобов дол", zip: "2670", country: "BG" };

/** Екраниране за текстово съдържание и стойности на атрибути. */
export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Екраниране за JSON вътре в <script type="application/ld+json"> (не позволява затваряне на тага). */
export function jsonLd(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;
}

/** Обединява части, пропуска празни (null/false/undefined). */
export const join = (parts, sep = "\n") => parts.filter((p) => p !== null && p !== undefined && p !== false && p !== "").join(sep);

/** Съкратен HTML списък от масив низове. */
export const ul = (items, cls = "") => `<ul${cls ? ` class="${cls}"` : ""}>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

/** Единствен източник на истината за пътищата на страниците (локализирани слъгове). */
export const PATHS = {
  hub: { bg: "/bg/", en: "/en/", it: "/it/" },
  pricing: { bg: "/bg/ceni/", en: "/en/pricing/", it: "/it/prezzi/" },
  legal: { bg: "/bg/pravna-informacia/", en: "/en/legal/", it: "/it/note-legali/" },
  projects: { bg: "/bg/proekti/", en: "/en/projects/", it: "/it/progetti/" },
  admin: { bg: "/bg/demo/admin-panel/", en: "/en/demo/admin-panel/", it: "/it/demo/pannello-admin/" },
  quote: { bg: "/bg/oferta/", en: "/en/quote/", it: "/it/preventivo/" },
  blog: { bg: "/bg/blog/", en: "/en/blog/", it: "/it/blog/" },
  local: { bg: "/bg/izrabotka-na-sait/", en: "/en/web-design/", it: "/it/realizzazione-siti/" },
  hosting: { bg: "/bg/hosting-i-poddrazhka/", en: "/en/hosting-and-maintenance/", it: "/it/hosting-e-manutenzione/" },
  a11y: { bg: "/bg/dostapnost/", en: "/en/accessibility/", it: "/it/accessibilita/" },
  brochure: { bg: "/bg/broshura/", en: "/en/brochure/", it: "/it/brochure/" },
};
/** PDF брошурата (tools/brochure.mjs → public/broshura/); линкът е винаги същият. */
export const BROCHURE_PDF = { bg: "/broshura/carbon-stealth-portfolio-bg.pdf", en: "/broshura/carbon-stealth-portfolio-en.pdf", it: "/broshura/carbon-stealth-portfolio-it.pdf" };

export const demoPath = (lang, demo) => `/${lang}/demo/${demo.slug[lang]}/`;

/** Слъг на семейство от Google-стил спецификация („Barlow+Condensed:wght@600;700“ → barlow-condensed). */
export const fontSlug = (family) => family.split(":")[0].replace(/\+/g, "-").toLowerCase();

/** Критичните woff2 на семейството (latin + cyrillic за bg), четени от генерирания CSS при билд —
 *  preload, защото с font-display:optional шрифтът се ползва само ако е пристигнал преди първия рендер. */
const FONT_CSS_DIR = fileURLToPath(new URL("../assets/fonts/", import.meta.url));
const preloadCache = new Map();
export function fontPreloads(fonts, lang) {
  const key = `${fonts.join("|")}:${lang}`;
  if (preloadCache.has(key)) return preloadCache.get(key);
  const out = [];
  for (const f of fonts) {
    const file = `${FONT_CSS_DIR}${fontSlug(f)}.css`;
    if (!existsSync(file)) continue;
    const css = readFileSync(file, "utf8");
    for (const block of css.split("@font-face").slice(1)) {
      const url = block.match(/url\((\/fonts\/[^)]+\.woff2)\)/)?.[1], range = block.match(/unicode-range:\s*([^;]+)/)?.[1] || "";
      const latin = /U\+0000-00FF/.test(range), cyr = /U\+0400-045F/.test(range);
      if (url && (latin || (lang === "bg" && cyr)) && !out.includes(url)) out.push(url);
    }
  }
  const r = out.slice(0, 6); preloadCache.set(key, r); return r;
}

/** hreflang алтернативи за страница с локализирани пътища. */
export function alternates(pathsByLang) {
  const links = LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${SITE}${pathsByLang[l]}">`);
  links.push(`<link rel="alternate" hreflang="x-default" href="${SITE}${pathsByLang.bg}">`);
  return links.join("\n");
}

const OG_LOCALE = { bg: "bg_BG", en: "en_GB", it: "it_IT" };

/**
 * Общ <head>. Гарантира: title <60, description <160 (гейтвано в тестовете), canonical, hreflang,
 * OG + Twitter, keywords ≥5 с „Carbon Stealth", theme-color, шрифтове само за тази страница.
 */
export function head({ lang, title, description, keywords, path, paths, fonts, css, themeColor, ogImage, noindex, extra = "" }) {
  const url = SITE + path;
  const kws = [...new Set([...keywords, "Carbon Stealth"])];
  // Шрифтовете са самостоятелно хостнати (tools/fonts.mjs → /fonts/*.woff2, по един CSS на семейство):
  // нула заявки към Google в продукция, по-бърз LCP, нищо за разкриване в политиката.
  const fontCss = (fonts || []).map((f) => `/assets/fonts/${fontSlug(f)}.css`);
  const preload = fontPreloads(fonts || [], lang).map((u) => `<link rel="preload" as="font" type="font/woff2" href="${u}" crossorigin>`);
  return join([
    `<!doctype html>`,
    `<html lang="${lang}">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">`,
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<meta name="keywords" content="${esc(kws.join(", "))}">`,
    noindex ? `<meta name="robots" content="noindex, follow">` : `<meta name="robots" content="index, follow, max-image-preview:large">`,
    `<link rel="canonical" href="${url}">`,
    paths ? alternates(paths) : null,
    `<meta name="theme-color" content="${themeColor}">`,
    `<meta name="author" content="${BRAND}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="${OG_LOCALE[lang]}">`,
    `<meta property="og:site_name" content="Carbon Stealth · Portfolio">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:image" content="${SITE}${ogImage || "/og.png"}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${SITE}${ogImage || "/og.png"}">`,
    `<link rel="icon" href="/favicon.ico" sizes="32x32">`,
    `<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
    ...preload,
    ...fontCss.map((c) => `<link rel="stylesheet" href="${c}">`),
    ...css.map((c) => `<link rel="stylesheet" href="${c}">`),
    extra,
    `</head>`,
  ]);
}

/** Футърът, който всеки сайт носи без изключение (законът в потребителските правила). */
export function credit(lang) {
  const t = { bg: "Създаден и проектиран от", en: "Created and Designed by", it: "Creato e progettato da" }[lang];
  return `<p class="credit">${t} <a href="${BRAND_URL}" target="_blank" rel="noopener">Carbon Stealth VCC</a></p>`;
}

/** Организацията — една дефиниция, вградена във всеки JSON-LD граф. */
export const ORG = {
  "@type": "Organization",
  "@id": `${BRAND_URL}/#organization`,
  name: BRAND,
  url: BRAND_URL,
  email: BRAND_EMAIL,
  vatID: BRAND_EIK,
  logo: { "@type": "ImageObject", url: `${SITE}/logo-square.png`, width: 1024, height: 1024 },
  address: { "@type": "PostalAddress", streetAddress: BRAND_ADDRESS.street, addressLocality: BRAND_ADDRESS.city, postalCode: BRAND_ADDRESS.zip, addressCountry: BRAND_ADDRESS.country },
};

/** Инлайн SVG икони (stroke, currentColor) — нула външни заявки. */
export const ICON = {
  arrow: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.9 19.9 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.9 19.9 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.4 2.1L8.1 10.1a16 16 0 0 0 6 6l1.4-1.4a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  star: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="m12 2 3 6.6 7 .8-5.2 4.9 1.4 7.1L12 18l-6.2 3.4 1.4-7.1L2 9.4l7-.8z"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>`,
  cart: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H7"/><circle cx="10" cy="20" r="1"/><circle cx="17" cy="20" r="1"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/></svg>`,
  search: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`,
  layers: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg>`,
  euro: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M18 6a7 7 0 1 0 0 12M4 10h10M4 14h10"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
};
