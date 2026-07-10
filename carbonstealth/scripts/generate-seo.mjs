// Генерира public/sitemap*.xml + public/feed.xml от dataset-а (data/seo.json,
// data/blog.json). Пуска се преди vite build (npm run build). /test/ се изключва.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const PUB = path.join(ROOT, 'public');
const seo = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/seo.json'), 'utf8'));
const TODAY = new Date().toISOString().slice(0, 10);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Разпределя URL-ите по трите под-sitemap-а както на стария сайт. */
function bucket(url) {
  const p = new URL(url).pathname;
  if (p.includes('/test/')) return null; // вътрешна, не се публикува
  if (p.includes('/blog/')) return 'blog';
  if (p.includes('/geo/')) return 'geo';
  return 'pages';
}

const buckets = { pages: [], blog: [], geo: [] };
for (const key of Object.keys(seo.pages)) {
  const p = seo.pages[key];
  if (!p?.url) continue;
  const b = bucket(p.url);
  if (b) buckets[b].push(p);
}

function urlset(pages) {
  const items = pages
    .map((p) => {
      const alts = Object.entries(p.hreflang ?? {})
        .map(([hl, href]) => `    <xhtml:link rel="alternate" hreflang="${hl}" href="${esc(href)}"/>`)
        .join('\n');
      return `  <url>\n    <loc>${esc(p.url)}</loc>\n    <lastmod>${TODAY}</lastmod>\n${alts}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${items}\n</urlset>\n`;
}

for (const [name, pages] of Object.entries(buckets)) {
  fs.writeFileSync(path.join(PUB, `sitemap-${name}.xml`), urlset(pages));
}

const index = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://carbonstealth.eu/sitemap-pages.xml</loc><lastmod>${TODAY}</lastmod></sitemap>
  <sitemap><loc>https://carbonstealth.eu/sitemap-blog.xml</loc><lastmod>${TODAY}</lastmod></sitemap>
  <sitemap><loc>https://carbonstealth.eu/sitemap-geo.xml</loc><lastmod>${TODAY}</lastmod></sitemap>
</sitemapindex>
`;
fs.writeFileSync(path.join(PUB, 'sitemap.xml'), index);

// feed.xml — блог RSS от стария сайт (каналът за свежест остава жив)
const feedSrc = path.join(ROOT, 'data/assets/feed.xml');
if (fs.existsSync(feedSrc)) {
  fs.copyFileSync(feedSrc, path.join(PUB, 'feed.xml'));
}

console.log(
  `sitemap: pages=${buckets.pages.length} blog=${buckets.blog.length} geo=${buckets.geo.length} + index + feed.xml`,
);
