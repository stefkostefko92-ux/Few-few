#!/usr/bin/env node
// Генератор на статичния сайт: site/ (източник) → корена на panev/ (изход).
// Нула зависимости. Пускане: node site/build.mjs  (или npm run build:site)

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import it from './data/i18n/it.mjs';
import en from './data/i18n/en.mjs';
import bg from './data/i18n/bg.mjs';
import { page, pagePath, ORIGIN } from './templates/layout.mjs';
import { homePage, homeLd } from './templates/home.mjs';
import { productsPage, productsLd } from './templates/products.mjs';
import {
  catalogPage, catalogLd, contactsPage, contactsLd, privacyPage, termsPage,
} from './templates/pages.mjs';
import { viewerPage } from './templates/viewer.mjs';
import { familyPage, familyLd, FAMILY_KEYS } from './templates/families.mjs';
import { CATALOG_PDF } from './data/products.mjs';
import { logoPicture } from './templates/asset.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const locales = [it, en, bg];

// Допълнителните стилове — само на страниците, които ги ползват, с версия от съдържанието, за да
// не остане стар файл в кеша: vista-3d.css (3D рендерите и 3D изгледа), listino.css (таблиците в
// продуктовите карти на тесни места), regola.css (планката, която се регулира в заглавния блок).
const versioned = (file) => `/${file}?v=${createHash('sha256').update(readFileSync(join(ROOT, file))).digest('hex').slice(0, 10)}`;
const VISTA_CSS = versioned('css/vista-3d.css');
const LISTINO_CSS = versioned('css/listino.css');
const REGOLA_CSS = versioned('css/regola.css');
const SITE_CSS = versioned('css/site.css');
const STYLES = `<link rel="stylesheet" href="${SITE_CSS}">`;

const PAGES = [
  { key: 'home',     body: (t) => homePage(t, locales), ld: (t) => homeLd(t), css: [VISTA_CSS, REGOLA_CSS] },
  { key: 'products', body: (t) => productsPage(t, locales), ld: (t) => productsLd(t), css: [VISTA_CSS, LISTINO_CSS] },
  { key: 'catalog',  body: (t) => catalogPage(t, locales),  ld: (t) => catalogLd(t) },
  { key: 'contacts', body: (t) => contactsPage(t, locales), ld: (t) => contactsLd(t) },
  { key: 'privacy',  body: (t) => privacyPage(t) },
  { key: 'terms',    body: (t) => termsPage(t) },
  // Страниците по семейства: под листата в пътеката (parents).
  ...FAMILY_KEYS.map((key) => ({ key, body: (t) => familyPage(t, key), ld: (t) => familyLd(t, key), css: [VISTA_CSS, LISTINO_CSS, REGOLA_CSS], parents: ['products'] })),
];

