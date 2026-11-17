import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient } from './http.js';

prepareTestDatabase();
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { createServer } = await import('../../src/server.js');

/** SPEC 89–91 през HTTP: публичната страница, „Помощ“ и наръчникът за вписания човек. */
const PASSWORD = 'дълга-и-трудна-парола-2026';
let http: HttpClient;

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  await register({
    kind: 'company',
    name: 'Иван Петров',
    email: 'owner@example.test',
    password: PASSWORD,
    acceptTerms: 'on',
    legalName: 'Пекарна Зора ЕООД',
    eik: '131063188',
    addressStreet: 'ул. „Раковски“ 2',
    addressCity: 'Перник',
    postalCode: '2300',
  });
  http = await startHttp(createServer);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

test('„Как работи“ на двата езика: един H1, HowTo, FAQ, връзка във футъра и в sitemap', async () => {
  for (const path of ['/kak-raboti', '/en/how-it-works']) {
    const res = await http.get(null, path);
    assert.equal(res.status, 200, path);
    const html = await res.text();
    assert.equal(html.match(/<h1\b/g)?.length, 1, path);
    assert.match(html, /"@type":"HowTo"/);
    assert.match(html, /"@type":"FAQPage"/);
    assert.match(html, /<meta name="keywords" content="Carbon Stealth,/);
    assert.match(html, /hreflang="en"/);
  }
  assert.match(await (await http.get(null, '/')).text(), /href="\/kak-raboti"/);
  assert.match(await (await http.get(null, '/sitemap.xml')).text(), /\/kak-raboti</);
});

test('„Помощ“ и наръчникът — само за вписан; разделите на собственика; PDF без кеш', async () => {
  assert.equal((await http.get(null, '/app/pomosht')).status, 303);
  assert.equal((await http.get(null, '/app/narachnik.pdf')).status, 303);
  const owner = await http.login('owner@example.test', PASSWORD);
  const page = await (await http.get(owner, '/app/pomosht')).text();
  assert.match(page, /id="ownership"/);
  assert.doesNotMatch(page, /id="firm-clients"/, 'фирмата не вижда раздела на кантората');
  const pdf = await http.get(owner, '/app/narachnik.pdf');
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(pdf.headers.get('cache-control'), 'no-store');
  assert.equal(
    Buffer.from(await pdf.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    '%PDF-',
  );
});
