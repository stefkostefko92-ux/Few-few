import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient, type Session } from './http.js';

prepareTestDatabase();
delete process.env['SMTP_HOST'];
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { createServer } = await import('../../src/server.js');
const { invalidateSettings } = await import('../../src/admin/settings.js');
const { orgHasFeature } = await import('../../src/billing/entitlements.js');
const { sofiaToday } = await import('../../src/time.js');

/**
 * SPEC 99 (собственикът, 28.11.2026: „някои функции да не са пуснати до проверка от НАП“): SAF-T и
 * дневниците по ДДС са „проверява се“. Клиентите не ги ползват (страницата казва защо, файловете не се
 * дават); фирмите за проверката от панела (`features.reviewOrgIds`) — да, за да прекарат реални файлове през
 * инструментите на НАП. Рекламните страници не са публикувани.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const period = sofiaToday().slice(0, 7);
let http: HttpClient;
let owner: Session;
let orgId = '';

const setReviewOrgs = async (value: string) => {
  await prisma.setting.upsert({
    where: { key: 'features.reviewOrgIds' },
    create: { key: 'features.reviewOrgIds', value },
    update: { value },
  });
  invalidateSettings();
};

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  orgId = (
    await register({
      kind: 'company',
      name: 'Иван Петров',
      email: 'owner@example.test',
      password: PASSWORD,
      acceptTerms: 'on',
      legalName: 'Пекарна Зора ЕООД',
      eik: '131063188',
      vatNumber: 'BG131063188',
      addressStreet: 'ул. „Раковски“ 2',
      addressCity: 'Перник',
      postalCode: '2300',
    })
  ).organizationId;
  // План с SAF-T — функцията пак не е налична, докато се проверява.
  await prisma.subscription.updateMany({
    where: { organizationId: orgId, status: 'ACTIVE' },
    data: { planCode: 'business' },
  });
  http = await startHttp(createServer);
  owner = await http.login('owner@example.test', PASSWORD);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

test('клиентът не получава файловете — страниците казват, че се проверяват с инструментите на НАП', async () => {
  assert.equal(await orgHasFeature(orgId, 'saf-t'), false);
  assert.equal(await orgHasFeature(orgId, 'vat-ledgers'), false);

  const journal = await (await http.get(owner, `/app/o/${orgId}/dnevnik?period=${period}`)).text();
  assert.match(journal, /Проверява се с инструментите на НАП/);
  assert.doesNotMatch(journal, /PRODAGBI\.TXT\?/);
  for (const file of ['PRODAGBI.TXT', 'POKUPKI.TXT']) {
    const res = await http.get(owner, `/app/o/${orgId}/dnevnik/${file}?period=${period}`);
    assert.equal(res.status, 303, file);
    assert.equal(res.headers.get('location'), `/app/o/${orgId}/dnevnik`);
  }

  const saft = await (await http.get(owner, `/app/o/${orgId}/saf-t`)).text();
  assert.match(saft, /Проверява се с инструментите на НАП/);
  assert.doesNotMatch(saft, /„Бизнес“ и по-горе/, 'не „купете план“ — планът го има');
  assert.equal((await http.get(owner, `/app/o/${orgId}/saf-t.zip?period=${period}`)).status, 303);
});

test('фирма за проверката (от панела) ги ползва — за да мине реални файлове през инструментите на НАП', async () => {
  await setReviewOrgs(orgId);
  assert.equal(await orgHasFeature(orgId, 'saf-t'), true);
  assert.equal(await orgHasFeature(orgId, 'vat-ledgers'), true);
  const file = await http.get(owner, `/app/o/${orgId}/dnevnik/PRODAGBI.TXT?period=${period}`);
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-type') ?? '', /windows-1251/);
  const saft = await (await http.get(owner, `/app/o/${orgId}/saf-t`)).text();
  assert.doesNotMatch(saft, /Проверява се с инструментите на НАП/);
  await setReviewOrgs('');
  assert.equal(await orgHasFeature(orgId, 'saf-t'), false);
});

test('витрината: рекламните страници не са публикувани; цените показват „проверява се“', async () => {
  for (const path of ['/saf-t', '/en/saf-t', '/dnevnitsi-po-dds', '/en/vat-ledgers']) {
    const res = await fetch(`${http.origin}${path}`);
    assert.equal(res.status, 404, path);
  }
  const home = await (await fetch(`${http.origin}/`)).text();
  assert.doesNotMatch(home, /href="\/saf-t"/);
  assert.doesNotMatch(home, /href="\/dnevnitsi-po-dds"/);
  const pricing = await (await fetch(`${http.origin}/ceni`)).text();
  assert.match(pricing, /Проверява се с инструментите на НАП/);
  assert.match(pricing, /Дневници по ДДС/);
});
