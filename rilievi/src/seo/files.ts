import { COMPANY, CONTENT_UPDATED, PRIVACY_UPDATED } from '../company.js';
import { LOCALE_LABEL, LOCALES, translate } from '../i18n.js';
import { INVITE_DAYS } from '../services/invites.js';
import { sheetCounts, sheetLegend } from '../site/landing.js';
import { PUBLIC_PAGES, publicPath, type PublicPage } from './paths.js';

/**
 * robots.txt, sitemap.xml и llms.txt — чисти функции от публичния адрес, без сървъра (тестват се сами).
 */

/**
 * Обхождат се само публичните страници. Входът и „забравена парола“ са разрешени, за да види
 * търсачката техния `noindex` (забранена страница пак може да излезе като гол адрес); всичко останало
 * е частно. `$` значи „точно този адрес“ — `/accesso?next=…` вече не е разрешен.
 */
export function robotsTxt(base: string, indexNowKey: string): string {
  const exact = PUBLIC_PAGES.flatMap((page) => LOCALES.map((l) => publicPath(l, page)));
  return [
    'User-agent: *',
    ...exact.map((path) => `Allow: ${path}$`),
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

const PAGE_META: Record<PublicPage, { priority: string; freq: string; updated: string }> = {
  home: { priority: '1.0', freq: 'monthly', updated: CONTENT_UPDATED },
  privacy: { priority: '0.3', freq: 'yearly', updated: PRIVACY_UPDATED },
};

/** Всяка публична страница на трите езика, с алтернативите си (x-default е италианската — коренът). */
export function sitemapXml(base: string): string {
  const urls = PUBLIC_PAGES.flatMap((page) =>
    LOCALES.map((locale) => {
      const links = [
        ...LOCALES.map(
          (alt) =>
            `    <xhtml:link rel="alternate" hreflang="${alt}" href="${base}${publicPath(alt, page)}"/>`,
        ),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${base}${publicPath('it', page)}"/>`,
      ].join('\n');
      const meta = PAGE_META[page];
      return `  <url>\n    <loc>${base}${publicPath(locale, page)}</loc>\n    <lastmod>${meta.updated}</lastmod>\n    <changefreq>${meta.freq}</changefreq>\n    <priority>${meta.priority}</priority>\n${links}\n  </url>`;
    }),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
}

/** llms.txt — кратко описание за AI търсачките, само с факти, които казва и самата страница. */
export function llmsTxt(base: string, contactEmail: string): string {
  const en = (key: string, params: Record<string, string | number> = {}) =>
    translate('en', key, params);
  const counts = sheetCounts();
  const sections = sheetLegend((key) => en(key))
    .map((section) => section.title)
    .join(', ');
  const roles = ['ADMIN', 'DIREZIONE', 'RESPONSABILE', 'TECNICO', 'OPERATORE', 'CLIENTE']
    .map((role) => en(`role.${role}`))
    .join(', ');
  return [
    '# Rilievi Impianti by Carbon Stealth',
    '',
    `> Rilievi Impianti is a web portal where lift (elevator) companies fill in the survey sheet of an existing lift (in Italian "scheda di rilievo impianto"), find it again and print it. ${en('site.hero.note')}`,
    '',
    '## Pages',
    ...LOCALES.map(
      (l) =>
        `- [Rilievi Impianti (${LOCALE_LABEL[l]})](${base}${publicPath(l, 'home')}): ${en('site.nav.scheda').toLowerCase()}, ${en('site.nav.come').toLowerCase()}, ${en('site.nav.faq').toLowerCase()}, ${en('site.nav.request').toLowerCase()}`,
    ),
    `- [${en('privacy.title')}](${base}${publicPath('en', 'privacy')}) ([IT](${base}${publicPath('it', 'privacy')}), [BG](${base}${publicPath('bg', 'privacy')}))`,
    '',
    '## Facts',
    `- The sheet: ${counts.fields} fields in ${counts.sections} sections, in the order of the paper sheet: ${sections}.`,
    `- ${en('site.features.search.text')}`,
    `- ${en('site.features.print.text')}`,
    `- ${en('site.features.orders.text')}`,
    `- ${en('site.features.misure.text')}`,
    `- ${en('site.roles.lead')} Roles: ${roles}. ${en('site.roles.note')}`,
    `- Access: ${en('site.faq.selfSignup.a')} ${en('site.steps.s3.text', { days: INVITE_DAYS })}`,
    `- ${en('site.faq.data.a')}`,
    `- ${en('site.faq.languages.a')}`,
    '',
    '## Company',
    `- [${COMPANY.name}](${COMPANY.url}) (in Bulgarian: ${COMPANY.nameBg}), ${en('company.legalForm')}, company number (EIK) ${COMPANY.eik}, VAT number ${COMPANY.vat}; ${en('company.street')}, ${COMPANY.postalCode} ${en('company.city')}, ${en('company.country')}; phone ${COMPANY.phone}; ${contactEmail}`,
    '',
  ].join('\n');
}
