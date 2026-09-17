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
};

export const demoPath = (lang, demo) => `/${lang}/demo/${demo.slug[lang]}/`;

/** Слъг на семейство от Google-стил спецификация („Barlow+Condensed:wght@600;700“ → barlow-condensed). */
export const fontSlug = (family) => family.split(":")[0].replace(/\+/g, "-").toLowerCase();

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
    `<link rel="icon" type="image/png" href="/favicon.png">`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
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
  logo: `${SITE}/apple-touch-icon.png`,
  address: { "@type": "PostalAddress", streetAddress: BRAND_ADDRESS.street, addressLocality: BRAND_ADDRESS.city, postalCode: BRAND_ADDRESS.zip, addressCountry: BRAND_ADDRESS.country },
};

/** UI иконите на собственика (public/icons/ui/*.webp, 92×94, тъмна плочка с cyan/хром) като <img> —
 *  еднакви навсякъде, без inline SVG. Декоративни: alt="" + aria-hidden. Размерът се задава от CSS (.ic-img). */
const icon = (name) => `<img class="ic-img ic-${name}" src="/icons/ui/${name}.webp" alt="" aria-hidden="true" width="92" height="94" loading="lazy" decoding="async">`;
export const ICON = Object.fromEntries(["arrow","check","phone","mail","pin","clock","star","menu","bolt","search","globe","shield","layers","euro"].map((n) => [n, icon(n)]));

