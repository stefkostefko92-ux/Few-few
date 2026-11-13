import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient, type Session } from './http.js';

prepareTestDatabase();
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { createServer } = await import('../../src/server.js');

/** SPEC 42–44: контрагенти, артикули, серии — през HTTP, с правата и с издаването. */
const PASSWORD = 'дълга-и-трудна-парола-2026';
let http: HttpClient;
let owner: Session;
let viewer: Session;
let orgId = '';

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  const reg = await register({
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
  });
  orgId = reg.organizationId;
  // Няколко серии са в по-голям план (безплатният е с една).
  await prisma.subscription.updateMany({
    where: { organizationId: orgId },
    data: { planCode: 'pro' },
  });
  const viewerUser = await prisma.user.create({
    data: {
      email: 'viewer@example.test',
      name: 'Само Чете',
      passwordHash: (await prisma.user.findUniqueOrThrow({ where: { id: reg.userId } }))
        .passwordHash,
    },
  });
  await prisma.membership.create({
    data: { userId: viewerUser.id, organizationId: orgId, role: 'VIEWER' },
  });
  http = await startHttp(createServer);
  owner = await http.login('owner@example.test', PASSWORD);
  viewer = await http.login('viewer@example.test', PASSWORD);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

const party = {
  kind: 'CUSTOMER',
  name: 'Хлебозавод Изгрев АД',
  eik: '200000015',
  vatNumber: 'bg 200000015',
  countryCode: 'bg',
  addressStreet: 'бул. „България“ 10',
  addressCity: 'София',
  postalCode: '1000',
  email: '',
};

test('контрагент: невалиден ЕИК → 400; валиден — записан, търси се, редакция, архив', async () => {
  const bad = await http.post(owner, `/app/o/${orgId}/kontragenti/nov`, {
    ...party,
    eik: '123456789',
  });
  assert.equal(bad.status, 400);
  assert.ok((await bad.text()).includes('ЕИК е невалиден'));

  const created = await http.post(owner, `/app/o/${orgId}/kontragenti/nov`, party);
  assert.equal(created.status, 303);
  const row = await prisma.party.findFirstOrThrow({ where: { organizationId: orgId } });
  assert.equal(row.vatNumber, 'BG200000015');
  assert.equal(row.countryCode, 'BG');
  assert.equal(row.eAddressScheme, '9926');

  const found = await http.get(owner, `/app/o/${orgId}/kontragenti?q=изгрев`);
  assert.ok((await found.text()).includes('Хлебозавод Изгрев АД'));
  const byEik = await http.get(owner, `/app/o/${orgId}/kontragenti?q=2000000`);
  assert.ok((await byEik.text()).includes('Хлебозавод Изгрев АД'));

  const edited = await http.post(owner, `/app/o/${orgId}/kontragenti/${row.id}`, {
    ...party,
    addressCity: 'Пловдив',
  });
  assert.equal(edited.status, 303);
  assert.equal(
    (await prisma.party.findUniqueOrThrow({ where: { id: row.id } })).addressCity,
    'Пловдив',
  );

  const archived = await http.post(owner, `/app/o/${orgId}/kontragenti/${row.id}/arhiv`, {
    archived: '1',
  });
  assert.equal(archived.status, 303);
  const active = await http.get(owner, `/app/o/${orgId}/kontragenti`);
  assert.ok(!(await active.text()).includes('Хлебозавод Изгрев АД'));
  await http.post(owner, `/app/o/${orgId}/kontragenti/${row.id}/arhiv`, { archived: '0' });
});

test('VIEWER не вижда и не пипа каталога; чужд контрагент е 404', async () => {
  for (const path of ['kontragenti', 'artikuli', 'serii']) {
    assert.equal((await http.get(viewer, `/app/o/${orgId}/${path}`)).status, 404, path);
  }
  assert.equal((await http.post(viewer, `/app/o/${orgId}/kontragenti/nov`, party)).status, 404);
  assert.equal(
    (await http.get(owner, `/app/o/${orgId}/kontragenti/clxxxxxxxxxxxxxxxxxxxxxxx`)).status,
    404,
  );
});

