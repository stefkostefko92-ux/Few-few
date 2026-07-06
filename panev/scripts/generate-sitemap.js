// ============================================================
//  PANEV ASCENSORI — Sitemap generator
//  Generates sitemap.xml from current DB products + static pages
//
//  Run:  node scripts/generate-sitemap.js
//  Output: ./sitemap.xml
// ============================================================

'use strict';

const fs   = require('fs');
const path = require('path');
const db   = require('../lib/db');

const BASE_URL = process.env.BASE_URL?.replace(/\/$/, '') || 'https://www.panevascensori.it';
const TODAY = new Date().toISOString().slice(0, 10);

// ── Static pages ──────────────────────────────────────────────
// Use CLEAN URLs (the server 301-redirects .html → clean), match the published
// sitemap.xml so regenerating never re-introduces redirecting URLs or drops pages.
const STATIC = [
  { loc: '/',              priority: '1.0',  changefreq: 'weekly',  image: 'img/og-home.jpg', en: '/en' },
  { loc: '/brevetto',      priority: '0.95', changefreq: 'monthly', image: 'img/og-brevetto.jpg' },
  { loc: '/prodotti',      priority: '0.90', changefreq: 'weekly',  image: 'img/og-prodotti.jpg' },
  { loc: '/catalogo',      priority: '0.85', changefreq: 'monthly', image: 'img/sistema-overview.png' },
  { loc: '/servizi',       priority: '0.80', changefreq: 'monthly', image: 'img/og-servizi.jpg' },
  { loc: '/contatti',      priority: '0.75', changefreq: 'monthly', image: 'img/og-contatti.jpg' },
  { loc: '/chi-siamo',     priority: '0.65', changefreq: 'monthly', image: 'img/og-chi-siamo.jpg' },
  { loc: '/faq',           priority: '0.60', changefreq: 'monthly' },
  { loc: '/en',            priority: '0.50', changefreq: 'monthly' },
  { loc: '/privacy',       priority: '0.20', changefreq: 'yearly' },
  { loc: '/cookie',        priority: '0.20', changefreq: 'yearly' },
  { loc: '/termini',       priority: '0.20', changefreq: 'yearly' },
];

// ── Helpers ───────────────────────────────────────────────────
function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlEntry(loc, priority, changefreq, extras = '', enHref = '') {
  const url = loc.startsWith('http') ? loc : BASE_URL + loc;
  const displayLoc = loc === '/' ? BASE_URL + '/' : url;
  const enLink = enHref ? `    <xhtml:link rel="alternate" hreflang="en"        href="${esc(BASE_URL + enHref)}"/>\n` : '';
  return `  <url>
    <loc>${esc(displayLoc)}</loc>
    <xhtml:link rel="alternate" hreflang="it"        href="${esc(displayLoc)}"/>
    <xhtml:link rel="alternate" hreflang="it-IT"     href="${esc(displayLoc)}"/>
${enLink}    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(displayLoc)}"/>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
${extras}  </url>`;
}

function imageBlock(img, title, caption, geo = 'Vittuone, Milano, Italia') {
  const loc = img.startsWith('http') ? img : BASE_URL + '/' + img.replace(/^\//, '');
  return `    <image:image>
      <image:loc>${esc(loc)}</image:loc>
      <image:title>${esc(title)}</image:title>
      <image:caption>${esc(caption)}</image:caption>
      <image:geo_location>${esc(geo)}</image:geo_location>
    </image:image>
`;
}

// ── Build sitemap ─────────────────────────────────────────────
let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">

`;

// Static pages
for (const p of STATIC) {
  let img = '';
  if (p.image) {
    const titleMap = {
      '/':              'Panev Ascensori SAS — Staffe Brevettate',
      '/brevetto.html': 'Brevetto UIBM N. 202023000002112',
      '/prodotti.html': 'Catalogo Staffe Ascensori — 27 Codici',
      '/catalogo.html': 'Catalogo Tecnico Staffe Panev Ascensori',
      '/servizi.html':  'Servizi Ascensori — Installazione e Manutenzione',
      '/contatti.html': 'Contatti Panev Ascensori',
      '/chi-siamo.html':'Chi Siamo — Panev Ascensori SAS',
    };
    img = imageBlock(p.image, titleMap[p.loc] || 'Panev Ascensori',
      'Panev Ascensori SAS — Produttore staffe brevettate per ascensori e montacarichi, Made in Italy dal 2013');
  }
  xml += urlEntry(p.loc, p.priority, p.changefreq, img, p.en) + '\n\n';
}

// Per-product URLs (27 products)
const products = db.listProducts(true);
console.log(`[sitemap] Generating ${products.length} product URLs…`);

for (const p of products) {
  const loc = `/prodotti/${encodeURIComponent(p.id)}.html`;
  const priority = p.patented ? '0.85' : '0.75';
  let img = '';
  if (p.image) {
    const title = `${p.name} — COD. ${p.codice || p.id}`;
    const caption = `${p.descrizione || p.name}. ${p.materiale || ''}${p.spessore ? ', sp. ' + p.spessore : ''}${p.larghezza ? ', ' + p.larghezza : ''}${p.lunghezza ? '×' + p.lunghezza : ''}. ${p.patented ? 'Brevetto N. 202023000002112.' : ''}`;
    img = imageBlock(p.image, title, caption);
  }
  xml += urlEntry(loc, priority, 'monthly', img) + '\n';
}

xml += '\n</urlset>\n';

// ── Write file ────────────────────────────────────────────────
const outPath = path.join(__dirname, '..', 'sitemap.xml');
fs.writeFileSync(outPath, xml);
console.log(`[sitemap] ✓ Written ${outPath}`);
console.log(`[sitemap]   Static pages: ${STATIC.length}`);
console.log(`[sitemap]   Product pages: ${products.length}`);
console.log(`[sitemap]   Total URLs:    ${STATIC.length + products.length}`);
