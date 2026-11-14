import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient } from './http.js';

prepareTestDatabase();
delete process.env['SMTP_HOST'];
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { createServer } = await import('../../src/server.js');
const { inviteMember, acceptMemberInvite, MemberError } =
  await import('../../src/accounts/members.js');
const { createSeries, SeriesError } = await import('../../src/catalog/series.js');
const { decryptMemberInviteToken } = await import('../../src/auth/keys.js');

/**
 * Ограниченията на плана (одитът на парите, 13.11.2026): потребителите по `maxUsers` (членове и отворени
 * покани, и при приемане след смяна на плана), втора серия само с „няколко серии“, кантора без платен
 * абонамент — до включените фирми-клиенти.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
let http: HttpClient;
let company = { userId: '', organizationId: '' };
let firm = { userId: '', organizationId: '' };

const base = {
  password: PASSWORD,
  acceptTerms: 'on' as const,
  addressStreet: 'ул. „Раковски“ 2',
  addressCity: 'Перник',
  postalCode: '2300',
};

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  company = await register({
    ...base,
    kind: 'company',
    name: 'Иван Петров',
    email: 'owner@example.test',
    legalName: 'Пекарна Зора ЕООД',
    eik: '131063188',
  });
  firm = await register({
    ...base,
    kind: 'accountant',
    name: 'Цвета Колева',
    email: 'firm@example.test',
    legalName: 'Кантора Баланс ООД',
    eik: '121604974',
  });
  http = await startHttp(createServer);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

const setPlan = (organizationId: string, planCode: string) =>
  prisma.subscription.updateMany({ where: { organizationId }, data: { planCode } });
const owner = () => ({ userId: company.userId, role: 'OWNER' as const });
const isCode = (Kind: typeof MemberError | typeof SeriesError, code: string) => (error: unknown) =>
  error instanceof Kind && error.code === code;

test('безплатен (1 потребител): собственикът не кани; „Професионален“ (5) — до 4 покани', async () => {
  await assert.rejects(
    inviteMember({
      organizationId: company.organizationId,
      actor: owner(),
      email: 'a1@example.test',
      role: 'ISSUER',
    }),
    isCode(MemberError, 'limit'),
  );
  assert.equal(await prisma.memberInvite.count(), 0);
  await setPlan(company.organizationId, 'pro');
  for (const n of [1, 2, 3, 4]) {
    await inviteMember({
      organizationId: company.organizationId,
      actor: owner(),
      email: `a${n}@example.test`,
      role: 'ISSUER',
    });
  }
  await assert.rejects(
    inviteMember({
      organizationId: company.organizationId,
      actor: owner(),
      email: 'a5@example.test',
      role: 'ISSUER',
    }),
    isCode(MemberError, 'limit'),
    'собственикът + 4 отворени покани = 5',
  );
});

test('план, сменен на по-малък след поканата — приемането спира на тавана', async () => {
  const invite = await prisma.memberInvite.findFirstOrThrow({
    where: { organizationId: company.organizationId, email: 'a1@example.test' },
  });
  const mail = await prisma.notification.findFirstOrThrow({
    where: { kind: 'member.invite', payload: { path: ['inviteId'], equals: invite.id } },
  });
  const payload = mail.payload as { inviteId: string; tokenEnc: string };
  const token = decryptMemberInviteToken(payload.tokenEnc, payload.inviteId);
  await setPlan(company.organizationId, 'free');
  await assert.rejects(
    acceptMemberInvite({ token, user: { name: 'Първи Издаващ', password: PASSWORD } }),
    isCode(MemberError, 'limit'),
  );
  assert.equal(
    await prisma.membership.count({ where: { organizationId: company.organizationId } }),
    1,
  );
});

test('втора серия — само с „няколко серии“ в плана', async () => {
  // Основната заема целия обхват — свива се, за да има място за втора.
  await prisma.documentSeries.updateMany({
    where: { organizationId: company.organizationId },
    data: { rangeEnd: 4_999_999_999n },
  });
  const second = () =>
    createSeries({
      organizationId: company.organizationId,
      actorId: company.userId,
      data: { name: 'Втора', rangeStart: 5_000_000_000n, rangeEnd: 5_999_999_999n },
    });
  await assert.rejects(second(), isCode(SeriesError, 'plan'));
  await setPlan(company.organizationId, 'pro');
  await second();
  assert.equal(
    await prisma.documentSeries.count({ where: { organizationId: company.organizationId } }),
    2,
  );
});

test('кантора без платен абонамент: до 3 фирми-клиенти; повторна заявка за същата не се брои', async () => {
  const session = await http.login('firm@example.test', PASSWORD);
  const add = (eik: string, legalName: string) =>
    http.post(session, `/app/o/${firm.organizationId}/klienti/nov`, {
      legalName,
      eik,
      addressStreet: 'ул. „Самуил“ 3',
      addressCity: 'Перник',
      postalCode: '2300',
      documentRef: 'Пълномощно № 1',
      validFrom: '2026-11-01',
      processorDeclaration: 'on',
    });
  for (const [eik, name] of [
    ['175074752', 'Клиент Едно ЕООД'],
    ['200000002', 'Клиент Две ЕООД'],
    ['200000015', 'Клиент Три ЕООД'],
  ] as const) {
    const res = await add(eik, name);
    assert.equal(res.status, 303, `${eik}: ${res.status}`);
  }
  const fourth = await add('200000027', 'Клиент Четири ЕООД');
  assert.equal(fourth.status, 400);
  assert.match(await fourth.text(), /поръчайте плана/);
  assert.equal(await prisma.clientMandate.count({ where: { firmId: firm.organizationId } }), 3);
  const again = await add('200000015', 'Клиент Три ЕООД');
  assert.equal(again.status, 303, 'същата фирма — не е четвърта');
});
