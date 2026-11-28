import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient } from './http.js';

prepareTestDatabase();
process.env['REGISTRATION_OPEN'] = 'true';
const { prisma } = await import('../../src/db.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { createServer } = await import('../../src/server.js');
const { invalidatePublicPlans } = await import('../../src/billing/public-plans.js');
const { SITE_PAGES } = await import('../../src/seo/pages.js');
const { LANDING_IDS } = await import('../../src/seo/landing.js');

/**
 * Страниците за рекламите (собственикът, 23.11.2026): всяка на двата езика — един H1, отговор отпред,
 * разделите, въпросите (FAQPage) и стъпките (HowTo) в JSON-LD, призив към регистрацията; числата от плановете
 * са от базата (сменени в панела — сменени и тук), без незаместени `{…}`.
 */
let http: HttpClient;

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  http = await startHttp(createServer);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

test('всяка страница за рекламите — 200 на двата езика, един H1, JSON-LD, без незаместени стойности', async () => {
  // Само публикуваните: страница за функция „проверява се“ няма адрес (SPEC 99, integration/feature-review).
  for (const id of LANDING_IDS) {
    const page = SITE_PAGES.find((p) => p.id === id);
    if (!page) continue;
    for (const locale of ['bg', 'en'] as const) {
      const res = await fetch(`${http.origin}${page.paths[locale]}`);
      assert.equal(res.status, 200, `${id} ${locale}`);
      const html = await res.text();
      assert.equal(html.match(/<h1[\s>]/g)?.length, 1, `${id} ${locale}: един H1`);
      assert.doesNotMatch(html, /\{(limit|safTPlans)\}/, `${id} ${locale}: незаместено`);
      assert.match(html, /data-speakable/);
      const ld = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
      assert.ok(ld, `${id} ${locale}: JSON-LD`);
      const types = (JSON.parse(ld) as { '@graph': Array<{ '@type': string }> })['@graph'].map(
        (node) => node['@type'],
      );
      for (const type of ['Organization', 'WebSite', 'BreadcrumbList', 'FAQPage', 'WebPage']) {
        assert.ok(types.includes(type), `${id} ${locale}: ${type}`);
      }
      if (id !== 'vatLedgers') assert.ok(types.includes('HowTo'), `${id} ${locale}: HowTo`);
      assert.match(
        html,
        locale === 'en' ? /href="\/registraciya\?lang=en"/ : /href="\/registraciya"/,
        `${id} ${locale}: регистрация`,
      );
    }
  }
});

test('лимитът на безплатния план идва от базата', async () => {
  await prisma.plan.update({ where: { code: 'free' }, data: { monthlyDocumentSoftLimit: 35 } });
  invalidatePublicPlans();
  const free = await (await fetch(`${http.origin}/bezplatna-programa-za-fakturi`)).text();
  assert.match(free, /до 35 документа на месец/);
});
