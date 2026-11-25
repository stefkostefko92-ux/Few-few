import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';

prepareTestDatabase();
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { acceptTransferInvite, findOpenInvite, TransferError } =
  await import('../../src/accounts/transfer.js');
const { startPersonHandover, cancelHandover, HandoverError } =
  await import('../../src/accounts/handover.js');
const { generateTotpSecret, totpCodeAt, totpStep } = await import('../../src/auth/totp.js');
const { encryptTotpSecret } = await import('../../src/auth/keys.js');

/**
 * SPEC 84–85: собственикът предава фирмата на друг човек — паролата (и 2FA) + покана по имейл; до
 * приемането нищо не се сменя; приелият става собственик, предаващият остава администратор.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const EIKS = [
  '131063188',
  '123456786',
  '987654322',
  '112233440',
  '556677881',
  '998877668',
  '200000002',
  '200000015',
  '200000027',
];
let n = 0;

async function company(): Promise<{ ownerId: string; orgId: string; email: string }> {
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

const isCode = (code: string) => (error: unknown) =>
  error instanceof HandoverError && error.code === code;

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
});

after(async () => {
  await prisma.$disconnect();
});

test('паролата, покана, приемане с нов профил: новият е собственик, предаващият — администратор', async () => {
  const { ownerId, orgId, email } = await company();
  const input = { organizationId: orgId, actorId: ownerId, email: 'nov@example.test' };
  await assert.rejects(startPersonHandover({ ...input, password: 'грешна' }), isCode('password'));
  const { token } = await startPersonHandover({ ...input, password: PASSWORD });
  // До приемането нищо не се сменя.
  assert.equal(await role(ownerId, orgId), 'OWNER');
  const invite = await prisma.transferInvite.findFirstOrThrow({ where: { organizationId: orgId } });
  assert.equal(invite.fromUserId, ownerId);
  assert.equal(
    await prisma.notification.count({
      where: { kind: 'transfer.invite', toEmail: 'nov@example.test' },
    }),
    1,
  );
  assert.ok(await findOpenInvite(token), 'поканата е отворена, въпреки че фирмата има собственик');

  const result = await acceptTransferInvite({
    acceptTerms: true,
    token,
    user: { name: 'Мария Нова', password: 'друга-дълга-парола-2026' },
  });
  assert.equal(result.organizationId, orgId);
  assert.equal(await role(result.userId, orgId), 'OWNER');
  assert.equal(await role(ownerId, orgId), 'ADMIN');
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  assert.equal(org.ownerReviewPendingAt, null, 'предадена от собственика — не е „за проверка“');
  assert.equal(
    await prisma.notification.count({ where: { kind: 'handover.accepted', toEmail: email } }),
    1,
  );
  assert.equal(
    await prisma.auditLog.count({
      where: { organizationId: orgId, action: 'organization.handover.accepted' },
    }),
    1,
  );
  assert.equal(await findOpenInvite(token), null, 'връзката е еднократна');
});

test('член на фирмата приема с профила си — повишен до собственик, без второ членство', async () => {
  const { ownerId, orgId } = await company();
  const member = await prisma.user.create({
    data: { email: 'chlen@example.test', name: 'Член', passwordHash: 'x' },
  });
  await prisma.membership.create({
    data: { userId: member.id, organizationId: orgId, role: 'ISSUER' },
  });
  const { token } = await startPersonHandover({
    organizationId: orgId,
    actorId: ownerId,
    email: 'CHLEN@example.test',
    password: PASSWORD,
  });
  await acceptTransferInvite({ acceptTerms: true, token, user: { userId: member.id } });
  assert.equal(await role(member.id, orgId), 'OWNER');
  assert.equal(await role(ownerId, orgId), 'ADMIN');
  assert.equal(await prisma.membership.count({ where: { organizationId: orgId } }), 2);
});

test('отказ: не собственик, свой имейл, „за проверка“, прекратена фирма, невалиден имейл', async () => {
  const { ownerId, orgId, email } = await company();
  const admin = await prisma.user.create({
    data: { email: 'admin@example.test', name: 'Админ', passwordHash: 'x' },
  });
  await prisma.membership.create({
    data: { userId: admin.id, organizationId: orgId, role: 'ADMIN' },
  });
  const base = { organizationId: orgId, password: PASSWORD };
  await assert.rejects(
    startPersonHandover({ ...base, actorId: admin.id, email: 'x@example.test' }),
    isCode('notOwner'),
  );
  await assert.rejects(
    startPersonHandover({ ...base, actorId: ownerId, email: email.toUpperCase() }),
    isCode('sameUser'),
  );
  await assert.rejects(
    startPersonHandover({ ...base, actorId: ownerId, email: 'не-е-имейл' }),
    isCode('invalidEmail'),
  );
  await prisma.organization.update({
    where: { id: orgId },
    data: { ownerReviewPendingAt: new Date() },
  });
  await assert.rejects(
    startPersonHandover({ ...base, actorId: ownerId, email: 'x@example.test' }),
    isCode('reviewPending'),
  );
  await prisma.organization.update({
    where: { id: orgId },
    data: { ownerReviewPendingAt: null, terminatedAt: new Date() },
  });
  await assert.rejects(
    startPersonHandover({ ...base, actorId: ownerId, email: 'x@example.test' }),
    isCode('terminated'),
  );
});

test('с 2FA — без код или с грешен код отказ, с верния минава', async () => {
  const { ownerId, orgId } = await company();
  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: ownerId },
    data: { totpSecretEnc: encryptTotpSecret(secret, ownerId), totpEnabledAt: new Date() },
  });
  const input = {
    organizationId: orgId,
    actorId: ownerId,
    email: 'dvama@example.test',
    password: PASSWORD,
  };
  await assert.rejects(startPersonHandover(input), isCode('code'));
  await assert.rejects(startPersonHandover({ ...input, code: '000000' }), isCode('code'));
  const code = totpCodeAt(secret, totpStep(Math.floor(Date.now() / 1000)));
  await startPersonHandover({ ...input, code });
});

test('нова покана отменя старата; отменена или неактуална покана не дава собственост', async () => {
  const { ownerId, orgId } = await company();
  const base = { organizationId: orgId, actorId: ownerId, password: PASSWORD };
  const first = await startPersonHandover({ ...base, email: 'parvi@example.test' });
  const second = await startPersonHandover({ ...base, email: 'vtori@example.test' });
  assert.equal(await findOpenInvite(first.token), null);
  await assert.rejects(
    acceptTransferInvite({
      acceptTerms: true,
      token: first.token,
      user: { name: 'Първи', password: 'друга-дълга-парола-2026' },
    }),
    (error) => error instanceof TransferError && error.code === 'invalid',
  );
  assert.equal(await cancelHandover({ organizationId: orgId, actorId: ownerId }), 1);
  assert.equal(await findOpenInvite(second.token), null);

  // Предаващият е загубил собствеността преди приемането (напр. отнета от мастъра) — отказ.
  const third = await startPersonHandover({ ...base, email: 'treti@example.test' });
  await prisma.membership.update({
    where: { userId_organizationId: { userId: ownerId, organizationId: orgId } },
    data: { role: 'ADMIN' },
  });
  await assert.rejects(
    acceptTransferInvite({
      acceptTerms: true,
      token: third.token,
      user: { name: 'Трети', password: 'друга-дълга-парола-2026' },
    }),
    (error) => error instanceof TransferError && error.code === 'invalid',
  );
  assert.equal(
    await prisma.membership.count({ where: { organizationId: orgId, role: 'OWNER' } }),
    0,
  );
});

test('Разбивача: поканите за предаване — до 5 за 24 часа на фирма', async () => {
  const { ownerId, orgId } = await company();
  const base = { organizationId: orgId, actorId: ownerId, password: PASSWORD };
  for (let i = 0; i < 5; i += 1)
    await startPersonHandover({ ...base, email: `p${i}@example.test` });
  await assert.rejects(
    startPersonHandover({ ...base, email: 'p6@example.test' }),
    isCode('dailyLimit'),
  );
});

test('закрит профил на собственик: започнатите от него предавания отпадат', async () => {
  const { orgId } = await company();
  const { hashPassword } = await import('../../src/auth/password.js');
  const { closeAccount } = await import('../../src/accounts/close.js');
  const coOwner = await prisma.user.create({
    data: {
      email: 'saowner@example.test',
      name: 'Съсобственик',
      passwordHash: await hashPassword(PASSWORD),
    },
  });
  await prisma.membership.create({
    data: { userId: coOwner.id, organizationId: orgId, role: 'OWNER' },
  });
  const { token } = await startPersonHandover({
    organizationId: orgId,
    actorId: coOwner.id,
    email: 'naslednik@example.test',
    password: PASSWORD,
  });
  await closeAccount({ userId: coOwner.id, password: PASSWORD });
  assert.equal(await findOpenInvite(token), null);
  const invite = await prisma.transferInvite.findFirstOrThrow({
    where: { fromUserId: coOwner.id },
  });
  assert.ok(invite.revokedAt, 'отменена при закриването');
});
