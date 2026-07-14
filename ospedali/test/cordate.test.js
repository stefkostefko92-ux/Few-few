// Тест за анализа на „cordate" (cover bidding): двойки, които се явяват заедно,
// едната печели, другата никога.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizzaCordate } from '../src/cordate.js';

const A = '11111111111', B = '22222222222', C = '33333333333';
const PF = 'RSSMRA80A01H501U'; // физическо лице (16 знака) → не се брои

test('cordate: двойка A печели, B никога → cover bidding', () => {
  const gare = [];
  for (let i = 0; i < 6; i++) gare.push({ winners: new Set([A]), parts: [A, B], importo: 1000, auth: 'X' });
  const r = analizzaCordate(gare, { soglia: 5, minVittorie: 3 });
  assert.equal(r.length, 1);
  assert.equal(r[0].vincitoreCf, A);
  assert.equal(r[0].coprCf, B);
  assert.equal(r[0].insieme, 6);
  assert.equal(r[0].vinteDalVincitore, 6);
});

test('cordate: многолотова гара (и двете печелят) НЕ е cover bidding', () => {
  const gare = [];
  // 6 гари, но и двете печелят (различни лотове) → не се флагва
  for (let i = 0; i < 6; i++) gare.push({ winners: new Set([A, B]), parts: [A, B], importo: 1000 });
  const r = analizzaCordate(gare, { soglia: 5, minVittorie: 3 });
  assert.equal(r.length, 0);
});

test('cordate: под прага (по-малко от soglia заедно) не се флагва', () => {
  const gare = [];
  for (let i = 0; i < 3; i++) gare.push({ winners: new Set([A]), parts: [A, B] });
  assert.equal(analizzaCordate(gare, { soglia: 5 }).length, 0);
});

test('cordate: физически лица (16 знака) се изключват от двойките', () => {
  const gare = [];
  for (let i = 0; i < 6; i++) gare.push({ winners: new Set([A]), parts: [A, PF] });
  assert.equal(analizzaCordate(gare, { soglia: 5 }).length, 0);
});

test('cordate: победителят печели част, губещият никога → пак се флагва (асиметрия)', () => {
  const gare = [];
  for (let i = 0; i < 10; i++) gare.push({ winners: new Set([i < 4 ? A : C]), parts: [A, B], importo: 500 });
  // A печели 4, B никога (0), C печели 6 (не е в двойката); заедно 10
  const r = analizzaCordate(gare, { soglia: 5, minVittorie: 3 });
  assert.equal(r.length, 1);
  assert.equal(r[0].vincitoreCf, A);
  assert.equal(r[0].vinteDalVincitore, 4);
});
