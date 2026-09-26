#!/usr/bin/env node
// Генератор на статичния сайт: site/ (източник) → корена на panev/ (изход).
// Нула зависимости. Пускане: node site/build.mjs  (или npm run build:site)

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const locales = [it, en, bg];

// Допълнителните стилове — само на страниците, които ги ползват, с версия от съдържанието, за да
// не остане стар файл в кеша: vista-3d.css (3D рендерите и 3D изгледа), listino.css (таблиците в
// продуктовите карти на тесни места).
const versioned = (file) => `/${file}?v=${createHash('sha256').update(readFileSync(join(ROOT, file))).digest('hex').slice(0, 10)}`;
const VISTA_CSS = versioned('css/vista-3d.css');
const LISTINO_CSS = versioned('css/listino.css');
const STYLES = '<link rel="stylesheet" href="/css/site.css">';

const PAGES = [
  { key: 'home',     og: '/img/og-home.jpg',     body: (t) => homePage(t, locales), ld: (t) => homeLd(t), css: [VISTA_CSS] },
  { key: 'products', og: '/img/og-prodotti.jpg', body: (t) => productsPage(t, locales), ld: (t) => productsLd(t), css: [VISTA_CSS, LISTINO_CSS] },
  { key: 'catalog',  og: '/img/og-prodotti.jpg', body: (t) => catalogPage(t, locales),  ld: (t) => catalogLd(t) },
  { key: 'contacts', og: '/img/og-contatti.jpg', body: (t) => contactsPage(t, locales), ld: (t) => contactsLd(t) },
  { key: 'privacy',  og: '/img/og-home.jpg',     body: (t) => privacyPage(t) },
  { key: 'terms',    og: '/img/og-home.jpg',     body: (t) => termsPage(t) },
];

let written = 0;
for (const t of locales) {
  for (const def of PAGES) {
    const html = page(t, locales, def.key, def.key, def.body(t), {
      ogImage: def.og,
      ldExtra: def.ld ? def.ld(t) : [],
      styles: [STYLES, ...(def.css ?? []).map((href) => `<link rel="stylesheet" href="${href}">`)].join('\n  '),
    });
    const outPath = join(ROOT, t.base.replace(/^\//, ''), t.slugs[def.key]);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html);
    written++;
  }
  // 3D страницата: собствен документ (визьорът), не layout-а на сайта — виж templates/viewer.mjs.
  writeFileSync(join(ROOT, t.base.replace(/^\//, ''), t.slugs.viewer3d), viewerPage(t, locales));
  written++;
}

// ── 404 — една обща страница за трите езика ──────────────────
const notFound = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>404 — Pagina non trovata | Panev Ascensori</title>
  <meta name="robots" content="noindex">
  <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
  <link rel="icon" type="image/png" sizes="192x192" href="/img/icon-192.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/img/apple-touch-icon.png">
  <link rel="stylesheet" href="/css/site.css">
</head>
<body>
<main id="main">
  <section class="page-head"><div class="wrap">
    <p class="kicker kicker-light">404</p>
    <h1>Pagina non trovata · Page not found · Страницата не е намерена</h1>
    <p class="sec-lead">L’indirizzo non esiste o è cambiato con il nuovo sito.</p>
    <div class="hero-cta">
      <a class="btn btn-white" href="/">Home · Italiano</a>
      <a class="btn btn-outline" href="/en/">English</a>
      <a class="btn btn-outline" href="/bg/">Български</a>
    </div>
  </div></section>
</main>
</body>
</html>
`;
writeFileSync(join(ROOT, '404.html'), notFound);

// ── sitemap.xml с hreflang алтернативи ───────────────────────
const today = new Date().toISOString().slice(0, 10);
const urls = [...PAGES, { key: 'viewer3d' }].map((def) => locales.map((t) => {
  const loc = `${ORIGIN}${pagePath(t, def.key)}`;
  const alts = locales.map((lt) =>
    `    <xhtml:link rel="alternate" hreflang="${lt.htmlLang}" href="${ORIGIN}${pagePath(lt, def.key)}"/>`
  ).join('\n');
  const xdef = `    <xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}${pagePath(it, def.key)}"/>`;
  const prio = def.key === 'home' ? '1.0' : (def.key === 'products' || def.key === 'catalog') ? '0.9' : (def.key === 'contacts' || def.key === 'viewer3d') ? '0.8' : '0.3';
  return `  <url>
    <loc>${loc}</loc>
${alts}
${xdef}
    <lastmod>${today}</lastmod>
    <priority>${prio}</priority>
  </url>`;
}).join('\n')).join('\n');

writeFileSync(join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`);

console.log(`[build-site] ${written} страници + sitemap.xml → OK`);
