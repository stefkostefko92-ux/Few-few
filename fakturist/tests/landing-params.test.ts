import assert from 'node:assert/strict';
import { test } from 'node:test';
import { translator } from '../src/i18n.js';
import type { PublicPlan } from '../src/billing/public-plans.js';
import { landingParams } from '../src/seo/landing.js';

/**
 * Рекламните страници пишат лимита на безплатния план от базата. Без безплатен план (скрит от мастъра или
 * плановете не се заредиха) — нито число, нито „без лимит“ (Кодаджията, 25.11.2026: иначе страницата обещава
 * неограничен брой документа, който базата не потвърждава).
 */
const plan = (over: Partial<PublicPlan>): PublicPlan => ({
  code: 'free',
  audience: 'company',
  nameBg: 'Безплатен',
  nameEn: 'Free',
  priceMonthlyCents: 0,
  priceYearlyCents: 0,
  perClientCompanyCents: null,
  includedClientCompanies: null,
  maxUsers: 1,
  maxCompanies: 1,
  monthlyDocumentSoftLimit: 20,
  features: [],
  highlighted: false,
  ...over,
});

const bg = translator('bg');
const en = translator('en');

test('лимитът е числото от безплатния план', () => {
  assert.equal(landingParams('bg', bg, [plan({})]).limit, '20');
});

test('безплатен план без лимит — „неограничен брой“', () => {
  const params = landingParams('bg', bg, [plan({ monthlyDocumentSoftLimit: null })]);
  assert.equal(params.limit, bg('site.landing.unlimited'));
});

test('без безплатен план или без планове — без обещание', () => {
  for (const plans of [[], [plan({ priceMonthlyCents: 900, code: 'start' })]]) {
    const params = landingParams('bg', bg, plans);
    assert.equal(params.limit, bg('site.landing.limitUnknown'));
    assert.notEqual(params.limit, bg('site.landing.unlimited'));
  }
  assert.equal(landingParams('en', en, []).limit, en('site.landing.limitUnknown'));
});

test('кантората с цена 0 не е безплатният план на фирмата', () => {
  const firmOnly = [plan({ audience: 'accountant', code: 'firm', monthlyDocumentSoftLimit: null })];
  assert.equal(landingParams('bg', bg, firmOnly).limit, bg('site.landing.limitUnknown'));
});
