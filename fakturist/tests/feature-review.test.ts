import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FEATURES, feature } from '../src/features.js';
import { DEFAULT_PLANS } from '../src/billing/plans.js';
import { SITE_PAGES, sitePage } from '../src/seo/pages.js';
import { llmsTxt, sitemapXml } from '../src/routes/seo.js';
import { hasKey } from '../src/i18n.js';

/**
 * SPEC 99 (собственикът, 28.11.2026: „някои функции да не са пуснати до проверка от НАП“): данните за SAF-T и
 * дневниците по ДДС са „проверява се“ — не са налични за клиентите, витрината ги показва със статуса, а
 * рекламните им страници не са публикувани, докато файловете не минат инструментите на НАП.
 */
const BASE = 'https://fakturist.carbonstealth.eu';

test('SAF-T и дневниците по ДДС са „проверява се“', () => {
  assert.equal(feature('saf-t').status, 'review');
  assert.equal(feature('vat-ledgers').status, 'review');
  for (const locale of ['bg', 'en'] as const) assert.ok(hasKey(locale, 'features.review'), locale);
});

test('дневниците ще са във всеки план след пускането — както преди', () => {
  for (const plan of DEFAULT_PLANS) assert.ok(plan.features.includes('vat-ledgers'), plan.code);
});

test('страница за функция, която не е пусната, не е публикувана', () => {
  const ids = SITE_PAGES.map((page) => page.id as string);
  for (const id of ['saft', 'vatLedgers']) assert.ok(!ids.includes(id), id);
  // Адресът ѝ остава известен (за деня на пускането), но не е в sitemap и llms.txt.
  assert.equal(sitePage('saft').paths.bg, '/saf-t');
  const sitemap = sitemapXml(BASE);
  const llms = llmsTxt(BASE);
  for (const path of ['/saf-t', '/en/saf-t', '/dnevnitsi-po-dds', '/en/vat-ledgers']) {
    assert.ok(!sitemap.includes(`${BASE}${path}<`), `sitemap: ${path}`);
    assert.ok(!llms.includes(`${BASE}${path})`), `llms: ${path}`);
  }
});

test('всяка публикувана страница е за пусната функция (или без функция)', () => {
  for (const page of SITE_PAGES) {
    const code = (page as { feature?: string }).feature;
    if (code) assert.equal(FEATURES.find((f) => f.code === code)?.status, 'live', page.id);
  }
});
