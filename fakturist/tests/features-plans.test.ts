import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FEATURES, FEATURE_GROUPS } from '../src/features.js';
import { DEFAULT_PLANS, firmMonthlyCents, softLimitState } from '../src/billing/plans.js';
import { hasKey } from '../src/i18n.js';

test('всяка функция има група и превод на двата езика', () => {
  for (const feature of FEATURES) {
    assert.ok((FEATURE_GROUPS as readonly string[]).includes(feature.group), feature.code);
    for (const locale of ['bg', 'en'] as const) {
      assert.ok(hasKey(locale, `features.${feature.code}.name`), `${locale}:${feature.code}.name`);
      assert.ok(
        hasKey(locale, `features.${feature.code}.description`),
        `${locale}:${feature.code}`,
      );
    }
  }
});

test('предстоящите функции носят целевата дата', () => {
  for (const feature of FEATURES) {
    if (feature.status === 'planned')
      assert.match((feature as { target?: string }).target ?? '', /^\d{4}-Q[1-4]$/);
  }
});

test('плановете: кодовете са уникални, цените са цели центове, функциите са от регистъра', () => {
  const codes = DEFAULT_PLANS.map((p) => p.code);
  assert.equal(new Set(codes).size, codes.length);
  const known = new Set<string>(FEATURES.map((f) => f.code));
  for (const plan of DEFAULT_PLANS) {
    for (const price of [
      plan.priceMonthlyCents,
      plan.priceYearlyCents,
      plan.perClientCompanyCents,
    ]) {
      assert.ok(price === null || Number.isInteger(price), plan.code);
    }
    for (const code of plan.features) assert.ok(known.has(code), `${plan.code}: ${code}`);
  }
});

test('решение на собственика: лимит по брой само в безплатния план, и то мек', () => {
  for (const plan of DEFAULT_PLANS) {
    if (plan.code === 'free') assert.equal(plan.monthlyDocumentSoftLimit, 20);
    else assert.equal(plan.monthlyDocumentSoftLimit, null, plan.code);
  }
  assert.deepEqual(softLimitState(20, 25), { overLimit: true, remaining: 0 });
  assert.deepEqual(softLimitState(null, 5000), { overLimit: false, remaining: null });
});

test('кантора: 3 фирми безплатно, после 4 € на фирма', () => {
  const firm = DEFAULT_PLANS.find((p) => p.code === 'firm')!;
  assert.equal(firmMonthlyCents(firm, 3), 0);
  assert.equal(firmMonthlyCents(firm, 10), 2800);
  assert.throws(() => firmMonthlyCents(firm, -1));
});
