import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addMonthsUtc,
  GRANT_FOREVER_YEARS,
  grantEnd,
  parseGrantForm,
} from '../src/billing/grant.js';

/** SPEC 71: формата за даване на план и срокът — без база. */
test('срокът: календарни месеци; 31-во число → последният ден на по-краткия месец', () => {
  const at = (iso: string) => new Date(`${iso}T10:00:00Z`);
  assert.equal(addMonthsUtc(at('2026-11-15'), 3).toISOString(), '2027-02-15T10:00:00.000Z');
  assert.equal(addMonthsUtc(at('2027-01-31'), 1).toISOString(), '2027-02-28T10:00:00.000Z');
  assert.equal(addMonthsUtc(at('2028-01-31'), 1).toISOString(), '2028-02-29T10:00:00.000Z');
  assert.equal(addMonthsUtc(at('2026-12-31'), 12).toISOString(), '2027-12-31T10:00:00.000Z');
  const forever = grantEnd(at('2026-11-15'), 'forever');
  assert.equal(forever.getUTCFullYear(), 2026 + GRANT_FOREVER_YEARS);
});

test('формата: план, срок 1–120 месеца или „безсрочно“, причина 3–200 знака, отметка за платения период', () => {
  const ok = parseGrantForm({ planCode: 'business', months: '3', note: '  Партньор  ' });
  assert.deepEqual(ok, {
    ok: true,
    value: { planCode: 'business', months: 3, note: 'Партньор', replacePaid: false },
  });
  const forever = parseGrantForm({
    planCode: 'pro',
    months: 'forever',
    note: 'Награда',
    replacePaid: 'on',
  });
  assert.deepEqual(forever, {
    ok: true,
    value: { planCode: 'pro', months: 'forever', note: 'Награда', replacePaid: true },
  });
  for (const months of ['0', '121', '1.5', '-1', '', 'x']) {
    assert.deepEqual(parseGrantForm({ planCode: 'pro', months, note: 'Награда' }), {
      ok: false,
      error: 'months',
    });
  }
  assert.deepEqual(parseGrantForm({ planCode: 'pro', months: '1', note: ' a ' }), {
    ok: false,
    error: 'note',
  });
  assert.deepEqual(parseGrantForm({ planCode: 'pro', months: '1', note: 'x'.repeat(201) }), {
    ok: false,
    error: 'note',
  });
  assert.deepEqual(parseGrantForm({ planCode: '', months: '1', note: 'Награда' }), {
    ok: false,
    error: 'plan',
  });
  assert.deepEqual(parseGrantForm({ planCode: ['pro'], months: '1', note: 'Награда' }), {
    ok: false,
    error: 'plan',
  });
});
