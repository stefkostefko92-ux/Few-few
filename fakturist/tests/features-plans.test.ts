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

test('формата на плана: неотметната отметка е „не“, а не грешка („Открояван“)', async () => {
  const { PlanForm } = await import('../src/admin/plan-form.js');
  const base = {
    nameBg: 'Безплатен',
    nameEn: 'Free',
    priceMonthly: '0.00',
    priceYearly: '0,00',
    perClientCompany: '',
    includedClientCompanies: '',
    maxUsers: '1',
    maxCompanies: '1',
    monthlyDocumentSoftLimit: '10',
    sortOrder: '10',
  };
  // Браузърът не праща неотметнатите отметки — нито една.
  const none = PlanForm.safeParse(base);
  assert.ok(none.success, JSON.stringify(none.error?.issues));
  assert.equal(none.data.highlighted, false);
  assert.equal(none.data.isPublic, false);
  assert.equal(none.data.isActive, false);
  assert.deepEqual(none.data.features, []);
  const all = PlanForm.parse({ ...base, highlighted: 'on', isPublic: 'on', isActive: 'on' });
  assert.deepEqual([all.highlighted, all.isPublic, all.isActive], [true, true, true]);
  assert.equal(all.priceYearly, 0);
  // Цените — цели центове, без float.
  const cents = (value: string) => PlanForm.parse({ ...base, priceMonthly: value }).priceMonthly;
  assert.equal(cents('9.5'), 950);
  assert.equal(cents('0,01'), 1);
  assert.equal(cents('19.99'), 1999);
  assert.equal(cents('1234567.89'), 123456789);
  assert.equal(cents(''), null);
  assert.ok(!PlanForm.safeParse({ ...base, highlighted: 'yes' }).success);
});
