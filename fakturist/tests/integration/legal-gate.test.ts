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
const { masterHandover } = await import('../../src/accounts/handover.js');
const { LEGAL_DOCUMENTS } = await import('../../src/legal/documents.js');
const { pendingLegal } = await import('../../src/legal/pending.js');
const { generateTotpSecret, totpCodeAt, totpStep } = await import('../../src/auth/totp.js');
const { encryptTotpSecret } = await import('../../src/auth/keys.js');

/**
 * SPEC 92: човек без приетите текущи версии (общите условия; за собственика — и договора за обработване за
 * всяка своя фирма) влиза в приложението само през „Актуалните условия“. Може да откаже и да си тръгне с
 * данните: „Сигурност“, езикът, износът и прекратяването остават отворени.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const OLD = '2026-11-13.3';
const secret = generateTotpSecret();
let http: HttpClient;
let ownerId = '';
let orgId = '';
let masterId = '';

const current = (document: 'terms' | 'privacy' | 'dpa') => LEGAL_DOCUMENTS[document].version;

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  const company = await register({
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
  ownerId = company.userId;
  orgId = company.organizationId;
  const master = await prisma.user.create({
    data: {
      email: 'master@example.test',
      name: 'Мастър',
      passwordHash: await hashPassword(PASSWORD),
      platformRole: 'MASTER',
    },
  });
  masterId = master.id;
  await prisma.user.update({
    where: { id: masterId },
    data: { totpSecretEnc: encryptTotpSecret(secret, masterId), totpEnabledAt: new Date() },
  });
  http = await startHttp(createServer);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

test('с приетите текущи версии — нищо не пречи', async () => {
  assert.deepEqual(await pendingLegal(ownerId), { terms: false, companies: [] });
  const owner = await http.login('owner@example.test', PASSWORD);
  assert.equal((await http.get(owner, '/app')).status, 200);
});

test('стара версия: всяка страница води към условията; „Сигурност“, износът и прекратяването — отворени', async () => {
  await prisma.legalAcceptance.updateMany({ where: { userId: ownerId }, data: { version: OLD } });
  const pending = await pendingLegal(ownerId);
  assert.equal(pending.terms, true);
  assert.deepEqual(
    pending.companies.map((c) => c.id),
    [orgId],
  );
  const owner = await http.login('owner@example.test', PASSWORD);
  const home = await http.get(owner, `/app/o/${orgId}`);
  assert.equal(home.status, 303);
  assert.equal(
    home.headers.get('location'),
    `/app/usloviya?next=${encodeURIComponent(`/app/o/${orgId}`)}`,
  );
  const issue = await http.post(owner, `/app/o/${orgId}/nov`, {});
  assert.equal(issue.status, 303, 'и записите');
  assert.match(issue.headers.get('location') ?? '', /^\/app\/usloviya/);
  for (const open of [
    '/app/sigurnost',
    `/app/o/${orgId}/prekratyavane`,
    `/app/o/${orgId}/iznos.zip`,
  ]) {
    const res = await http.get(owner, open);
    assert.ok(!(res.headers.get('location') ?? '').startsWith('/app/usloviya'), open);
  }
  const page = await http.get(owner, '/app/usloviya');
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Пекарна Зора ЕООД/);
  assert.match(html, /name="acceptTerms"/);
  assert.doesNotMatch(html, /name="acceptTerms"[^>]*checked/, 'отметката не идва отметната');

  const refused = await http.post(owner, '/app/usloviya', { next: `/app/o/${orgId}` });
  assert.equal(refused.status, 400);
  const accepted = await http.post(owner, '/app/usloviya', {
    acceptTerms: 'on',
    next: `/app/o/${orgId}`,
  });
  assert.equal(accepted.status, 303);
  assert.equal(accepted.headers.get('location'), `/app/o/${orgId}`);
  for (const document of ['terms', 'dpa', 'privacy'] as const) {
    assert.equal(
      await prisma.legalAcceptance.count({
        where: { userId: ownerId, organizationId: orgId, document, version: current(document) },
      }),
      1,
      document,
    );
  }
  assert.deepEqual(await pendingLegal(ownerId), { terms: false, companies: [] });
  assert.equal((await http.get(owner, `/app/o/${orgId}`)).status, 200);
});

test('`next` е само вътрешен адрес в приложението', async () => {
  await prisma.legalAcceptance.updateMany({ where: { userId: ownerId }, data: { version: OLD } });
  const owner = await http.login('owner@example.test', PASSWORD);
  const res = await http.post(owner, '/app/usloviya', {
    acceptTerms: 'on',
    next: '//evil.example/app',
  });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/app');
});

test('собственик, създаден от мастъра, приема при първия вход — за себе си и за фирмата', async () => {
  const other = await register({
    kind: 'company',
    name: 'Стоян Петров',
    email: 'stoyan@example.test',
    password: PASSWORD,
    acceptTerms: 'on',
    legalName: 'Мелница Злато ООД',
    eik: '123456786',
    addressStreet: 'ул. „Христо Ботев“ 5',
    addressCity: 'Перник',
    postalCode: '2300',
  });
  await prisma.user.update({ where: { id: masterId }, data: { totpLastStep: null } });
  await masterHandover({
    organizationId: other.organizationId,
    actorId: masterId,
    code: totpCodeAt(secret, totpStep(Math.floor(Date.now() / 1000))),
    reason: 'Удостоверение за актуално състояние',
    target: {
      kind: 'person',
      email: 'nov@example.test',
      name: 'Нов Собственик',
      keepOldOwner: false,
    },
  });
  const created = await prisma.user.findUniqueOrThrow({ where: { email: 'nov@example.test' } });
  // Паролата — както след връзката „Нова парола“.
  await prisma.user.update({
    where: { id: created.id },
    data: { passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date() },
  });
  const pending = await pendingLegal(created.id);
  assert.equal(pending.terms, true);
  assert.deepEqual(
    pending.companies.map((c) => c.legalName),
    ['Мелница Злато ООД'],
  );
  const session = await http.login('nov@example.test', PASSWORD);
  const res = await http.get(session, `/app/o/${other.organizationId}`);
  assert.match(res.headers.get('location') ?? '', /^\/app\/usloviya/);
  await http.post(session, '/app/usloviya', { acceptTerms: 'on' });
  assert.equal(
    await prisma.legalAcceptance.count({
      where: { userId: created.id, organizationId: other.organizationId, document: 'dpa' },
    }),
    1,
  );
  assert.equal((await http.get(session, `/app/o/${other.organizationId}`)).status, 200);
});

test('член (не собственик) приема само общите условия; мастърът не се спира', async () => {
  const admin = await prisma.user.create({
    data: {
      email: 'admin@example.test',
      name: 'Админ',
      passwordHash: await hashPassword(PASSWORD),
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.membership.create({
    data: { userId: admin.id, organizationId: orgId, role: 'ADMIN' },
  });
  assert.deepEqual(await pendingLegal(admin.id), { terms: true, companies: [] });
  const session = await http.login('admin@example.test', PASSWORD);
  assert.match((await http.get(session, '/app')).headers.get('location') ?? '', /^\/app\/usloviya/);
  const page = await (await http.get(session, '/app/usloviya')).text();
  assert.doesNotMatch(page, /от името на/, 'членът не приема договора от името на фирмата');
  await http.post(session, '/app/usloviya', { acceptTerms: 'on' });
  assert.equal(
    await prisma.legalAcceptance.count({
      where: { userId: admin.id, document: 'terms', version: current('terms') },
    }),
    1,
  );
  assert.equal(
    await prisma.legalAcceptance.count({ where: { userId: admin.id, document: 'dpa' } }),
    0,
  );
  assert.equal((await http.get(session, '/app')).status, 200);

  assert.deepEqual(await pendingLegal(masterId), { terms: false, companies: [] });
});