let written = 0;
for (const t of locales) {
  for (const def of PAGES) {
    const html = page(t, locales, def.key, def.key, def.body(t), {
      ldExtra: def.ld ? def.ld(t) : [],
      parents: def.parents ?? [],
      styles: [STYLES, ...(def.css ?? []).map((href) => `<link rel="stylesheet" href="${href}">`)].join('\n  '),
    });
    const outPath = join(ROOT, t.base.replace(/^\//, ''), t.slugs[def.key]);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html);
    written++;
  }
  // 3D страницата: собствен документ (визьорът), не layout-а на сайта — виж templates/viewer.mjs.
  // Рамката на началната страница е същият визьор в отделен документ (noindex, извън sitemap).
  writeFileSync(join(ROOT, t.base.replace(/^\//, ''), t.slugs.viewer3d), viewerPage(t, locales));
  writeFileSync(join(ROOT, t.base.replace(/^\//, ''), t.slugs.viewer3dEmbed), viewerPage(t, locales, { embed: true }));
  written += 2;
}

// ── 404 — една обща страница за трите езика ──────────────────
const notFound = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>404 — Pagina non trovata | Panev Ascensori</title>
  <meta name="robots" content="noindex">
  <meta name="keywords" content="Panev Ascensori, staffe per ascensori, lift brackets, планки за асансьори, pagina non trovata, Carbon Stealth">
  <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
  <link rel="icon" type="image/png" sizes="192x192" href="/img/icon-192.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/img/apple-touch-icon.png">
  <link rel="stylesheet" href="${SITE_CSS}">
</head>
<body>
<main id="main">
  <section class="page-head nf-page"><div class="wrap">
    <a class="nf-logo" href="/">${logoPicture('Panev Ascensori', { width: 180 })}</a>
    <p class="kicker kicker-light">404</p>
    <h1><span lang="it">Pagina non trovata</span><span lang="en">Page not found</span><span lang="bg">Страницата не е намерена</span></h1>
    <p class="sec-lead">L’indirizzo non esiste o è cambiato con il nuovo sito.</p>
    <div class="hero-cta">
      <a class="btn btn-white" href="/">Home · Italiano</a>
      <a class="btn btn-outline" href="/en/" lang="en">English</a>
      <a class="btn btn-outline" href="/bg/" lang="bg">Български</a>
    </div>
    <p class="nf-credit">Created and Designed by <a href="https://carbonstealth.eu" target="_blank" rel="noopener">Carbon Stealth VCC</a></p>
  </div></section>
</main>
</body>
</html>
`;
writeFileSync(join(ROOT, '404.html'), notFound);

// ── sitemap.xml с hreflang алтернативи ───────────────────────
// lastmod е денят, в който страницата наистина се е сменила: хешът на HTML-а (без реда с версиите на
// стиловете, които се менят с всеки CSS) се пази в site/data/lastmod.json; нов хеш → днешна дата.
// Иначе всеки билд маркира всичко като ново и търсачките спират да вярват на lastmod.
const today = new Date().toISOString().slice(0, 10);
const LASTMOD = join(ROOT, 'site', 'data', 'lastmod.json');
const seen = existsSync(LASTMOD) ? JSON.parse(readFileSync(LASTMOD, 'utf8')) : {};
const stamps = {};
function lastmod(url, file) {
  const content = readFileSync(join(ROOT, file)).toString().replace(/\?v=[0-9a-f]{10}/g, '');
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
  stamps[url] = seen[url]?.hash === hash ? seen[url] : { hash, date: today };
  return stamps[url].date;
}
const prioOf = (key) => key === 'home' ? '1.0'
  : ['products', 'catalog', ...FAMILY_KEYS].includes(key) ? '0.9'
  : ['contacts', 'viewer3d'].includes(key) ? '0.8' : '0.3';
const urls = [...PAGES, { key: 'viewer3d' }].map((def) => locales.map((t) => {
  const loc = `${ORIGIN}${pagePath(t, def.key)}`;
  const alts = locales.map((lt) =>
    `    <xhtml:link rel="alternate" hreflang="${lt.htmlLang}" href="${ORIGIN}${pagePath(lt, def.key)}"/>`
  ).join('\n');
  const xdef = `    <xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}${pagePath(it, def.key)}"/>`;
  return `  <url>
    <loc>${loc}</loc>
${alts}
${xdef}
    <lastmod>${lastmod(loc, join(t.base.replace(/^\//, ''), t.slugs[def.key]))}</lastmod>
    <priority>${prioOf(def.key)}</priority>
  </url>`;
}).join('\n')).join('\n');
// Каталогът PDF (адресът е раздаден като реклама: точно този, без ?v=).
const pdfUrl = `${ORIGIN}${CATALOG_PDF}`;
const pdfEntry = `  <url>
    <loc>${pdfUrl}</loc>
    <lastmod>${lastmod(pdfUrl, CATALOG_PDF.replace(/^\//, ''))}</lastmod>
    <priority>0.7</priority>
  </url>`;
writeFileSync(LASTMOD, `${JSON.stringify(stamps, null, 1)}\n`);

writeFileSync(join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
${pdfEntry}
</urlset>
`);

console.log(`[build-site] ${written} страници + sitemap.xml → OK`);
