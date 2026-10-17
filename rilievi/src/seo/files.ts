import { COMPANY, CONTENT_UPDATED, PRIVACY_UPDATED } from '../company.js';
import { DEFAULT_LOCALE, translate } from '../i18n.js';
import { INVITE_DAYS } from '../services/invites.js';
import { FAQ_IDS, sheetCounts, sheetLegend } from '../site/landing.js';
import { HOME_PATH, PRIVACY_PATH, PUBLIC_PATHS, type PublicPath } from './paths.js';

/**
 * robots.txt, sitemap.xml и llms.txt — чисти функции от публичния адрес, без сървъра (тестват се сами).
 */

/**
 * Обхождат се само публичните страници. Входът и „забравена парола“ са разрешени, за да види
 * търсачката техния `noindex` (забранена страница пак може да излезе като гол адрес); всичко останало
 * е частно. `$` значи „точно този адрес“ — `/accesso?next=…` вече не е разрешен.
 */
export function robotsTxt(base: string, indexNowKey: string): string {
  return [
    'User-agent: *',
    ...PUBLIC_PATHS.map((path) => `Allow: ${path}$`),
    'Allow: /accesso$',
    'Allow: /password-dimenticata$',
    'Allow: /static/',
    'Allow: /favicon.ico',
    'Allow: /sitemap.xml',
    'Allow: /llms.txt',
    'Allow: /indexnow-key.txt',
    `Allow: /${indexNowKey}.txt`,
    'Disallow: /',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}

const PAGE_META: Record<PublicPath, { priority: string; freq: string; updated: string }> = {
  [HOME_PATH]: { priority: '1.0', freq: 'monthly', updated: CONTENT_UPDATED },
  [PRIVACY_PATH]: { priority: '0.3', freq: 'yearly', updated: PRIVACY_UPDATED },
};

/** Всяка публична страница — един адрес, без езикови варианти. */
export function sitemapXml(base: string): string {
  const urls = PUBLIC_PATHS.map((path) => {
    const meta = PAGE_META[path];
    return `  <url>\n    <loc>${base}${path}</loc>\n    <lastmod>${meta.updated}</lastmod>\n    <changefreq>${meta.freq}</changefreq>\n    <priority>${meta.priority}</priority>\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/** llms.txt — кратко описание за AI търсачките на езика на сайта, само с факти, които казва и страницата. */
export function llmsTxt(base: string, contactEmail: string): string {
  const it = (key: string, params: Record<string, string | number> = {}) =>
    translate(DEFAULT_LOCALE, key, params);
  const counts = sheetCounts();
  const sections = sheetLegend((key) => it(key))
    .map((section) => section.title)
    .join(', ');
  const roles = ['ADMIN', 'DIREZIONE', 'RESPONSABILE', 'TECNICO', 'OPERATORE', 'CLIENTE']
    .map((role) => it(`role.${role}`))
    .join(', ');
  return [
    '# Rilievi Impianti by Carbon Stealth',
    '',
    `> Rilievi Impianti è un portale web in cui le aziende di ascensori compilano la scheda di rilievo di un impianto esistente, la ritrovano e la stampano. ${it('site.hero.note')}`,
    '',
    '## Pagine',
    `- [Rilievi Impianti](${base}${HOME_PATH}): ${it('site.nav.scheda').toLowerCase()}, ${it('site.nav.come').toLowerCase()}, ${it('site.nav.faq').toLowerCase()}, ${it('site.nav.request').toLowerCase()}`,
    `- [${it('privacy.title')}](${base}${PRIVACY_PATH})`,
    '',
    '## Fatti',
    `- La scheda: ${counts.fields} campi in ${counts.sections} sezioni, nell'ordine della scheda di carta: ${sections}.`,
    `- ${it('site.features.search.text')}`,
    `- ${it('site.features.print.text')}`,
    `- ${it('site.features.orders.text')}`,
    `- ${it('site.features.misure.text')}`,
    `- ${it('site.roles.lead')} Ruoli: ${roles}. ${it('site.roles.note')}`,
    `- ${it('site.steps.s3.title')}. ${it('site.steps.s3.text', { days: INVITE_DAYS })}`,
    '',
    `## ${it('site.faq.title')}`,
    ...FAQ_IDS.map((id) => `- ${it(`site.faq.${id}.q`)} ${it(`site.faq.${id}.a`)}`),
    '',
    '## Azienda',
    `- [${COMPANY.name}](${COMPANY.url}), ${it('company.legalForm')}, ${it('company.eikLabel')} ${COMPANY.eik}, ${it('company.vatLabel')} ${COMPANY.vat}; ${it('company.street')}, ${COMPANY.postalCode} ${it('company.city')}, ${it('company.country')}; ${it('company.phoneLabel')} ${COMPANY.phone}; ${contactEmail}`,
    '',
  ].join('\n');
}
