// Тестове за TED агрегацията (брой оференти на над-праговите EU-търгове).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggrega } from '../src/fetch-ted.js';

// Помощник: notice с подравнени code/val масиви.
const nt = (codes, vals, cpv, valore, data) => ({
  'publication-number': `${Math.random()}`,
  'received-submissions-type-code': codes,
  'received-submissions-type-val': vals,
  'classification-cpv': cpv,
  'result-value-notice': valore,
  'publication-date': data,
});

test('aggrega — брои лотове, un offerente, quota и разпределение', () => {
  const notices = [
    nt(['tenders'], ['1'], ['33100000'], '1000', '2023-05-01Z'), // 33, 1 лот с 1 оферта
    nt(['part-req', 'tenders'], ['9', '4'], ['85100000'], '2000', '2024-01-01Z'), // 85, 1 лот с 4 (part-req се игнорира)
    nt(['tenders', 'tenders'], ['1', '2'], ['33200000'], '500', '2023-12-01Z'), // 33, 2 лота (1 и 2)
    nt(['tenders', 't-sme'], ['3', '3'], ['85200000'], '800', '2024-03-01Z'), // 85, 1 лот с 3 (t-sme се игнорира)
    nt(['tenders'], ['0'], ['33300000'], '100', '2023-06-01Z'), // 0 оферти — изключва се изцяло
  ];
  const r = aggrega(notices);

  // Национално: лотове A(1)+B(4)+C(1,2)+D(3) = 5; un offerente = 2 (A и C-първи)
  assert.equal(r.nazionale.nLotti, 5);
  assert.equal(r.nazionale.unOfferente, 2);
  assert.equal(r.nazionale.quotaUnOfferente, 0.4);
  assert.deepEqual(r.nazionale.distribuzione, { 1: 2, 2: 1, 3: 1, '4+': 1 });
  // Валоре: сумата на notices с ≥1 валиден лот (E се изключва)
  assert.equal(r.nazionale.valore, 1000 + 2000 + 500 + 800);

  // Период: само notices, допринесли лотове (E е в диапазона, не влияе)
  assert.equal(r.periodo.da, '2023-05-01');
  assert.equal(r.periodo.a, '2024-03-01');
});

test('aggrega — разбивка по CPV фамилия', () => {
  const notices = [
    nt(['tenders'], ['1'], ['33100000'], '1000', '2023-05-01Z'),
    nt(['tenders', 'tenders'], ['1', '2'], ['33200000'], '500', '2023-12-01Z'),
    nt(['tenders'], ['4'], ['85100000'], '2000', '2024-01-01Z'),
    nt(['tenders'], ['3'], ['85200000'], '800', '2024-03-01Z'),
  ];
  const r = aggrega(notices);

  // 33*: 3 лота (1,1,2), un offerente = 2
  assert.equal(r.perCpv['33'].nLotti, 3);
  assert.equal(r.perCpv['33'].unOfferente, 2);
  assert.deepEqual(r.perCpv['33'].distribuzione, { 1: 2, 2: 1, 3: 0, '4+': 0 });
  assert.equal(r.perCpv['33'].valore, 1500);

  // 85*: 2 лота (4,3), нула с един оферент
  assert.equal(r.perCpv['85'].nLotti, 2);
  assert.equal(r.perCpv['85'].unOfferente, 0);
  assert.deepEqual(r.perCpv['85'].distribuzione, { 1: 0, 2: 0, 3: 1, '4+': 1 });
});

test('aggrega — само кодът „tenders" се брои; „4+" кофа', () => {
  const notices = [
    // t-esubm/t-verif-inad са подмножества — не бива да се броят
    nt(['tenders', 't-esubm', 't-verif-inad', 't-sme'], ['5', '5', '3', '2'], ['33000000'], '10', '2023-01-01Z'),
  ];
  const r = aggrega(notices);
  assert.equal(r.nazionale.nLotti, 1); // само единият tenders запис
  assert.deepEqual(r.nazionale.distribuzione, { 1: 0, 2: 0, 3: 0, '4+': 1 }); // 5 → „4+"
});

test('aggrega — празен вход', () => {
  const r = aggrega([]);
  assert.equal(r.nazionale.nLotti, 0);
  assert.equal(r.nazionale.quotaUnOfferente, null);
  assert.equal(r.periodo.da, null);
});
