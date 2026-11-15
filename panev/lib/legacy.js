'use strict';
// ─────────────────────────────────────────────────────────────
//  Стари адреси → новия сайт (2026), с траен 301.
//
//  Преди 2026 сайтът беше на Wix и търсачките още държат неговите адреси:
//  `/product-page/<код>`, `/en/lavora-con-noi`, `/chi-siamo`. Без 301 те дават
//  404 и натрупаното им доверие се губи. Проверено на живо 2026-10-24: от
//  четирите стари адреса в индекса три връщаха 404.
//
//  Wix пази ИТАЛИАНСКИЯ адрес и за другите езици (`/en/lavora-con-noi`),
//  затова страниците се съпоставят по смисъл, а езикът идва от префикса.
//  Истинска нова страница никога не се пренасочва (целта = самата тя → null).
// ─────────────────────────────────────────────────────────────

// Изрични съответствия (запазени от предишната карта в server.js).
const LEGACY_REDIRECTS = new Map([
  ['/servizi', '/'], ['/chi-siamo', '/'], ['/brevetto', '/'],
  ['/faq', '/contatti'], ['/carrello', '/prodotti'], ['/success', '/prodotti'],
  ['/cookie', '/privacy'], ['/termini', '/condizioni'], ['/en', '/en/'],
]);

const LANG = {
  it: { home: '/', products: '/prodotti', contacts: '/contatti', privacy: '/privacy', terms: '/condizioni' },
  en: { home: '/en/', products: '/en/products', contacts: '/en/contacts', privacy: '/en/privacy', terms: '/en/terms' },
  bg: { home: '/bg/', products: '/bg/produkti', contacts: '/bg/kontakti', privacy: '/bg/poveritelnost', terms: '/bg/usloviya' },
};

// Страниците на стария сайт по смисъл (без езиковия префикс) → вид страница в LANG.
const OLD_PAGES = new Map([
  ['servizi', 'home'], ['chi-siamo', 'home'], ['brevetto', 'home'], ['home', 'home'],
  ['faq', 'contacts'], ['lavora-con-noi', 'contacts'], ['contatti', 'contacts'], ['contact', 'contacts'],
  ['carrello', 'products'], ['cart-page', 'products'], ['shop', 'products'], ['negozio', 'products'],
  ['success', 'products'], ['thank-you-page', 'products'],
  ['cookie', 'privacy'], ['privacy-policy', 'privacy'],
  ['termini', 'terms'],
]);

/**
 * Серията на стар продукт по кода в адреса: `a-37-170-2-sx` → `37-170`.
 * A-кодът носи ширина и дължина; B-кодът само ширина — той стига, само ако
 * при тази ширина има една-единствена серия. Иначе null (страницата без котва).
 */
function seriesFor(slug, series) {
  const s = String(slug).toLowerCase();
  const a = s.match(/(?:^|-)a-(\d{2})-(\d{3})(?=-|$)/);
  if (a) {
    if (series.includes(`${a[1]}-${a[2]}`)) return `${a[1]}-${a[2]}`;
    if (series.includes(a[1])) return a[1];
  }
  const w = s.match(/(?:^|-)[ab]-(\d{2})-\d{3}(?=-|$)/);
  if (w) {
    const hit = series.filter((x) => x === w[1] || x.startsWith(`${w[1]}-`));
    if (hit.length === 1) return hit[0];
  }
  return null;
}

/** Целта на стар адрес или null (непознат адрес / истинска нова страница). */
function legacyTarget(pathname, series = []) {
  const key = String(pathname).toLowerCase().replace(/\/+$/, '').replace(/\.html$/, '') || '/';
  if (LEGACY_REDIRECTS.has(key)) return LEGACY_REDIRECTS.get(key);
  const m = key.match(/^(?:\/(en|bg))?\/([a-z0-9/-]+)$/);
  if (!m) return null;
  const lang = LANG[m[1] || 'it'];
  const rest = m[2];
  const prod = rest.match(/^(?:product-page|prodotto|product)\/([a-z0-9-]+)$/);
  if (prod) {
    const s = seriesFor(prod[1], series);
    return lang.products + (s ? `#serie-${s}` : '');
  }
  if (/^(?:category|categoria)\/[a-z0-9-]+$/.test(rest)) return lang.products;
  const kind = OLD_PAGES.get(rest);
  if (!kind) return null;
  const target = lang[kind];
  return target.replace(/\/+$/, '') === key ? null : target;
}

module.exports = { legacyTarget, seriesFor, LEGACY_REDIRECTS };
