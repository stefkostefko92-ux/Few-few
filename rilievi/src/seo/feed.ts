import { DEFAULT_LOCALE, LOCALE_TAG, translate } from '../i18n.js';
import { vociAttive } from '../novita/attive.js';
import { inizioGiorno, ULTIMO_AGGIORNAMENTO } from '../novita/voci.js';
import { FEED_NOVITA_PATH, NOVITA_PATH } from './paths.js';

/** Текст в XML: петте знака, които XML пази за себе си. */
function xml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Емисията на новините (RSS 2.0, `/novita.xml`) — една новина = един запис, най-новите първи, с котвата
 * си на страницата. Чиста функция от публичния адрес; текстовете — от същия речник като страницата.
 */
export function novitaRss(base: string): string {
  const it = (key: string) => translate(DEFAULT_LOCALE, key);
  const pagina = `${base}${NOVITA_PATH}`;
  const items = vociAttive().map((voce) =>
    [
      '    <item>',
      `      <title>${xml(`${it(`novita.voci.${voce.id}.area`)}: ${it(`novita.voci.${voce.id}.titolo`)}`)}</title>`,
      `      <link>${xml(`${pagina}#${voce.id}`)}</link>`,
      `      <guid isPermaLink="false">${xml(voce.id)}</guid>`,
      `      <pubDate>${inizioGiorno(voce.data).toUTCString()}</pubDate>`,
      `      <description>${xml(it(`novita.voci.${voce.id}.testo`))}</description>`,
      '    </item>',
    ].join('\n'),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${xml(it('novita.titolo'))}</title>`,
    `    <link>${xml(pagina)}</link>`,
    `    <description>${xml(it('novita.meta.description'))}</description>`,
    `    <language>${LOCALE_TAG[DEFAULT_LOCALE]}</language>`,
    `    <lastBuildDate>${inizioGiorno(ULTIMO_AGGIORNAMENTO).toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${xml(`${base}${FEED_NOVITA_PATH}`)}" rel="self" type="application/rss+xml"/>`,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
