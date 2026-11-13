import { Router } from 'express';
import { BRAND } from '../brand.js';
import { COMPANY, CONTENT_UPDATED } from '../company.js';
import { config } from '../config.js';
import { translator } from '../i18n.js';
import { pageUrl, SITE_PAGES } from '../seo/pages.js';
import { LEGAL_DOCUMENTS, LEGAL_DOCUMENT_IDS } from '../legal/documents.js';

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** sitemap.xml с hreflang двойки (bg, en, x-default) за всяка страница. */
export function sitemapXml(base: string): string {
  const urls: string[] = [];
  for (const page of SITE_PAGES) {
    for (const locale of ['bg', 'en'] as const) {
      const links = (['bg', 'en'] as const)
        .map(
          (alt) =>
            `<xhtml:link rel="alternate" hreflang="${alt}" href="${xmlEscape(pageUrl(base, page.id, alt))}"/>`,
        )
        .concat(
          `<xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(pageUrl(base, page.id, 'bg'))}"/>`,
        )
        .join('');
      urls.push(
        `<url><loc>${xmlEscape(pageUrl(base, page.id, locale))}</loc><lastmod>${CONTENT_UPDATED}</lastmod>` +
          `<changefreq>${page.changefreq}</changefreq><priority>${page.priority.toFixed(1)}</priority>${links}</url>`,
      );
    }
  }
  // Правните документи — lastmod е датата на версията им.
  for (const id of LEGAL_DOCUMENT_IDS) {
    const doc = LEGAL_DOCUMENTS[id];
    for (const locale of ['bg', 'en'] as const) {
      const links = (['bg', 'en'] as const)
        .map(
          (alt) =>
            `<xhtml:link rel="alternate" hreflang="${alt}" href="${xmlEscape(base + doc.paths[alt])}"/>`,
        )
        .concat(
          `<xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(base + doc.paths.bg)}"/>`,
        )
        .join('');
      urls.push(
        `<url><loc>${xmlEscape(base + doc.paths[locale])}</loc><lastmod>${doc.version}</lastmod>` +
          `<changefreq>yearly</changefreq><priority>0.3</priority>${links}</url>`,
      );
    }
  }
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">' +
    urls.join('') +
    '</urlset>\n'
  );
}

export function robotsTxt(base: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /app/',
    'Disallow: /admin/',
    'Disallow: /auth/',
    'Disallow: /webhooks/',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}

/** llms.txt — кратко описание за AI търсачките и връзки към ключовите страници (на двата езика). */
export function llmsTxt(base: string): string {
  const bg = translator('bg');
  const en = translator('en');
  const lines = [
    `# ${BRAND.name} (${BRAND.nameLatin})`,
    '',
    `> ${BRAND.tagline.bg}`,
    `> ${BRAND.tagline.en}`,
    '',
    `${BRAND.nameLatin} is made by ${COMPANY.name} (${COMPANY.nameBg}), EIK ${COMPANY.eik}, Bulgaria.`,
    '',
    '## Страници (BG)',
    ...SITE_PAGES.map(
      (page) =>
        `- [${bg(`site.${page.id}.meta.title`)}](${pageUrl(base, page.id, 'bg')}): ${bg(`site.${page.id}.meta.description`)}`,
    ),
    ...LEGAL_DOCUMENT_IDS.map(
      (id) =>
        `- [${bg(`legal.${id}.title`)}](${base}${LEGAL_DOCUMENTS[id].paths.bg}): ${bg(`legal.${id}.metaDescription`)}`,
    ),
    '',
    '## Pages (EN)',
    ...SITE_PAGES.map(
      (page) =>
        `- [${en(`site.${page.id}.meta.title`)}](${pageUrl(base, page.id, 'en')}): ${en(`site.${page.id}.meta.description`)}`,
    ),
    ...LEGAL_DOCUMENT_IDS.map(
      (id) =>
        `- [${en(`legal.${id}.title`)}](${base}${LEGAL_DOCUMENTS[id].paths.en}): ${en(`legal.${id}.metaDescription`)}`,
    ),
    '',
    '## App',
    `- [Install the app / Инсталирай приложението](${base}/prilozhenie): phone, tablet and computer (PWA).`,
    '',
  ];
  return lines.join('\n');
}

export function seoRouter(): Router {
  const router = Router();
  router.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(robotsTxt(config().PUBLIC_BASE_URL));
  });
  router.get('/sitemap.xml', (_req, res) => {
    res.type('application/xml').send(sitemapXml(config().PUBLIC_BASE_URL));
  });
  router.get('/llms.txt', (_req, res) => {
    res.type('text/plain; charset=utf-8').send(llmsTxt(config().PUBLIC_BASE_URL));
  });
  return router;
}
