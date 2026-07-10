// Prerender „light" след vite build: за всеки маршрут от data/seo.json записва
// dist/<път>/index.html с уникален <head> (title/description/KEYWORDS/canonical/
// hreflang/OG/Twitter/robots/geo/JSON-LD) + per-route <noscript> AEO съдържание.
// Така не-JS ботовете (GPTBot, ClaudeBot, Bing, социални скрейпъри) виждат
// пълния SEO инвентар — както на стария сайт, но генерирано от данните.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));

const seo = read('seo.json');
const site = read('site.json');
const blog = read('blog.json');
const geo = read('geo.json');
const content = {
  it: read('content.it.json'),
  en: read('content.en.json'),
  bg: read('content.bg.json'),
};

const template = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
if (!template.includes('<!-- CS:SEO')) {
  throw new Error('index.html няма CS:SEO маркери — prerender е невъзможен');
}

const escAttr = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escText = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const pathnameOf = (url) => new URL(url).pathname;

// --- keywords: същата логика като src/lib/seo.ts buildKeywords ---
const KW_BASE = {
  it: ['Carbon Stealth VCC', 'agenzia digitale', 'sviluppo siti web', 'e-commerce', 'software ERP', 'app mobile', 'SEO', 'AEO', 'hosting cloud', 'Bulgaria', 'Italia'],
  en: ['Carbon Stealth VCC', 'digital agency', 'web development', 'e-commerce', 'ERP software', 'mobile apps', 'SEO', 'AEO', 'cloud hosting', 'Bulgaria', 'Europe'],
  bg: ['Carbon Stealth VCC', 'дигитална агенция', 'изработка на сайт', 'онлайн магазин', 'ERP софтуер', 'мобилни приложения', 'SEO', 'AEO', 'облачен хостинг', 'България', 'Бобов дол'],
};
function buildKeywords(lang, title, description, extra = []) {
  const derived = `${title} ${description}`
    .replace(/[|—–\-·,.:;()€]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4 && !/^\d+$/.test(w))
    .slice(0, 8);
  const seen = new Set();
  const out = [];
  for (const k of [...(KW_BASE[lang] ?? KW_BASE.it), ...extra, ...derived]) {
    const key = k.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(k); }
  }
  return out.slice(0, 20).join(', ');
}

// --- намиране на съдържателния обект за noscript/JSON-LD по URL ---
function findDoc(url, lang) {
  const c = content[lang];
  for (const key of Object.keys(c.pages)) {
    if (c.pages[key].url === url) return { kind: 'page', doc: c.pages[key] };
  }
  for (const slug of Object.keys(blog.posts)) {
    const p = blog.posts[slug][lang];
    if (p?.url === url) return { kind: 'blog', doc: p };
  }
  for (const slug of Object.keys(geo.cities)) {
    const g = geo.cities[slug][lang];
    if (g?.url === url) return { kind: 'geo', doc: g };
  }
  return null;
}

/** Текстов noscript от структурираните блокове, когато няма готов noscriptHtml. */
function noscriptFromBlocks(h1, description, blocks = []) {
  const parts = [`<h1>${escText(h1)}</h1>`, `<p>${escText(description)}</p>`];
  for (const b of blocks.slice(0, 60)) {
    if (b.tag === 'h2' || b.tag === 'h3') parts.push(`<${b.tag}>${escText(b.text ?? '')}</${b.tag}>`);
    else if (b.tag === 'ul' && b.items) parts.push(`<ul>${b.items.map((i) => `<li>${escText(i)}</li>`).join('')}</ul>`);
    else if (b.tag === 'li') parts.push(`<ul><li>${escText(b.text ?? '')}</li></ul>`);
    else if (b.text) parts.push(`<p>${escText(b.text)}</p>`);
  }
  return parts.join('\n');
}

const ORG_REF = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': 'https://carbonstealth.eu/#organization',
  name: site.name,
  url: site.url,
  logo: site.logo?.url ?? 'https://carbonstealth.eu/logo.png',
  sameAs: site.sameAs,
};

