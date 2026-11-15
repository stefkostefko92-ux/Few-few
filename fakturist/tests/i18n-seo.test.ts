import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keysOf, translator } from '../src/i18n.js';
import { SITE_PAGES } from '../src/seo/pages.js';
import { faqItems, structuredData } from '../src/seo/structured-data.js';
import { INDEXNOW_KEY, llmsTxt, robotsTxt, securityTxt, sitemapXml } from '../src/routes/seo.js';
import { LEGAL_DOCUMENT_IDS } from '../src/legal/documents.js';

const BASE = 'https://fakturist.carbonstealth.eu';

test('българският и английският речник имат точно едни и същи ключове', () => {
  const bg = keysOf('bg');
  const en = new Set(keysOf('en'));
  assert.deepEqual(
    bg.filter((k) => !en.has(k)),
    [],
    'липсват в EN',
  );
  assert.deepEqual(
    [...en].filter((k) => !bg.includes(k)),
    [],
    'липсват в BG',
  );
});

test('всяка страница: заглавие < 60, описание < 160, ≥ 5 ключови думи с „Carbon Stealth“', () => {
  for (const locale of ['bg', 'en'] as const) {
    const t = translator(locale);
    for (const page of SITE_PAGES) {
      const title = t(`site.${page.id}.meta.title`);
      const description = t(`site.${page.id}.meta.description`);
      const keywords = t(`site.${page.id}.meta.keywords`)
        .split(',')
        .map((k) => k.trim());
      assert.ok(title.length < 60, `${locale}/${page.id} заглавие ${title.length}`);
      assert.ok(description.length < 160, `${locale}/${page.id} описание ${description.length}`);
      assert.ok(keywords.length >= 5, `${locale}/${page.id} ключови думи`);
      assert.ok(keywords.includes('Carbon Stealth'), `${locale}/${page.id} без Carbon Stealth`);
    }
  }
});

test('sitemap: всяка страница на двата езика с hreflang bg, en и x-default', () => {
  const xml = sitemapXml(BASE);
  for (const page of SITE_PAGES) {
    for (const path of Object.values(page.paths))
      assert.ok(xml.includes(`<loc>${BASE}${path}</loc>`), path);
  }
  assert.equal(
    xml.split('hreflang="x-default"').length - 1,
    (SITE_PAGES.length + LEGAL_DOCUMENT_IDS.length) * 2,
  );
  assert.ok(robotsTxt(BASE).includes(`Sitemap: ${BASE}/sitemap.xml`));
  assert.ok(robotsTxt(BASE).includes('Disallow: /admin/'));
  assert.ok(llmsTxt(BASE).includes(`${BASE}/e-fakturi-2028`));
});

test('JSON-LD: Organization, WebSite, BreadcrumbList и FAQPage, когато има въпроси', () => {
  for (const page of SITE_PAGES) {
    const t = translator('bg');
    const data = structuredData({ base: BASE, locale: 'bg', t, page: page.id, plans: [] });
    const types = (data['@graph'] as Array<{ '@type': string }>).map((node) => node['@type']);
    for (const type of ['Organization', 'WebSite', 'BreadcrumbList'])
      assert.ok(types.includes(type), `${page.id}: ${type}`);
    if (faqItems('bg', t, page.id).length > 0) assert.ok(types.includes('FAQPage'), page.id);
  }
});

test('security.txt (RFC 9116) и ключът за IndexNow', () => {
  const now = new Date('2026-11-13T12:00:00Z');
  const text = securityTxt(BASE, 'info@carbonstealth.eu', now);
  assert.match(text, /^Contact: mailto:info@carbonstealth\.eu$/m);
  assert.match(text, new RegExp(`^Canonical: ${BASE}/\\.well-known/security\\.txt$`, 'm'));
  const expires = Date.parse(/^Expires: (.+)$/m.exec(text)![1]!);
  assert.ok(expires > now.getTime() && expires - now.getTime() < 365 * 24 * 3600 * 1000);
  assert.match(INDEXNOW_KEY, /^[a-f0-9]{32}$/);
});

test('всяко съобщение на модела (zod в model.ts) има английски двойник', async () => {
  const { readFileSync } = await import('node:fs');
  const { INPUT_MESSAGES_EN } = await import('../src/einvoice/input-messages.js');
  const source = readFileSync(new URL('../src/einvoice/model.ts', import.meta.url), 'utf8');
  const messages = [...source.matchAll(/'([^']*[А-Яа-я][^']*)'\)/g)].map((m) => m[1]!);
  assert.ok(messages.length >= 8, 'съобщенията в model.ts');
  for (const message of messages) assert.ok(INPUT_MESSAGES_EN[message], message);
});

test('единствено число: при count 1 се взема <ключ>One — „1 документ“, „1 record“', () => {
  assert.equal(translator('bg')('app.org.usage', { count: 1 }), 'Този месец: 1 документ');
  assert.equal(translator('bg')('app.org.usage', { count: 3 }), 'Този месец: 3 документа');
  assert.equal(translator('en')('admin.records', { count: 1 }), '1 record');
  assert.equal(translator('en')('admin.records', { count: 0 }), '0 records');
});
