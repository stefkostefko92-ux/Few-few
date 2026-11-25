import assert from 'node:assert/strict';
import { test } from 'node:test';
import { translator } from '../src/i18n.js';
import { structuredData } from '../src/seo/structured-data.js';
import { llmsTxt } from '../src/routes/seo.js';
import { newsRss } from '../src/news/feed.js';
import { dayStart, LAST_UPDATE } from '../src/news/entries.js';
import { FEATURES } from '../src/features.js';
import { SOFTWARE_VERSION } from '../src/version.js';
import { ARTICLE_PUBLISHED, COMPANY } from '../src/company.js';

/** SEO по прегледа от 16.11.2026: NAP на езика на страницата, версия и само налични функции, статия, llms.txt, RSS. */
const BASE = 'https://fakturist.carbonstealth.eu';
type Node = Record<string, unknown> & { '@type': string };
const graph = (locale: 'bg' | 'en', page: 'home' | 'einvoicing2028') =>
  structuredData({ base: BASE, locale, t: translator(locale), page, plans: [] })[
    '@graph'
  ] as Node[];
const node = (nodes: Node[], type: string) => nodes.find((item) => item['@type'] === type)!;

test('Organization: адресът е на езика на страницата (като във футъра), с контакт', () => {
  for (const locale of ['bg', 'en'] as const) {
    const org = node(graph(locale, 'home'), 'Organization');
    const address = org.address as Record<string, string>;
    assert.equal(address.streetAddress, COMPANY.street[locale]);
    assert.equal(address.addressLocality, COMPANY.city[locale]);
    assert.equal((org.contactPoint as Record<string, string>).email, COMPANY.email);
  }
});

test('SoftwareApplication: версията и само наличните функции — предстоящото не се обявява', () => {
  const t = translator('bg');
  const app = node(graph('bg', 'home'), 'SoftwareApplication');
  assert.equal(app.softwareVersion, SOFTWARE_VERSION);
  const list = app.featureList as string[];
  for (const item of FEATURES) {
    const name = t(`features.${item.code}.name`);
    assert.equal(list.includes(name), item.status === 'live', item.code);
  }
});

test('статията: дата на публикуване и изображение', () => {
  const article = node(graph('bg', 'einvoicing2028'), 'Article');
  assert.equal(article.datePublished, ARTICLE_PUBLISHED);
  assert.equal(article.image, `${BASE}/img/og-bg.png`);
});

test('llms.txt: резюме на двата езика, без страници с noindex', () => {
  const text = llmsTxt(BASE);
  assert.ok(text.includes(translator('bg')('site.home.meta.description')));
  assert.ok(text.includes(translator('en')('site.home.meta.description')));
  assert.ok(!text.includes('/prilozhenie'));
  assert.ok(text.includes(`${BASE}/kakvo-novo.xml`));
});

test('RSS: lastBuildDate е денят на последната новина', () => {
  const xml = newsRss(BASE, 'bg');
  assert.ok(xml.includes(`<lastBuildDate>${dayStart(LAST_UPDATE).toUTCString()}</lastBuildDate>`));
});
