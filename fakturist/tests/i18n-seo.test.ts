import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keysOf, translator } from '../src/i18n.js';
import { SITE_PAGES } from '../src/seo/pages.js';
import { faqItems, structuredData } from '../src/seo/structured-data.js';
import { llmsTxt, robotsTxt, sitemapXml } from '../src/routes/seo.js';

const BASE = 'https://fakturist.bg';

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
  assert.equal(xml.split('hreflang="x-default"').length - 1, SITE_PAGES.length * 2);
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
