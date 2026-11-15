'use strict';
// Старите адреси на Wix трябва да водят към новия сайт с 301, а истинските нови страници — никога.
// Случаите са адресите, които търсачките още държат (проверено на живо 2026-10-24).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { legacyTarget, seriesFor } = require('../lib/legacy');

const SERIES = ['65', '45-170', '45-175', '37-150', '37-170'];

test('стар продукт → страницата с продукти, на котвата на серията си', () => {
  assert.equal(legacyTarget('/product-page/a-37-170-2-sx', SERIES), '/prodotti#serie-37-170');
  assert.equal(legacyTarget('/product-page/staffa-completa-a-37-170-2-sx-b-37-320-sx', SERIES), '/prodotti#serie-37-170');
  assert.equal(legacyTarget('/product-page/a-65-170-7', SERIES), '/prodotti#serie-65');
  assert.equal(legacyTarget('/en/product-page/a-45-175-2', SERIES), '/en/products#serie-45-175');
});

test('двусмислен B-код (две серии с тази ширина) → страницата без котва, не гадаем', () => {
  assert.equal(seriesFor('b-37-320-sx', SERIES), null);
  assert.equal(legacyTarget('/product-page/b-37-320-sx', SERIES), '/prodotti');
  assert.equal(legacyTarget('/product-page/b-65-320', SERIES), '/prodotti#serie-65', 'една серия при ширина 65');
});

test('страница на Wix под /en/ с италиански адрес → английската страница по смисъл', () => {
  assert.equal(legacyTarget('/en/lavora-con-noi'), '/en/contacts');
  assert.equal(legacyTarget('/en/chi-siamo/'), '/en/');
  assert.equal(legacyTarget('/lavora-con-noi'), '/contatti');
  assert.equal(legacyTarget('/bg/lavora-con-noi'), '/bg/kontakti');
  assert.equal(legacyTarget('/category/staffe'), '/prodotti');
});

test('предишната карта се пази', () => {
  assert.equal(legacyTarget('/servizi'), '/');
  assert.equal(legacyTarget('/termini.html'), '/condizioni');
  assert.equal(legacyTarget('/en'), '/en/');
});

test('истинска нова страница или непознат адрес → null (никакво пренасочване)', () => {
  for (const p of ['/', '/contatti', '/prodotti', '/en/contacts', '/en/products', '/bg/kontakti', '/privacy', '/catalogo', '/няма-такава', '/img/logo.svg'])
    assert.equal(legacyTarget(p, SERIES), null, p);
});

test('всяка цел е реална страница на сайта (иначе 301 води в 404)', () => {
  const root = path.join(__dirname, '..');
  const exists = (u) => {
    const p = u.split('#')[0];
    if (p.endsWith('/')) return fs.existsSync(path.join(root, p, 'index.html'));
    return fs.existsSync(path.join(root, `${p}.html`));
  };
  const samples = ['/product-page/a-37-170-2-sx', '/en/product-page/x', '/bg/product-page/x', '/en/lavora-con-noi', '/bg/faq',
    '/en/cookie', '/bg/cookie', '/en/termini', '/bg/termini', '/en/chi-siamo', '/bg/chi-siamo', '/cookie', '/termini'];
  for (const s of samples) {
    const t = legacyTarget(s, SERIES);
    assert.ok(t && exists(t), `${s} → ${t} трябва да съществува`);
  }
});

test('серийните котви, които ползваме, съществуват в генерираната страница', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'prodotti.html'), 'utf8');
  for (const s of SERIES) assert.match(html, new RegExp(`id="serie-${s}"`), s);
});
