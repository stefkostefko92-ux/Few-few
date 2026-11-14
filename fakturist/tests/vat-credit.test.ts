import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addMonths,
  allowedPeriods,
  CREDIT_WINDOW_MONTHS,
  journalPeriodOf,
} from '../src/incoming/vat-credit.js';

/** Входящата фактура в дневника за покупките: месецът по подразбиране и срокът по чл. 72 ЗДДС. */
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

test('месеците: събиране през годината', () => {
  assert.equal(addMonths('2026-11', 1), '2026-12');
  assert.equal(addMonths('2026-11', 2), '2027-01');
  assert.equal(addMonths('2026-01', 11), '2026-12');
  assert.equal(addMonths('2026-12', 13), '2028-01');
});

test('срокът: от месеца на издаване до края по чл. 72 — но не в бъдещ месец', () => {
  assert.deepEqual(allowedPeriods(day('2026-03-15'), '2026-11-14'), {
    from: '2026-03',
    to: '2026-11',
  });
  assert.deepEqual(allowedPeriods(day('2025-10-02'), '2026-11-14'), {
    from: '2025-10',
    to: addMonths('2025-10', CREDIT_WINDOW_MONTHS),
  });
  assert.equal(allowedPeriods(null, '2026-11-14'), null, 'без дата на издаване — не влиза');
});

test('месецът в дневника: избраният, иначе месецът на издаване', () => {
  assert.equal(journalPeriodOf({ journalPeriod: null, issueDate: day('2026-10-31') }), '2026-10');
  assert.equal(
    journalPeriodOf({ journalPeriod: '2026-11', issueDate: day('2026-10-31') }),
    '2026-11',
  );
  assert.equal(journalPeriodOf({ journalPeriod: null, issueDate: null }), null);
});
