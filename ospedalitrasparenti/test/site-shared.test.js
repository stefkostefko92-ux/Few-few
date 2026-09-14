// Тестове за споделените JSON-LD помощници на генератора (src/lib/site-shared.js):
// articleLd / pagLd / briciole / collezioneLd + rangeAnni / setDataSnapshot.
// Чисти изходни функции — детерминистично, без мрежа и без данни. Покрива и
// двата клона: празен siteUrl (релативен → null графи) и зададен siteUrl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setSiteUrl } from '../src/lib/site-ui.js';
import {
  rangeAnni,
  setDataSnapshot,
  articleLd,
  pagLd,
  briciole,
  collezioneLd,
} from '../src/lib/site-shared.js';

// ---------- rangeAnni ----------
test('rangeAnni — празно/единично/диапазон', () => {
  assert.equal(rangeAnni([]), '');
  assert.equal(rangeAnni(null), '');
  assert.equal(rangeAnni(undefined), '');
  assert.equal(rangeAnni([2024]), '2024');
  assert.equal(rangeAnni([2023, 2024, 2025]), '2023–2025');
  // взима само първия и последния, не join на всички
  assert.equal(rangeAnni([2019, 2020, 2021, 2022]), '2019–2022');
});

// ---------- празен siteUrl → всички графи връщат null (само релативни адреси) ----------
test('LD помощници — без siteUrl връщат null', () => {
  setSiteUrl('');
  assert.equal(articleLd('T', 'D', 'x.html'), null);
  assert.equal(briciole([['Home', '/']]), null);
  assert.equal(pagLd('T', 'D', 'x.html', 'X'), null);
  assert.equal(collezioneLd('N', 'x.html', 'D', 'A'), null);
});

// ---------- articleLd ----------
test('articleLd — структура, дата от snapshot и абсолютни адреси', () => {
  setSiteUrl('https://esempio.it');
  setDataSnapshot('2026-07-15');
  const a = articleLd('Titolo', 'Descrizione', 'inchiesta.html');
  assert.ok(a);
  assert.equal(a['@type'], 'Article');
  assert.equal(a.headline, 'Titolo');
  assert.equal(a.description, 'Descrizione');
  assert.equal(a.inLanguage, 'it');
  assert.equal(a.datePublished, '2026-07-15');
  assert.equal(a.dateModified, '2026-07-15');
  assert.equal(a.mainEntityOfPage, 'https://esempio.it/inchiesta.html');
  assert.deepEqual(a.author, { '@type': 'Organization', name: 'Carbon Stealth VCC', url: 'https://carbonstealth.eu' });
  assert.deepEqual(a.publisher, { '@id': 'https://esempio.it/#org' });
  assert.ok(Array.isArray(a.isBasedOn) && a.isBasedOn.length === 3);
});

// ---------- briciole ----------
test('briciole — позиции 1..n и „/“ сочи корена', () => {
  setSiteUrl('https://esempio.it');
  const b = briciole([['Home', '/'], ['Approfondimenti', 'approfondimenti.html'], ['Sdo', 'sdo.html']]);
  assert.ok(b);
  assert.equal(b['@type'], 'BreadcrumbList');
  const el = /** @type {any[]} */ (b.itemListElement);
  assert.equal(el.length, 3);
  assert.equal(el[0].position, 1);
  assert.equal(el[0].item, 'https://esempio.it/'); // „/“ → корен без „/„/“
  assert.equal(el[1].position, 2);
  assert.equal(el[1].item, 'https://esempio.it/approfondimenti.html');
  assert.equal(el[2].name, 'Sdo');
});

// ---------- pagLd ----------
test('pagLd — граф Article + BreadcrumbList', () => {
  setSiteUrl('https://esempio.it');
  setDataSnapshot('2026-07-15');
  const g = pagLd('Titolo', 'Descr', 'sdo.html', 'Sdo');
  assert.ok(g);
  const graph = /** @type {any[]} */ (g['@graph']);
  assert.equal(graph.length, 2);
  assert.equal(graph[0]['@type'], 'Article');
  assert.equal(graph[1]['@type'], 'BreadcrumbList');
  // трошката минава Home → Approfondimenti → страницата
  const bc = graph[1].itemListElement;
  assert.equal(bc.length, 3);
  assert.equal(bc[2].name, 'Sdo');
  assert.equal(bc[2].item, 'https://esempio.it/sdo.html');
});

// ---------- collezioneLd ----------
test('collezioneLd — CollectionPage без елементи', () => {
  setSiteUrl('https://esempio.it');
  const g = collezioneLd('Strutture', 'strutture.html', 'Elenco', 'Sanità pubblica');
  assert.ok(g);
  const graph = /** @type {any[]} */ (g['@graph']);
  assert.equal(graph.length, 2);
  const coll = graph[1];
  assert.equal(coll['@type'], 'CollectionPage');
  assert.equal(coll.name, 'Strutture');
  assert.equal(coll.url, 'https://esempio.it/strutture.html');
  assert.deepEqual(coll.isPartOf, { '@id': 'https://esempio.it/#website' });
  assert.deepEqual(coll.about, { '@type': 'Thing', name: 'Sanità pubblica' });
  assert.equal(coll.mainEntity, undefined); // без елементи → без ItemList
});

test('collezioneLd — с елементи добавя ItemList (относителни и абсолютни url)', () => {
  setSiteUrl('https://esempio.it');
  const g = collezioneLd('Fornitori', 'fornitori.html', 'D', 'Appalti', [
    { nome: 'Alfa', url: 'fornitore/alfa.html' },
    { nome: 'Beta', url: 'https://esterno.example/beta' },
  ]);
  assert.ok(g);
  const coll = /** @type {any[]} */ (g['@graph'])[1];
  assert.equal(coll.mainEntity['@type'], 'ItemList');
  assert.equal(coll.mainEntity.numberOfItems, 2);
  const items = coll.mainEntity.itemListElement;
  assert.equal(items[0].position, 1);
  assert.equal(items[0].url, 'https://esempio.it/fornitore/alfa.html'); // релативен → префикс
  assert.equal(items[1].url, 'https://esterno.example/beta'); // абсолютен → непокътнат
});