function headFor(p) {
  const lines = [];
  const kw = buildKeywords(p.lang, p.title, p.description, p.geoPlacename ? [p.geoPlacename] : []);
  lines.push(`<title>${escText(p.title)}</title>`);
  lines.push(`<meta name="description" content="${escAttr(p.description)}" />`);
  lines.push(`<meta name="keywords" content="${escAttr(kw)}" />`);
  lines.push(`<meta name="robots" content="${escAttr(p.robots ?? 'index, follow, max-image-preview:large, max-snippet:-1')}" />`);
  lines.push(`<meta name="geo.region" content="${escAttr(p.geoRegion ?? 'BG-14')}" />`);
  lines.push(`<meta name="geo.placename" content="${escAttr(p.geoPlacename ?? 'Bobov Dol')}" />`);
  lines.push(`<link rel="canonical" href="${escAttr(p.canonical)}" />`);
  for (const [hl, href] of Object.entries(p.hreflang ?? {})) {
    lines.push(`<link rel="alternate" hreflang="${escAttr(hl)}" href="${escAttr(href)}" />`);
  }
  const og = { 'og:type': 'website', 'og:site_name': 'Carbon Stealth VCC', 'og:title': p.title, 'og:description': p.description, 'og:url': p.canonical, 'og:image': 'https://carbonstealth.eu/og-image.png', 'og:image:width': '1200', 'og:image:height': '630', ...(p.og ?? {}) };
  for (const [k, v] of Object.entries(og)) {
    for (const item of Array.isArray(v) ? v : [v]) {
      const key = Array.isArray(v) && k === 'og:locale:alternate' ? 'og:locale:alternate' : k;
      lines.push(`<meta property="${escAttr(key)}" content="${escAttr(item)}" />`);
    }
  }
  const tw = { 'twitter:card': 'summary_large_image', 'twitter:title': p.title, 'twitter:description': p.description, 'twitter:image': og['og:image'], ...(p.twitter ?? {}) };
  for (const [k, v] of Object.entries(tw)) {
    lines.push(`<meta name="${escAttr(k)}" content="${escAttr(v)}" />`);
  }
  return lines.map((l) => '    ' + l).join('\n');
}

function jsonLdFor(p, found) {
  const blocks = [];
  const isHome = ['https://carbonstealth.eu/', 'https://carbonstealth.eu/en/', 'https://carbonstealth.eu/bg/'].includes(p.url);
  if (isHome) {
    if (site.jsonLdGraph) blocks.push(site.jsonLdGraph);
    if (site.webPageJsonLd) blocks.push(site.webPageJsonLd);
    if (site.portfolioJsonLd) blocks.push(site.portfolioJsonLd);
  } else {
    if (found?.doc?.jsonLd) blocks.push(found.doc.jsonLd);
    blocks.push(ORG_REF); // entity disambiguation на всяка страница
  }
  return blocks
    .map((b) => `    <script type="application/ld+json">${JSON.stringify(b)}</script>`)
    .join('\n');
}

let written = 0;
for (const key of Object.keys(seo.pages)) {
  const p = seo.pages[key];
  if (!p?.url) continue;
  const pathname = pathnameOf(p.url);
  if (pathname.includes('/test/')) continue; // вътрешна страница — не се публикува

  const found = findDoc(p.url, p.lang);
  const head = headFor(p) + '\n' + jsonLdFor(p, found);

  let html = template.replace(
    /<!-- CS:SEO[\s\S]*?<!-- \/CS:SEO -->/,
    `<!-- CS:SEO -->\n${head}\n    <!-- /CS:SEO -->`,
  );
  html = html.replace(/<html lang="[a-z]+">/, `<html lang="${p.lang}">`);

  // per-route noscript (AEO fallback за не-JS ботове)
  const doc = found?.doc;
  const inner = doc?.noscriptHtml
    ? doc.noscriptHtml
    : noscriptFromBlocks(
        doc?.h1 ?? p.title,
        doc?.metaDescription ?? p.description,
        doc?.visibleBlocks ?? doc?.sections ?? doc?.content ?? [],
      );
  html = html.replace(
    /<noscript>[\s\S]*?<\/noscript>/,
    `<noscript>\n<div style="max-width:800px;margin:40px auto;padding:24px;font-family:monospace;color:#ccc;background:#000">\n${inner}\n<p>Carbon Stealth VCC — info@carbonstealth.eu · Bobov Dol, Bulgaria · EIK BG208725180</p>\n</div>\n</noscript>`,
  );

  const outDir = pathname === '/' ? DIST : path.join(DIST, pathname);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  written++;
}

console.log(`prerender: ${written} маршрута → dist/`);
