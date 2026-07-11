import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localeAlternates, faqJsonLd, siteJsonLd, OG_IMAGE } from '../seo';

test('localeAlternates: canonical + 6 hreflang + x-default', () => {
  const alt = localeAlternates('bg', '/pricing') as {
    canonical: string;
    languages: Record<string, string>;
  };
  assert.ok(alt.canonical.endsWith('/bg/pricing'));
  for (const loc of ['bg', 'en', 'it', 'es', 'de', 'fr']) {
    assert.ok(alt.languages[loc].endsWith(`/${loc}/pricing`));
  }
  assert.ok(alt.languages['x-default'].endsWith('/en/pricing'));
});

test('OG картата е с валидни размери 1200×630', () => {
  assert.equal(OG_IMAGE.width, 1200);
  assert.equal(OG_IMAGE.height, 630);
  assert.ok(OG_IMAGE.url.endsWith('/og.png'));
});

test('siteJsonLd: Organization + WebSite + SoftwareApplication с Offers', () => {
  const ld = siteJsonLd({
    locale: 'en',
    description: 'x',
    plans: [
      { name: 'Free', priceEur: 0 },
      { name: 'Pro', priceEur: 4 },
    ],
  });
  const types = ld.map((n) => n['@type']);
  assert.deepEqual(types, ['Organization', 'WebSite', 'SoftwareApplication']);
  const app = ld[2] as { offers: { price: string }[] };
  assert.equal(app.offers.length, 2);
  assert.equal(app.offers[1].price, '4.00');
});

test('faqJsonLd: FAQPage със структурирани въпроси', () => {
  const ld = faqJsonLd([{ q: 'A?', a: 'B.' }]) as {
    '@type': string;
    mainEntity: { name: string; acceptedAnswer: { text: string } }[];
  };
  assert.equal(ld['@type'], 'FAQPage');
  assert.equal(ld.mainEntity[0].name, 'A?');
  assert.equal(ld.mainEntity[0].acceptedAnswer.text, 'B.');
});
