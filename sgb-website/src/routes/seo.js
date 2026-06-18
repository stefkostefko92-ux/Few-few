import express from 'express';
import { Articles, Categories, Newspapers, Pages } from '../queries.js';
import { config } from '../config.js';
import { abs } from '../lib/seo.js';
import { isoDate } from '../lib/helpers.js';
import { getAllSettings } from '../db.js';

const router = express.Router();
const esc = (s) => String(s || '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

// ─── robots.txt ──────────────────────────────────────────
router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
`# robots.txt — ${config.siteUrl}
User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin/
Disallow: /tarsene

# AI / Answer engines
User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-Web
Allow: /
User-agent: Amazonbot
Allow: /
User-agent: Applebot-Extended
Allow: /

Sitemap: ${abs('/sitemap.xml')}
Host: ${config.siteUrl.replace(/^https?:\/\//, '')}
`);
});

// ─── sitemap.xml ─────────────────────────────────────────
router.get('/sitemap.xml', (req, res) => {
  const urls = [];
  const add = (loc, { lastmod, changefreq = 'weekly', priority = '0.6', image } = {}) =>
    urls.push({ loc: abs(loc), lastmod, changefreq, priority, image });

  add('/', { changefreq: 'daily', priority: '1.0' });
  add('/novini', { changefreq: 'daily', priority: '0.9' });
  add('/vestnik', { changefreq: 'weekly', priority: '0.9' });
  add('/kontakti', { changefreq: 'yearly', priority: '0.4' });

  for (const c of Categories.all()) {
    add(`/category/${c.slug}`, { changefreq: 'weekly', priority: '0.7' });
  }
  for (const a of Articles.allPublished()) {
    add(`/statia/${a.slug}`, {
      lastmod: isoDate(a.updated_at || a.published_at),
      changefreq: 'monthly', priority: '0.8',
      image: a.cover_image ? abs(a.cover_image) : null,
    });
  }
  for (const n of Newspapers.allPublished()) {
    add(`/vestnik/${n.slug}`, {
      lastmod: isoDate(n.updated_at || n.published_at),
      changefreq: 'yearly', priority: '0.6',
      image: n.cover_image ? abs(n.cover_image) : null,
    });
  }
  for (const p of Pages.all()) {
    add(`/stranica/${p.slug}`, { lastmod: isoDate(p.updated_at), changefreq: 'yearly', priority: '0.3' });
  }

  const body =
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map((u) => `  <url>
    <loc>${esc(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${u.image ? `\n    <image:image><image:loc>${esc(u.image)}</image:loc></image:image>` : ''}
  </url>`).join('\n')}
</urlset>`;
  res.type('application/xml').send(body);
});

// ─── RSS емисия ──────────────────────────────────────────
router.get('/rss.xml', (req, res) => {
  const settings = getAllSettings();
  const items = Articles.allPublished().slice(0, 30);
  const name = settings.org_name || 'Съюз на глухите в България';
  const body =
`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${esc(name)} — Новини</title>
  <link>${config.siteUrl}</link>
  <description>${esc(settings.site_description || 'Новини от Съюза на глухите в България')}</description>
  <language>bg-BG</language>
  <atom:link href="${abs('/rss.xml')}" rel="self" type="application/rss+xml" />
${items.map((a) => `  <item>
    <title>${esc(a.title)}</title>
    <link>${abs('/statia/' + a.slug)}</link>
    <guid isPermaLink="true">${abs('/statia/' + a.slug)}</guid>
    <pubDate>${new Date(isoDate(a.published_at || a.created_at)).toUTCString()}</pubDate>
    <description>${esc(a.excerpt || '')}</description>
  </item>`).join('\n')}
</channel>
</rss>`;
  res.type('application/rss+xml').send(body);
});

// ─── llms.txt (за AI/AEO/GEO откриваемост) ───────────────
router.get('/llms.txt', (req, res) => {
  const settings = getAllSettings();
  const name = settings.org_name || 'Съюз на глухите в България';
  const articles = Articles.allPublished().slice(0, 25);
  const body =
`# ${name} (СГБ)

> ${settings.site_description || 'Официален уебсайт на Съюза на глухите в България — национална организация на хората с увреден слух.'}

Основна информация:
- Организация: ${name}
- Уебсайт: ${config.siteUrl}
- Имейл: ${settings.contact_email || ''}
- Телефон: ${settings.contact_phone || ''}
- Адрес: ${settings.contact_address || ''}, ${settings.contact_city || 'София'}
- Вестник: „${settings.newspaper_name || 'Тишина'}“

## Раздели
- [Новини и съобщения](${abs('/novini')})
- [Вестник „${settings.newspaper_name || 'Тишина'}“](${abs('/vestnik')})
- [Контакти](${abs('/kontakti')})

## Категории
${Categories.roots().map((c) => `- [${c.name}](${abs('/category/' + c.slug)})`).join('\n')}

## Последни публикации
${articles.map((a) => `- [${a.title}](${abs('/statia/' + a.slug)})`).join('\n')}
`;
  res.type('text/plain; charset=utf-8').send(body);
});

export default router;