test('артикул: цена без float, категория и ставка в съгласие', async () => {
  const wrongRate = await http.post(owner, `/app/o/${orgId}/artikuli/nov`, {
    name: 'Хляб',
    unitCode: 'C62',
    netPrice: '1,25',
    vatCategory: 'Z',
    vatRate: '20',
  });
  assert.equal(wrongRate.status, 400);
  const ok = await http.post(owner, `/app/o/${orgId}/artikuli/nov`, {
    name: 'Хляб „Добруджа“',
    unitCode: 'C62',
    netPrice: '1,255',
    vatCategory: 'S',
    vatRate: '9',
  });
  assert.equal(ok.status, 303);
  const item = await prisma.item.findFirstOrThrow({ where: { organizationId: orgId } });
  assert.equal(item.netPrice, '1.255');
  assert.equal(item.vatRate, '9');
});

test('серии: застъпване → отказ; основната се свива, новата влиза в освободеното', async () => {
  const main = await prisma.documentSeries.findFirstOrThrow({ where: { organizationId: orgId } });
  const overlap = await http.post(owner, `/app/o/${orgId}/serii/nova`, {
    name: 'Втора',
    rangeStart: '5000000000',
    rangeEnd: '5999999999',
  });
  assert.equal(overlap.status, 400);
  assert.ok((await overlap.text()).includes('застъпва'));

  const shrink = await http.post(owner, `/app/o/${orgId}/serii/${main.id}`, {
    name: main.name,
    rangeStart: String(main.rangeStart),
    rangeEnd: '4999999999',
  });
  assert.equal(shrink.status, 303);
  const second = await http.post(owner, `/app/o/${orgId}/serii/nova`, {
    name: 'Втора',
    rangeStart: '5000000000',
    rangeEnd: '5999999999',
  });
  assert.equal(second.status, 303);
  const two = await prisma.documentSeries.findFirstOrThrow({
    where: { organizationId: orgId, name: 'Втора' },
  });
  assert.equal(two.nextNumber, 5000000000n);
  assert.equal(two.isDefault, false);

  const def = await http.post(owner, `/app/o/${orgId}/serii/${two.id}/osnovna`, {});
  assert.equal(def.status, 303);
  assert.equal(
    await prisma.documentSeries.count({ where: { organizationId: orgId, isDefault: true } }),
    1,
  );
  // Серията по подразбиране не се трие.
  const del = await http.post(owner, `/app/o/${orgId}/serii/${two.id}/iztrii`, {});
  assert.equal(del.status, 400);
});

test('издаване: контрагентът попълва получателя; „Запази получателя“ създава контрагент веднъж', async () => {
  const stored = await prisma.party.findFirstOrThrow({ where: { organizationId: orgId } });
  const form = await http.get(owner, `/app/o/${orgId}/nov?party=${stored.id}`);
  const html = await form.text();
  assert.ok(html.includes('value="Хлебозавод Изгрев АД"'));
  assert.ok(html.includes('value="BG200000015"'));

  const series = await prisma.documentSeries.findFirstOrThrow({
    where: { organizationId: orgId, isDefault: true },
  });
  const issue = (name: string, eik: string) =>
    http.post(owner, `/app/o/${orgId}/nov`, {
      typeCode: '380',
      seriesId: series.id,
      issueDate: '2026-11-13',
      taxPointDate: '2026-11-13',
      dueDate: '2026-11-27',
      currency: 'EUR',
      'buyer[name]': name,
      'buyer[legalId]': eik,
      'buyer[street]': 'ул. „Шипка“ 1',
      'buyer[city]': 'София',
      'buyer[postalCode]': '1000',
      'buyer[countryCode]': 'BG',
      'lines[0][name]': 'Хляб',
      'lines[0][quantity]': '10',
      'lines[0][unitCode]': 'C62',
      'lines[0][netPrice]': '1.25',
      'lines[0][category]': 'S',
      'lines[0][rate]': '9',
      saveBuyer: 'on',
    });
  const first = await issue('Сладкарница Роза ЕООД', '121604974');
  assert.equal(first.status, 303, await first.text());
  const second = await issue('Сладкарница Роза ЕООД', '121604974');
  assert.equal(second.status, 303);
  assert.equal(await prisma.party.count({ where: { organizationId: orgId, eik: '121604974' } }), 1);
  // Документът пази своето копие: промяна на контрагента не пипа издаденото.
  const saved = await prisma.party.findFirstOrThrow({ where: { eik: '121604974' } });
  await prisma.party.update({ where: { id: saved.id }, data: { name: 'Ново Име ЕООД' } });
  const doc = await prisma.document.findFirstOrThrow({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'asc' },
  });
  assert.equal(doc.buyerName, 'Сладкарница Роза ЕООД');
});
