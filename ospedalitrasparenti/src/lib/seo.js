// @ts-check
// SEO политика на сайта — ЕДИНСТВЕН източник за: кои профили на изпълнители се
// индексират, ключовите думи, sitemap (индекс + секции) и реалния lastmod.
// Чисти функции (без fs) → тестват се в test/seo.test.js; файловата част е в
// src/seo-site.js (финален проход върху site/ след build-site).
//
// Защо (GSC, 2026-10): ~4900 от ~5300 адреса бяха профили на изпълнители, много от
// тях с 1–3 договора → шаблонни, почти празни страници. Google ги обхожда и не ги
// индексира („Crawled – currently not indexed"), а делът тънко съдържание сваля
// оценката на целия сайт. Тънките профили остават достъпни за хората, но са
// noindex и извън sitemap.

import { createHash } from 'node:crypto';

/**
 * Праг за индексиране на профил на изпълнител. Цели числа (не сума) → едно и също
 * решение и при билда (точни данни), и при прохода върху готов HTML (KPI картите).
 * ≥10 договора и ≥3 възложители = таблици с реално различно съдържание.
 */
export const SOGLIA_FORNITORE = Object.freeze({ contratti: 10, aziende: 3 });

/**
 * @param {{ n: number, nAziende: number }} p брой договори и брой възложители
 * @returns {boolean}
 */
export function fornitoreIndicizzabile({ n, nAziende }) {
  return Number.isFinite(n) && Number.isFinite(nAziende) && n >= SOGLIA_FORNITORE.contratti && nAziende >= SOGLIA_FORNITORE.aziende;
}

export const BRAND_KEYWORD = 'Carbon Stealth';
/** Базов набор (≥5, винаги с „Carbon Stealth") — за страниците без собствен. */
export const KEYWORDS_BASE = Object.freeze([
  'ospedali pubblici',
  'bilanci sanità',
  'appalti sanità',
  'trasparenza SSN',
  'dati aperti',
  BRAND_KEYWORD,
]);

/**
 * Ключови думи на страница: специфичните първо, после базовите до ≥5, „Carbon
 * Stealth" винаги присъства. Без дубликати (без значение на регистъра).
 * @param {Array<string|null|undefined|false>} [specifiche]
 * @returns {string[]}
 */
export function keywordsPagina(specifiche = []) {
  /** @type {string[]} */
  const out = [];
  const visti = new Set();
  /** @param {string|null|undefined|false} k */
  const add = (k) => {
    const v = (k || '').replace(/\s+/g, ' ').trim();
    if (!v || visti.has(v.toLowerCase())) return;
    visti.add(v.toLowerCase());
    out.push(v);
  };
  for (const k of specifiche) add(k);
  for (const k of KEYWORDS_BASE) if (out.length < 5) add(k);
  add(BRAND_KEYWORD);
  return out;
}

/**
 * Специфичните ключови думи според вида страница (по пътя) и името от заглавието.
 * @param {string} rel път спрямо site/ (напр. `struttura/010201-x.html`)
 * @param {string} nome името на субекта (първата част на <title>)
 * @returns {string[]}
 */
export function keywordsPerPercorso(rel, nome) {
  if (rel.startsWith('struttura/')) return keywordsPagina([nome, `bilancio ${nome}`, `appalti ${nome}`, 'azienda sanitaria']);
  if (rel.startsWith('fornitore/')) return keywordsPagina([nome, `appalti ${nome}`, 'fornitori SSN', 'contratti pubblici ANAC']);
  if (rel.startsWith('regione/')) return keywordsPagina([`sanità ${nome}`, `ospedali ${nome}`, `appalti sanità ${nome}`]);
  return keywordsPagina([nome]);
}

/**
 * Уникално описание на профил на изпълнител (числата правят всяко различно —
 * шаблонното „Contratti pubblici di X…" беше еднакво на 4880 страници).
 * Стойностите идват вече форматирани (euroCompact/numeroIt/percentualeIt).
 * @param {{ den: string, n: string, nAziende: string, valore: string, quotaSenzaGara: string }} p
 * @returns {string}
 */
