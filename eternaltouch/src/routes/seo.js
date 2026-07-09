// Eternal Touch — SEO routes
// Bulgaria-first sitemap with hreflang, robots with all known crawlers, humans.txt, security.txt
import express from 'express';

const router = express.Router();

const SITE_URL = process.env.SITE_URL || 'https://eternaltouch.it';

// =================================================================
// robots.txt — explicitly welcomes search engines + AI assistants
// =================================================================
router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`# Eternal Touch — robots.txt
# Ателие за гипсови декорации в Бобов дол, България
# Atelier of hand-cast gypsum decorations in Bobov Dol, Bulgaria

# Search engines
User-agent: Googlebot
Allow: /
Crawl-delay: 1

User-agent: Bingbot
Allow: /
Crawl-delay: 1

User-agent: DuckDuckBot
Allow: /

User-agent: YandexBot
Allow: /

# AI assistants & generative engines (AEO/GEO)
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Perplexity-User
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: CCBot
Allow: /

User-agent: FacebookBot
Allow: /

User-agent: Amazonbot
Allow: /

User-agent: Bytespider
Allow: /

# Default policy
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /admin
Disallow: /api/
Disallow: /uploads/temp/
Disallow: /healthz
Disallow: /lang/

# Crawl-delay for unidentified bots
Crawl-delay: 2

Sitemap: ${SITE_URL}/sitemap.xml
Host: ${SITE_URL}
`);
});

// =================================================================
// sitemap.xml — Bulgaria-first, all routes, with hreflang for each
// =================================================================
router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const collections = await req.prisma.collection.findMany({
      where: { isActive: true },
      include: {
        products: { where: { isActive: true } }
      }
    }).catch(() => []);

    const urls = [];
    // Bulgaria-first language order
    const langs = ['bg', 'it', 'en'];

    // Helper to add a URL with language alternates.
    // BG is the default (no prefix); IT and EN use /it and /en prefixes.
    // Root ('/') is emitted WITHOUT a trailing slash so the sitemap byte-matches
    // the on-page canonical/hreflang (which use SITE_URL for the homepage). Keep
    // this in sync with src/views/layouts/main.ejs and src/middleware/language.js.
    const langHref = (lang, loc) => {
      const cleanLoc = loc.startsWith('/') ? loc : '/' + loc;
      const suffix = cleanLoc === '/' ? '' : cleanLoc;
      if (lang === 'bg') return `${SITE_URL}${suffix}`;
      return `${SITE_URL}/${lang}${suffix}`;
    };

    const addUrl = (loc, lastmod, priority = '0.8', changefreq = 'monthly') => {
      const canonical = `${SITE_URL}${loc === '/' ? '' : loc}`;
      const alternates = langs.map(l =>
        `<xhtml:link rel="alternate" hreflang="${l}" href="${langHref(l, loc)}"/>`
      ).join('\n    ');
      urls.push(`<url>
    <loc>${canonical}</loc>
    <lastmod>${new Date(lastmod).toISOString()}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
    ${alternates}
    <xhtml:link rel="alternate" hreflang="x-default" href="${canonical}"/>
  </url>`);
    };

    // Home — highest priority
    addUrl('/', new Date(), '1.0', 'weekly');

    // Collection + product pages
    for (const col of collections) {
      addUrl(`/collections/${col.slug}`, col.updatedAt || new Date(), '0.9', 'weekly');
      for (const p of col.products) {
        addUrl(`/collections/${col.slug}/${p.slug}`, p.updatedAt || new Date(), '0.7', 'monthly');
      }
    }

    // Legal pages
    const legalLastmod = new Date('2026-05-01');
    addUrl('/privacy', legalLastmod, '0.4', 'yearly');
    addUrl('/terms',   legalLastmod, '0.4', 'yearly');
    addUrl('/cookies', legalLastmod, '0.4', 'yearly');
    addUrl('/legal',   legalLastmod, '0.4', 'yearly');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  ${urls.join('\n  ')}
</urlset>`;

    res.type('application/xml').send(xml);
  } catch (err) {
    next(err);
  }
});

// =================================================================
// humans.txt — Bulgaria-first credit
// =================================================================
router.get('/humans.txt', (req, res) => {
  res.type('text/plain; charset=utf-8').send(`/* TEAM */
Atelier:    Eternal Touch
Founders:   Simona · Ivy · Maya
Location:   Бобов дол, България (primary) · Milano, Italia
Languages:  Български, Italiano, English

/* SITE */
Last update: ${new Date().toISOString().split('T')[0]}
Built by:    Carbon Stealth VCC
Site URL:    ${SITE_URL}
Country:     Bulgaria · BG208725180

/* THANKS */
Thanks to every customer who chose something handmade.
Благодарим на всеки, който избра нещо ръчно изработено.
`);
});

// =================================================================
// .well-known/security.txt
// =================================================================
router.get('/.well-known/security.txt', (req, res) => {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  res.type('text/plain').send(`Contact: mailto:info@eternaltouch.it
Expires: ${expires.toISOString()}
Preferred-Languages: bg, it, en
Canonical: ${SITE_URL}/.well-known/security.txt
`);
});

// =================================================================
// /llms.txt — Anthropic/OpenAI proposed standard for AI-friendly sitemaps
// =================================================================
router.get('/llms.txt', async (req, res, next) => {
  try {
    const collections = await req.prisma.collection.findMany({
      where: { isActive: true },
      include: { products: { where: { isActive: true } } }
    }).catch(() => []);

    let body = `# Eternal Touch

> Ателие за ръчно изработени гипсови декорации в Бобов дол, България.
> Atelier of hand-cast gypsum decorations in Bobov Dol, Bulgaria.

Three women — Simona, Ivy and Maya — make decorations, event favors and bespoke pieces by hand. Founded as a project of Carbon Stealth VCC (BG208725180). The atelier is in Bobov Dol, Bulgaria; part of distribution also goes through Milan, Italy.

## Pages

- [Home](${SITE_URL}/): Atelier overview
- [Privacy](${SITE_URL}/privacy): GDPR-compliant privacy notice
- [Terms](${SITE_URL}/terms): Terms and conditions
- [Cookies](${SITE_URL}/cookies): Cookie policy
- [Legal](${SITE_URL}/legal): Legal notice / imprint

## Collections
`;
    for (const col of collections) {
      body += `\n- [${col.nameBg || col.nameEn}](${SITE_URL}/collections/${col.slug})`;
      for (const p of col.products) {
        body += `\n  - [${p.nameBg || p.nameEn}](${SITE_URL}/collections/${col.slug}/${p.slug})`;
      }
    }

    body += `\n\n## Contact\n\n- Email: info@eternaltouch.it\n- Phone (BG): +359 87 787 6709 — Simona\n- Phone (IT): +39 393 694 3854 — Ivy\n- Phone (IT): +39 392 180 6719 — Maya\n- Address: ул. Самуил 3, 2670 Бобов дол, България\n`;

    res.type('text/markdown; charset=utf-8').send(body);
  } catch (err) { next(err); }
});

export default router;
