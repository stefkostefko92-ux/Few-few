import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  advance,
  fillPeriod,
  nextAfter,
  periodKey,
  periodLabel,
} from '../src/recurring/schedule.js';

/** SPEC 51: графикът на повтарящите се фактури — без часови зони, само дати ГГГГ-ММ-ДД. */
test('месечно: денят се пази, 31-во число пада на последния ден на по-късия месец', () => {
  assert.equal(advance('2026-01-31', 'MONTHLY', 31), '2026-02-28');
  assert.equal(advance('2026-02-28', 'MONTHLY', 31), '2026-03-31');
  assert.equal(advance('2028-01-30', 'MONTHLY', 30), '2028-02-29');
  assert.equal(advance('2026-12-15', 'MONTHLY', 15), '2027-01-15');
});

test('тримесечно и годишно', () => {
  assert.equal(advance('2026-11-30', 'QUARTERLY', 30), '2027-02-28');
  assert.equal(advance('2027-02-28', 'QUARTERLY', 30), '2027-05-30');
  assert.equal(advance('2028-02-29', 'YEARLY', 29), '2029-02-28');
  assert.equal(advance('2029-02-28', 'YEARLY', 29), '2030-02-28');
});

test('първата дата след днес — пропуснатите периоди не се наваксват', () => {
  assert.equal(nextAfter('2026-08-05', 'MONTHLY', 5, '2026-11-13'), '2026-12-05');
  assert.equal(nextAfter('2026-11-13', 'MONTHLY', 13, '2026-11-13'), '2026-12-13');
});

test('ключът на периода е уникален за честотата', () => {
  assert.equal(periodKey('2026-11-05', 'MONTHLY'), '2026-11');
  assert.equal(periodKey('2026-11-05', 'QUARTERLY'), '2026-Q4');
  assert.equal(periodKey('2026-01-01', 'QUARTERLY'), '2026-Q1');
  assert.equal(periodKey('2026-11-05', 'YEARLY'), '2026');
});

test('{период} в текста става името на периода; друго не се пипа', () => {
  assert.equal(periodLabel('2026-11-05', 'MONTHLY', 'bg'), 'ноември 2026');
  assert.equal(periodLabel('2026-11-05', 'QUARTERLY', 'bg'), 'IV тримесечие 2026');
  assert.equal(periodLabel('2026-11-05', 'YEARLY', 'bg'), '2026');
  assert.equal(periodLabel('2026-11-05', 'MONTHLY', 'en'), 'November 2026');
  assert.equal(
    fillPeriod('Абонамент за {период} ({period})', 'ноември 2026'),
    'Абонамент за ноември 2026 (ноември 2026)',
  );
  assert.equal(fillPeriod('{x} без промяна', 'ноември 2026'), '{x} без промяна');
});