export function descrizioneFornitore({ den, n, nAziende, valore, quotaSenzaGara }) {
  const contr = n === '1' ? '1 contratto pubblico' : `${n} contratti pubblici`;
  const az = nAziende === '1' ? '1 azienda sanitaria' : `${nAziende} aziende sanitarie`;
  return `${den}: ${contr} 2023–2025 con ${az} del SSN, valore messo a gara ${valore}, quota senza gara ${quotaSenzaGara}. Dati ANAC verificabili per CIG.`;
}

/**
 * Стойността на KPI карта по етикет (изхода на kpi() от site-ui.js).
 * @param {string} html
 * @param {string} label
 * @returns {string|null}
 */
export function leggiKpi(html, label) {
  const lab = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = html.match(new RegExp(`<div class="n[^"]*">([^<]*)(?:<span[^>]*>[^<]*</span>)?</div><div class="l">${lab}</div>`));
  return m ? m[1].trim() : null;
}

/** „1.234" (numeroIt) → 1234; невалидно → NaN. @param {string|null} s @returns {number} */
export function numeroDaIt(s) {
  if (s == null || !/^[\d.]+$/.test(s.trim())) return NaN;
  return Number(s.trim().replace(/\./g, ''));
}

/**
 * Каноничният абсолютен адрес на файл от site/ (index.html → корена `/`).
 * @param {string} su siteUrl без завършваща /
 * @param {string} rel
 * @returns {string}
 */
export function urlDaPercorso(su, rel) {
  if (rel === 'index.html') return `${su}/`;
  return `${su}/${rel}`;
}

/**
 * Метаданните на страница, нужни за решението „в sitemap ли е".
 * @param {string} html
 * @returns {{ noindex: boolean, canonical: string|null, title: string|null }}
 */
export function analizzaPagina(html) {
  const head = (html.match(/<head[\s\S]*?<\/head>/i) || [''])[0];
  const robots = head.match(/<meta name="robots" content="([^"]*)"/i);
  const can = head.match(/<link rel="canonical" href="([^"]*)"/i);
  const tit = head.match(/<title>([^<]*)<\/title>/i);
  return {
    noindex: !!(robots && /noindex/i.test(robots[1])),
    canonical: can ? can[1] : null,
    title: tit ? tit[1] : null,
  };
}

/**
 * Отпечатък на СЪДЪРЖАНИЕТО (само <main>) — head/CSS/навигация не местят lastmod,
 * иначе всяка промяна в шаблона „подновява" хиляди адреса и lastmod губи доверие.
 * @param {string} html
 * @returns {string}
 */
export function impronta(html) {
  const main = (html.match(/<main[\s\S]*?<\/main>/i) || [html])[0];
  return createHash('sha256').update(main).digest('hex').slice(0, 16);
}

/**
 * Реален lastmod: пази датата, докато съдържанието не се смени. Нов адрес без
 * запис → `primaData` (датата на снапшота на данните, от които е генериран).
 * @param {{ h: string, d: string }|undefined} voce предишният запис от манифеста
 * @param {string} h текущият отпечатък
 * @param {string} oggi YYYY-MM-DD
 * @param {string} primaData YYYY-MM-DD — за адреси, които манифестът още не познава
 * @returns {{ h: string, d: string }}
 */
export function aggiornaLastmod(voce, h, oggi, primaData) {
  if (!voce) return { h, d: primaData || oggi };
  if (voce.h === h) return voce;
  return { h, d: oggi };
}

/**
 * Секция на sitemap-а по пътя (един файл на вид съдържание → GSC показва
 * индексирането по секции, а не 5000 адреса на куп).
 * @param {string} rel
 * @returns {'strutture'|'fornitori'|'pagine'}
 */
