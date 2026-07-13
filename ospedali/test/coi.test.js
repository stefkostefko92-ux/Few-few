// Тестове за индикаторите „конфликт на интереси" (двойки болница↔доставчик).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizzaCoppie, SOGLIE_COI } from '../src/coi.js';

const dir = (codice, cf, importo, extra = {}) => ({
  codice,
  fornitoreCf: cf,
  fornitore: `Форн ${cf}`,
  importo,
  categoria: 'diretto',
  ...extra,
});
const gara = (codice, cf, importo) => dir(codice, cf, importo, { categoria: 'competitiva' });

test('coi — rotazione: ≥5 преки към същия доставчик, ≥100k', () => {
  const c = Array.from({ length: 5 }, () => dir('010101', '11111111111', 25_000));
  const out = analizzaCoppie(c);
  assert.equal(out.length, 1);
  assert.ok(out[0].flags.includes('rotazione'));
});

test('coi — под праговете не сигнализира', () => {
  // 4 преки (< 5) и малка стойност
  assert.equal(analizzaCoppie(Array.from({ length: 4 }, () => dir('010101', '11111111111', 25_000))).length, 0);
  // 5 преки, но < 100k общо
  assert.equal(analizzaCoppie(Array.from({ length: 5 }, () => dir('010101', '11111111111', 10_000))).length, 0);
});

test('coi — dipendenza: материален доставчик, ≥85% от една болница, без търг', () => {
  const c = [
    ...Array.from({ length: 4 }, () => dir('010101', '22222222222', 150_000)), // 600k от една
    gara('020202', '22222222222', 50_000), // малко другаде
  ];
  const out = analizzaCoppie(c);
  const p = out.find((x) => x.codice === '010101');
  assert.ok(p && p.flags.includes('dipendenza'));
  assert.ok(p.quotaFornitore > SOGLIE_COI.dipendenzaQuota);
});

test('coi — конкурентни договори НЕ вдигат rotazione/esclusiva', () => {
  const out = analizzaCoppie(Array.from({ length: 12 }, () => gara('010101', '33333333333', 100_000)));
  assert.equal(out.length, 0);
});

test('coi — esclusiva: ≥10 договора, ≥90% без търг', () => {
  const c = [...Array.from({ length: 10 }, () => dir('010101', '44444444444', 5_000)), gara('010101', '44444444444', 5_000)];
  const out = analizzaCoppie(c);
  assert.equal(out.length, 1);
  assert.ok(out[0].flags.includes('esclusiva'));
});

test('coi — физически лица (без fornitoreCf) са изключени', () => {
  const c = Array.from({ length: 10 }, () => ({ codice: '010101', fornitoreCf: null, fornitore: 'Operatore individuale (persona fisica)', importo: 50_000, categoria: 'diretto' }));
  assert.equal(analizzaCoppie(c).length, 0);
});

test('coi — тежест: два флага → alta', () => {
  // rotazione + esclusiva едновременно
  const c = Array.from({ length: 10 }, () => dir('010101', '55555555555', 25_000));
  const out = analizzaCoppie(c);
  assert.equal(out[0].gravita, 'alta');
});
