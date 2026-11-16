import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient } from './http.js';

prepareTestDatabase();
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { createServer } = await import('../../src/server.js');
const { hashPassword } = await import('../../src/auth/password.js');

/**
 * SPEC 84–86 през HTTP: „Собственост“ вижда само прекият собственик; формите връщат грешката на страницата;
 * кантората вижда предложението на началото си и го приема.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
let http: HttpClient;
let orgId = '';
let firmId = '';

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  const base = {
    password: PASSWORD,
    acceptTerms: 'on' as const,
    addressStreet: 'ул. „Раковски“ 2',
    addressCity: 'Перник',
    postalCode: '2300',
  };
  const company = await register({
    ...base,
    kind: 'company',
    name: 'Иван Петров',
    email: 'owner@example.test',
    legalName: 'Пекарна Зора ЕООД',
    eik: '131063188',
  });
  orgId = company.organizationId;
  const firm = await register({
    ...base,
    kind: 'accountant',
    name: 'Цвета Колева',
    email: 'firm@example.test',
    legalName: 'Кантора Баланс ООД',
    eik: '121604974',
  });
  firmId = firm.organizationId;
  await prisma.clientMandate.create({
    data: {
      firmId,
      clientId: orgId,
      status: 'ACTIVE',
      documentRef: 'Пълномощно № 1',
      validFrom: new Date('2026-11-01T00:00:00Z'),
    },
  });
  const admin = await prisma.user.create({
    data: {
      email: 'admin@example.test',
      name: 'Админ',
      passwordHash: await hashPassword(PASSWORD),
    },
  });
  await prisma.membership.create({
    data: { userId: admin.id, organizationId: orgId, role: 'ADMIN' },
  });
  http = await startHttp(createServer);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

test('страницата и менюто — само за прекия собственик; грешната парола се връща на страницата', async () => {
  const owner = await http.login('owner@example.test', PASSWORD);
  const page = await http.get(owner, `/app/o/${orgId}/sobstvenost`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Кантора Баланс ООД/, 'кантората с действащо пълномощно е в списъка');
  assert.match(await (await http.get(owner, `/app/o/${orgId}`)).text(), /sobstvenost/);

  const admin = await http.login('admin@example.test', PASSWORD);
  assert.equal((await http.get(admin, `/app/o/${orgId}/sobstvenost`)).status, 404);
  assert.doesNotMatch(await (await http.get(admin, `/app/o/${orgId}`)).text(), /sobstvenost/);
  assert.equal(
    (
      await http.post(admin, `/app/o/${orgId}/sobstvenost/chovek`, {
        email: 'x@example.test',
        password: PASSWORD,
      })
    ).status,
    404,
  );

  const wrong = await http.post(owner, `/app/o/${orgId}/sobstvenost/chovek`, {
    email: 'nov@example.test',
    password: 'грешна',
  });
  assert.match(wrong.headers.get('location') ?? '', /err=password/);
  const sent = await http.post(owner, `/app/o/${orgId}/sobstvenost/chovek`, {
    email: 'nov@example.test',
    password: PASSWORD,
  });
  assert.match(sent.headers.get('location') ?? '', /ok=person/);
  assert.match(
    await (await http.get(owner, `/app/o/${orgId}/sobstvenost`)).text(),
    /nov@example\.test/,
  );
  const cancelled = await http.post(owner, `/app/o/${orgId}/sobstvenost/otmeni`, {});
  assert.match(cancelled.headers.get('location') ?? '', /ok=cancelled/);
});

test('предложение към кантората: вижда го на началото си и го приема', async () => {
  const owner = await http.login('owner@example.test', PASSWORD);
  const proposed = await http.post(owner, `/app/o/${orgId}/sobstvenost/kantora`, {
    firmId,
    password: PASSWORD,
  });
  assert.match(proposed.headers.get('location') ?? '', /ok=firm/);
  const firm = await http.login('firm@example.test', PASSWORD);
  const home = await (await http.get(firm, '/app')).text();
  const action = /action="(\/app\/o\/[^"]+\/predlozheniya\/[^"]+\/priemi)"/.exec(home)?.[1];
  assert.ok(action, 'предложението е на началото на кантората');
  const accepted = await http.post(firm, action, {});
  assert.match(accepted.headers.get('location') ?? '', /handover=accepted/);
  assert.equal(await prisma.membership.count({ where: { organizationId: orgId } }), 0);
  // Бившият собственик вече няма достъп до фирмата.
  assert.equal((await http.get(owner, `/app/o/${orgId}`)).status, 404);
});
