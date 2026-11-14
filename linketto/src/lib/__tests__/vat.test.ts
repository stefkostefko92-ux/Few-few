import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vatForPlanSale, VAT_THRESHOLD_CENTS } from '../vat';

// P11
test('P11: под прага €10 000 → ДДС на България 20% (вкл. в цената)', () => {
  const r = vatForPlanSale({ grossCents: 3840, crossBorderCents: 0, prevYearCrossBorderCents: 0 });
  assert.deepEqual(r, { ok: true, country: 'BG', rateBp: 2000, vatCents: 640, netCents: 3200 });
});

test('P11: прагът е €10 000 и важи за текущата И предходната година', () => {
  assert.equal(VAT_THRESHOLD_CENTS, 1_000_000);
  const over = vatForPlanSale({ grossCents: 400, crossBorderCents: 999_800, prevYearCrossBorderCents: 0 });
  assert.equal(over.ok, false); // тази продажба вече надхвърля
  const prev = vatForPlanSale({ grossCents: 400, crossBorderCents: 0, prevYearCrossBorderCents: 1_000_001 });
  assert.equal(prev.ok, false);
});

test('P11: над прага → fail closed, докато таблицата на ставките не е проверена', () => {
  const r = vatForPlanSale({ grossCents: 400, crossBorderCents: 2_000_000, prevYearCrossBorderCents: 0 });
  assert.deepEqual(r, { ok: false, reason: 'over-threshold-rates-unverified' });
});

test('P11: закръгляне — ДДС = бруто × 20/120, нето = бруто − ДДС (без загуба на цент)', () => {
  const r = vatForPlanSale({ grossCents: 4900, crossBorderCents: 0, prevYearCrossBorderCents: 0 });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.vatCents, 817);
    assert.equal(r.netCents + r.vatCents, 4900);
  }
});
