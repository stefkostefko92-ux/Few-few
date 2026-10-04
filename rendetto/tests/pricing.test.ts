import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCALES, translate } from '../src/i18n.js';
import {
  formatLifetimeTimes,
  formatMoney,
  isOptionId,
  LIFETIME_PERCENT_OF_YEAR,
  LIFETIME_MULTIPLE,
  lifetimePriceCents,
  lifetimeRuleParams,
  MONTHLY_CENTS,
  optionMonths,
  optionPriceCents,
  perMonthCents,
  priceTable,
  TERM_OPTIONS,
  termPriceCents,
  withVatCents,
  YEAR_MONTHS,
} from '../src/plans/pricing.js';

test('the price list the owner asked for: 25 € a month, 5/10/20 % off, lifetime 2.5 × a year', () => {
  assert.equal(MONTHLY_CENTS, 2500);
  const totals = Object.fromEntries(TERM_OPTIONS.map((o) => [o.id, termPriceCents(o)]));
  assert.deepEqual(totals, { m1: 2500, m3: 7125, m6: 13500, m12: 24000 });
  assert.equal(lifetimePriceCents(), 75000);
  assert.equal(optionPriceCents('lifetime'), 75000);
  assert.equal(optionPriceCents('m12'), 24000);
});

test('the multiple the copy states is the one the lifetime price is computed with', () => {
  assert.equal(LIFETIME_MULTIPLE, 2.5);
  assert.equal(lifetimePriceCents(), MONTHLY_CENTS * 12 * LIFETIME_MULTIPLE);
});

test('per-month price and VAT are whole cents, rounded half up at the end', () => {
  const byId = Object.fromEntries(TERM_OPTIONS.map((o) => [o.id, o]));
  assert.equal(perMonthCents(byId.m3!), 2375);
  assert.equal(perMonthCents(byId.m6!), 2250);
  assert.equal(perMonthCents(byId.m12!), 2000);
  assert.equal(withVatCents(2500), 3000);
  assert.equal(withVatCents(7125), 8550);
  assert.equal(withVatCents(75000), 90000);
  assert.equal(withVatCents(1), 1); // 1.2 → 1
  assert.equal(withVatCents(3), 4); // 3.6 → 4
});

test('every row of the table is an integer and lifetime has no monthly price', () => {
  const rows = priceTable();
  assert.deepEqual(
    rows.map((r) => r.id),
    ['m1', 'm3', 'm6', 'm12', 'lifetime'],
  );
  for (const r of rows) {
    for (const v of [
      r.totalCents,
      r.totalWithVatCents,
      r.perMonthCents ?? 0,
      r.perMonthWithVatCents ?? 0,
    ])
      assert.ok(Number.isInteger(v));
  }
  // крайните цени за потребители: 30 € на месец, 3 месеца 85,50 € = 28,50 € на месец, Lifetime 900 €
  assert.deepEqual(
    rows.map((r) => [r.totalWithVatCents, r.perMonthWithVatCents]),
    [
      [3000, 3000],
      [8550, 2850],
      [16200, 2700],
      [28800, 2400],
      [90000, null],
    ],
  );
  assert.equal(rows.at(-1)?.perMonthCents, null);
  assert.equal(optionMonths('lifetime'), null);
  assert.equal(optionMonths('m6'), 6);
});

test('only known options are accepted from the client', () => {
  for (const ok of ['m1', 'm3', 'm6', 'm12', 'lifetime']) assert.ok(isOptionId(ok));
  for (const bad of ['m2', 'M1', '', null, 12, 'lifetime ', '__proto__'])
    assert.ok(!isOptionId(bad));
  assert.throws(() => optionPriceCents('m2' as never));
});

test('money is formatted per language and refuses fractions of a cent', () => {
  assert.equal(formatMoney(7125, 'bg').replace(/\s/g, ' '), '71,25 €');
  assert.equal(formatMoney(7125, 'en'), '€71.25');
  assert.equal(formatMoney(2500, 'it').replace(/\s/g, ' '), '25 €');
  assert.throws(() => formatMoney(12.5, 'bg'));
});

test('the texts state the Lifetime multiplier from the price rule, in each language', () => {
  assert.equal(LIFETIME_PERCENT_OF_YEAR, 250);
  assert.equal(formatLifetimeTimes('bg'), '2,5');
  assert.equal(formatLifetimeTimes('en'), '2.5');
  assert.equal(formatLifetimeTimes('it'), '2,5');
});

test('the Lifetime rule in the public texts comes from the price list, not from the copy', () => {
  assert.equal(
    lifetimePriceCents(),
    (MONTHLY_CENTS * YEAR_MONTHS * LIFETIME_PERCENT_OF_YEAR) / 100,
  );
  assert.deepEqual(lifetimeRuleParams('bg'), { multiple: '2,5', months: 12 });
  assert.deepEqual(lifetimeRuleParams('en'), { multiple: '2.5', months: 12 });
  assert.deepEqual(lifetimeRuleParams('it'), { multiple: '2,5', months: 12 });
  for (const locale of LOCALES) {
    const rule = lifetimeRuleParams(locale);
    for (const key of ['landing.prices.lifetime', 'brochure.prices.lifetime']) {
      const text = translate(locale, key, rule);
      assert.ok(!text.includes('{'), `${locale}.${key}: ${text}`);
      assert.ok(text.includes(rule.multiple), `${locale}.${key}: ${text}`);
      assert.ok(text.includes(String(rule.months)), `${locale}.${key}: ${text}`);
    }
  }
});