export function sezioneSitemap(rel) {
  if (rel.startsWith('struttura/')) return 'strutture';
  if (rel.startsWith('fornitore/')) return 'fornitori';
  return 'pagine';
}

/** @param {string} s @returns {string} */
const xmlEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * @param {Array<{ loc: string, lastmod: string }>} voci
 * @returns {string}
 */
export function xmlUrlset(voci) {
  const righe = voci.map((v) => `<url><loc>${xmlEsc(v.loc)}</loc><lastmod>${v.lastmod}</lastmod></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${righe}\n</urlset>\n`;
}

/**
 * @param {Array<{ loc: string, lastmod: string }>} sitemaps
 * @returns {string}
 */
export function xmlIndice(sitemaps) {
  const righe = sitemaps.map((v) => `<sitemap><loc>${xmlEsc(v.loc)}</loc><lastmod>${v.lastmod}</lastmod></sitemap>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${righe}\n</sitemapindex>\n`;
}

/**
 * Слага/маха `<meta name="robots" content="noindex">` (идемпотентно).
 * @param {string} html
 * @param {boolean} noindex
 * @returns {string}
 */
export function impostaNoindex(html, noindex) {
  const ha = /<meta name="robots" content="[^"]*">\n?/i;
  if (!noindex) return html.replace(ha, '');
  if (ha.test(html)) return html.replace(/<meta name="robots" content="[^"]*">/i, '<meta name="robots" content="noindex">');
  return html.replace(/(<meta name="description"[^>]*>\n?)/i, '$1<meta name="robots" content="noindex">\n');
}

/**
 * Слага ключовите думи, ако ги няма (идемпотентно; съществуващите не се пипат).
 * @param {string} html
 * @param {string[]} kw
 * @returns {string}
 */
export function impostaKeywords(html, kw) {
  if (/<meta name="keywords"/i.test(html)) return html;
  const attr = kw.join(', ').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return html.replace(/(<meta name="description"[^>]*>\n?)/i, `$1<meta name="keywords" content="${attr}">\n`);
}

/**
 * Сменя заглавието навсякъде в head (<title>, og:title, twitter:title).
 * @param {string} html
 * @param {string} vecchio вече екраниран (както е в HTML-а)
 * @param {string} nuovo вече екраниран
 * @returns {string}
 */
export function sostituisciTitolo(html, vecchio, nuovo) {
  return html
    .replace(`<title>${vecchio}</title>`, `<title>${nuovo}</title>`)
    .replace(`<meta property="og:title" content="${vecchio}">`, `<meta property="og:title" content="${nuovo}">`)
    .replace(`<meta name="twitter:title" content="${vecchio}">`, `<meta name="twitter:title" content="${nuovo}">`);
}

/**
 * Сменя описанието навсякъде в head (description, og, twitter).
 * @param {string} html
 * @param {string} nuovo НЕекранирано
 * @returns {string}
 */
export function sostituisciDescrizione(html, nuovo) {
  const e = nuovo.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return html
    .replace(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${e}">`)
    .replace(/<meta property="og:description" content="[^"]*">/i, `<meta property="og:description" content="${e}">`)
    .replace(/<meta name="twitter:description" content="[^"]*">/i, `<meta name="twitter:description" content="${e}">`);
}

/**
 * Еднакви <title> на различни страници (напр. стар и нов код на една и съща ULSS
 * след реформата във Венето, или една фирма под два CF) → Google ги третира като
 * дубликати. Добавя различителя преди наставката „ — Ospedali Trasparenti".
 * @param {string} titolo
 * @param {string} etichetta напр. `cod. 050120` или `P.IVA 01234567890`
 * @returns {string}
 */
export function disambiguaTitolo(titolo, etichetta) {
  const suff = ' — Ospedali Trasparenti';
  if (titolo.includes(`(${etichetta})`)) return titolo;
  if (titolo.endsWith(suff)) return `${titolo.slice(0, -suff.length)} (${etichetta})${suff}`;
  return `${titolo} (${etichetta})`;
}
