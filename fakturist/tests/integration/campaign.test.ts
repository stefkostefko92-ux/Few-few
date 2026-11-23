import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient } from './http.js';

prepareTestDatabase();
process.env['REGISTRATION_OPEN'] = 'true';
const { prisma } = await import('../../src/db.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { createServer } = await import('../../src/server.js');
const { signupReport } = await import('../../src/marketing/report.js');

/**
 * SPEC 93–94: етикетът на кампанията се носи в адресите на витрината и в скритите полета на регистрацията
 * (без бисквитки), записва се на фирмата; „Източници“ в панела брои регистрациите и платилите.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
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

const page = async (path: string, headers: Record<string, string> = {}) => {
  const res = await fetch(`${http.origin}${path}`, { headers, redirect: 'manual' });
  assert.equal(res.status, 200, path);
  assert.equal(res.headers.get('set-cookie'), null, 'витрината не слага бисквитки');
  return res.text();
};

test('витрината носи етикета в адресите към регистрацията и страниците; английската — и езика', async () => {
  const bg = await page('/?utm_source=google&utm_medium=cpc&utm_campaign=start');
  assert.match(
    bg,
    /href="\/registraciya\?utm_source=google&amp;utm_medium=cpc&amp;utm_campaign=start"/,
  );
  assert.match(bg, /href="\/ceni\?utm_source=google&amp;utm_medium=cpc&amp;utm_campaign=start"/);
  assert.match(bg, /<link rel="canonical" href="[^"?]*\/"/, 'каноничният адрес е без етикета');

  const en = await page('/en/');
  assert.match(
    en,
    /href="\/registraciya\?lang=en"/,
    'английската води към регистрацията на английски',
  );
  assert.match(en, /href="\/vhod\?lang=en"/);
  const enAd = await page('/en/?utm_source=linkedin');
  assert.match(enAd, /href="\/registraciya\?lang=en&amp;utm_source=linkedin"/);
  assert.match(enAd, /href="\/en\/pricing\?utm_source=linkedin"/);

  const res = await fetch(`${http.origin}/ceni`, {
    headers: { referer: 'https://www.facebook.com/some/post?id=1' },
  });
  assert.equal(res.headers.get('cache-control'), 'private', 'зависи от Referer — не в общ кеш');
  const referral = await res.text();
  assert.match(
    referral,
    /href="\/registraciya\?utm_source=www.facebook.com&amp;utm_medium=referral"/,
  );
  // Сайтът, от който идва посетителят, не се разнася във вътрешните връзки — само до регистрацията.
  assert.match(referral, /href="\/za-schetovoditeli"/);
  assert.doesNotMatch(referral, /href="\/za-schetovoditeli\?utm_source/);
  const plain = await page('/');
  assert.match(plain, /href="\/registraciya"/);
});

test('формата носи етикета в скрити полета; регистрацията го записва на фирмата', async () => {
  const form = await page('/registraciya?utm_source=google&utm_medium=cpc&utm_campaign=start');
  assert.match(form, /<input type="hidden" name="utm_source" value="google">/);
  assert.match(form, /<input type="hidden" name="utm_campaign" value="start">/);
  const fields = {
    kind: 'company',
    name: 'Иван Петров',
    password: PASSWORD,
    acceptTerms: 'on',
    addressStreet: 'ул. „Раковски“ 2',
    addressCity: 'Перник',
    postalCode: '2300',
  };
  const res = await http.post(null, '/registraciya', {
    ...fields,
    email: 'ad@example.test',
    legalName: 'Пекарна Зора ЕООД',
    eik: '131063188',
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'start',
    utm_term: 'програма за фактури',
  });
  assert.equal(res.status, 303);
  const org = await prisma.organization.findUniqueOrThrow({ where: { eik: '131063188' } });
  assert.equal(org.signupSource, 'google');
  assert.equal(org.signupMedium, 'cpc');
  assert.equal(org.signupCampaign, 'start');
  assert.equal(org.signupTerm, 'програма за фактури');
  assert.equal(org.signupContent, null);

  // Подправено поле не стига до базата.
  await http.post(null, '/registraciya', {
    ...fields,
    email: 'bad@example.test',
    legalName: 'Мелница Злато ООД',
    eik: '123456786',
    utm_source: '<script>',
  });
  const bad = await prisma.organization.findUniqueOrThrow({ where: { eik: '123456786' } });
  assert.equal(bad.signupSource, null);
});

test('„Източници“: регистрации по източник, кантори отделно, платилите; без източник — отделен ред', async () => {
  const firm = await prisma.organization.create({
    data: {
      kind: 'ACCOUNTING_FIRM',
      legalName: 'Кантора Баланс ООД',
      eik: '121604974',
      addressStreet: 'ул. 1',
      addressCity: 'София',
      postalCode: '1000',
      signupSource: 'google',
      signupMedium: 'cpc',
      signupCampaign: 'start',
    },
  });
  await prisma.payment.create({
    data: {
      organizationId: firm.id,
      planCode: 'firm',
      interval: 'MONTH',
      amountCents: 1079,
      netCents: 899,
      vatCents: 180,
      reference: 'FKT-TEST-1',
      provider: 'MANUAL',
      status: 'COMPLETED',
      paidAt: new Date(),
    },
  });
  const rows = await signupReport({ since: new Date(Date.now() - 30 * 86_400_000) });
  const google = rows.find((r) => r.source === 'google' && r.campaign === 'start');
  assert.ok(google);
  assert.equal(google.companies, 1);
  assert.equal(google.firms, 1);
  assert.equal(google.paid, 1);
  const direct = rows.find((r) => r.source === null);
  assert.ok(direct, 'без източник');
  assert.equal(direct.companies, 1);
  assert.equal(rows[0]?.source, 'google', 'най-много регистрации — първи');
  const none = await signupReport({ since: new Date(Date.now() + 86_400_000) });
  assert.deepEqual(none, []);
});
