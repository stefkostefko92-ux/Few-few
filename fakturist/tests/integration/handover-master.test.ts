import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';

prepareTestDatabase();
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { masterHandover, HandoverError } = await import('../../src/accounts/handover.js');
const { generateTotpSecret, totpCodeAt, totpStep } = await import('../../src/auth/totp.js');
const { encryptTotpSecret } = await import('../../src/auth/keys.js');
const { verifyPassword } = await import('../../src/auth/password.js');

/**
 * SPEC 87: мастърът предава веднага — с 2FA кода и основание; на човек (съществуващ или нов профил;
 * старият собственик остава администратор или излиза) или на кантора по ЕИК.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const EIKS = ['131063188', '123456786', '987654322', '112233440', '556677881', '998877668'];
const secret = generateTotpSecret();
let masterId = '';
let n = 0;
let firm = { userId: '', organizationId: '' };

/** Кодът минава веднъж (стъпката се записва) — тестът нулира записаната стъпка преди всеки опит. */
async function code(): Promise<string> {
  await prisma.user.update({ where: { id: masterId }, data: { totpLastStep: null } });
  return totpCodeAt(secret, totpStep(Math.floor(Date.now() / 1000)));
}

async function company() {
  const i = n++;
  const email = `owner${i}@example.test`;
  const { userId, organizationId } = await register({
    kind: 'company',
    name: 'Иван Петров',
    email,
    password: PASSWORD,
    acceptTerms: 'on',
    legalName: `Пекарна ${i} ЕООД`,
    eik: EIKS[i]!,
    addressStreet: 'ул. „Раковски“ 2',
    addressCity: 'Перник',
    postalCode: '2300',
  });
  return { ownerId: userId, orgId: organizationId, email };
}

const role = async (userId: string, organizationId: string) =>
  (
    await prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { role: true },
    })
  )?.role ?? null;

const isCode = (c: string) => (error: unknown) =>
  error instanceof HandoverError && error.code === c;

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  const master = await prisma.user.create({
    data: {
      email: 'master@example.test',
      name: 'Мастър',
      passwordHash: 'x',
      platformRole: 'MASTER',
    },
  });
  masterId = master.id;
  await prisma.user.update({
    where: { id: masterId },
    data: { totpSecretEnc: encryptTotpSecret(secret, masterId), totpEnabledAt: new Date() },
  });
  firm = await register({
    kind: 'accountant',
    name: 'Цвета Колева',
    email: 'firm@example.test',
    password: PASSWORD,
    acceptTerms: 'on',
    legalName: 'Кантора Баланс ООД',
    eik: '121604974',
    addressStreet: 'ул. „Шипка“ 1',
    addressCity: 'София',
    postalCode: '1000',
  });
});

after(async () => {
  await prisma.$disconnect();
});

test('без валиден 2FA код или без основание — отказ, нищо не се сменя', async () => {
  const { ownerId, orgId } = await company();
  const target = { kind: 'person' as const, email: 'x@example.test', keepOldOwner: true };
  const base = { organizationId: orgId, actorId: masterId, target };
  await assert.rejects(
    masterHandover({ ...base, code: '000000', reason: 'Документ № 5' }),
    isCode('code'),
  );
  await assert.rejects(
    masterHandover({ ...base, code: await code(), reason: 'а' }),
    isCode('reason'),
  );
  assert.equal(await role(ownerId, orgId), 'OWNER');
});

test('на съществуващ профил: веднага собственик, старият остава администратор; „за проверка“ и заключването падат', async () => {
  const { ownerId, orgId, email } = await company();
  const next = await prisma.user.create({
    data: { email: 'naslednik@example.test', name: 'Наследник', passwordHash: 'x' },
  });
  await prisma.organization.update({
    where: { id: orgId },
    data: { ownerReviewPendingAt: new Date(), ownershipLockedAt: new Date() },
  });
  await masterHandover({
    organizationId: orgId,
    actorId: masterId,
    code: await code(),
    reason: 'Решение на съдружниците от 10.11.2026',
    target: { kind: 'person', email: 'NASLEDNIK@example.test', keepOldOwner: true },
  });
  assert.equal(await role(next.id, orgId), 'OWNER');
  assert.equal(await role(ownerId, orgId), 'ADMIN');
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  assert.equal(org.ownerReviewPendingAt, null);
  assert.equal(org.ownershipLockedAt, null);
  for (const to of [email, 'naslednik@example.test']) {
    assert.equal(
      await prisma.notification.count({ where: { kind: 'handover.master', toEmail: to } }),
      1,
      to,
    );
  }
  const entry = await prisma.auditLog.findFirstOrThrow({
    where: { organizationId: orgId, action: 'organization.handover.master' },
  });
  assert.equal(entry.actorId, masterId);
});

test('на нов имейл без профил: профил без използваема парола + връзка „нова парола“; старият излиза', async () => {
  const { ownerId, orgId } = await company();
  const result = await masterHandover({
    organizationId: orgId,
    actorId: masterId,
    code: await code(),
    reason: 'Изгубен достъп, документ за представителство',
    target: { kind: 'person', email: 'nov@example.test', keepOldOwner: false },
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'nov@example.test' } });
  assert.equal(result.userId, user.id);
  assert.equal(await verifyPassword('', user.passwordHash), false);
  assert.equal(
    await prisma.userToken.count({ where: { userId: user.id, purpose: 'PASSWORD_RESET' } }),
    1,
  );
  assert.equal(await role(user.id, orgId), 'OWNER');
  assert.equal(await role(ownerId, orgId), null);
});

test('на кантора по ЕИК: пълномощно се създава, членовете излизат, кантората води фирмата', async () => {
  const { ownerId, orgId } = await company();
  await assert.rejects(
    masterHandover({
      organizationId: orgId,
      actorId: masterId,
      code: await code(),
      reason: 'Молба на собственика',
      target: { kind: 'firm', eik: '131063188' },
    }),
    isCode('notFirm'),
  );
  await masterHandover({
    organizationId: orgId,
    actorId: masterId,
    code: await code(),
    reason: 'Молба на собственика',
    target: { kind: 'firm', eik: '121604974' },
  });
  assert.equal(await role(ownerId, orgId), null);
  const mandate = await prisma.clientMandate.findUniqueOrThrow({
    where: { firmId_clientId: { firmId: firm.organizationId, clientId: orgId } },
  });
  assert.equal(mandate.status, 'ACTIVE');
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  assert.equal(org.createdByFirmId, firm.organizationId);
});
