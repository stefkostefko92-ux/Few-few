import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addPeriod } from '../src/billing/plan-invoice.js';

/** Периодът на плана не прелива в края на месеца (одитът от 13.11.2026). */
const day = (iso: string) => new Date(`${iso}T10:15:00Z`);
const iso = (date: Date) => date.toISOString();

test('месец: същият ден, иначе последният ден на целевия месец', () => {
  assert.equal(iso(addPeriod(day('2027-01-31'), 'MONTH')), '2027-02-28T10:15:00.000Z');
  assert.equal(iso(addPeriod(day('2028-01-30'), 'MONTH')), '2028-02-29T10:15:00.000Z');
  assert.equal(iso(addPeriod(day('2027-03-31'), 'MONTH')), '2027-04-30T10:15:00.000Z');
  assert.equal(iso(addPeriod(day('2026-11-13'), 'MONTH')), '2026-12-13T10:15:00.000Z');
  assert.equal(iso(addPeriod(day('2026-12-31'), 'MONTH')), '2027-01-31T10:15:00.000Z');
});

test('година: 29.02 → 28.02 в година без него; часът се пази', () => {
  assert.equal(iso(addPeriod(day('2028-02-29'), 'YEAR')), '2029-02-28T10:15:00.000Z');
  assert.equal(iso(addPeriod(day('2026-11-13'), 'YEAR')), '2027-11-13T10:15:00.000Z');
});
