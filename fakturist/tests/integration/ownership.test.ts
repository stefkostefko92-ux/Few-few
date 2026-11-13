import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';

prepareTestDatabase();
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { inviteOwnerByFirm, acceptTransferInvite, createTransferInvite } =
  await import('../../src/accounts/transfer.js');
const { revokeOwnership, ownershipReviewQueue, OwnershipError } =
  await import('../../src/accounts/ownership.js');
const { processOutbox } = await import('../../src/mail/outbox.js');
type Message = import('../../src/mail/mailer.js').MailMessage;

/**
 * Остатъчният риск от поканата на кантора (SECURITY.md): кантора може да създаде нова фирма и да покани
 * свой втори имейл. Мастърът я вижда „за проверка“ и може да отнеме собствеността (SPEC 30–31).
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
let masterId = '';
let firm = { userId: '', organizationId: '' };
let clientId = '';

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  masterId = (
    await prisma.user.create({
      data: {
        email: 'master@example.test',
        name: 'Мастър',
        passwordHash: 'x',
        platformRole: 'MASTER',
      },
    })
  ).id;
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
  const org = await prisma.organization.create({
    data: {
      kind: 'COMPANY',
      legalName: 'Пекарна Зора ЕООД',
      eik: '131063188',
      addressStreet: 'ул. „Раковски“ 2',
      addressCity: 'Перник',
      postalCode: '2300',
      createdByFirmId: firm.organizationId,
    },
  });
  clientId = org.id;
  await prisma.clientMandate.create({
    data: {
      firmId: firm.organizationId,
      clientId,
      status: 'PENDING',
      documentRef: 'Пълномощно № 1',
      validFrom: new Date('2026-11-01T00:00:00Z'),
    },
  });
});

after(async () => {
  await prisma.$disconnect();
});

test('собственик, поканен от кантора: фирмата е за проверка, мастърът получава писмо', async () => {
  const { token } = await prisma.$transaction((tx) =>
    inviteOwnerByFirm(tx, {
      firmId: firm.organizationId,
      clientId,
      email: 'second-email@example.test',
      actorId: firm.userId,
    }),
  );
  await acceptTransferInvite({
    token,
    user: { name: 'Втори Имейл', password: 'съвсем-друга-парола-2026' },
    confirmMandate: true,
  });
  const queue = await ownershipReviewQueue();
  assert.deepEqual(
    queue.map((item) => [item.organizationId, item.firmName]),
    [[clientId, 'Кантора Баланс ООД']],
  );
  const sent: Message[] = [];
  await processOutbox(async (message) => {
    sent.push(message);
  });
  const review = sent.find((m) => m.to === 'master@example.test');
  assert.ok(review, 'писмо до мастъра');
  assert.ok(
    review.text.includes('Пекарна Зора ЕООД') && review.text.includes('Кантора Баланс ООД'),
  );
  assert.ok(review.text.includes(`/admin/r/organizations/${clientId}`));
  assert.ok(!review.text.includes('second-email@example.test'));
});

test('отнемане на собствеността: членове вън, пълномощни чакащи, покани отменени, фирмата непотвърдена', async () => {
  await prisma.organization.update({ where: { id: clientId }, data: { verifiedAt: new Date() } });
  const result = await revokeOwnership({
    organizationId: clientId,
    actorId: masterId,
    reason: 'disputed',
  });
  assert.deepEqual(result, { removedMembers: 1, suspendedMandates: 1, revokedInvites: 0 });
  assert.equal(await prisma.membership.count({ where: { organizationId: clientId } }), 0);
  const mandate = await prisma.clientMandate.findFirstOrThrow({ where: { clientId } });
  assert.equal(mandate.status, 'PENDING');
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: clientId } });
  assert.equal(org.verifiedAt, null);
  const log = await prisma.auditLog.findFirstOrThrow({
    where: { action: 'organization.ownership.revoked', organizationId: clientId },
  });
  assert.equal(log.actorId, masterId);
  assert.deepEqual(log.details, {
    reason: 'disputed',
    removedMembers: 1,
    suspendedMandates: 1,
    revokedInvites: 0,
  });
  // Вече не е „за проверка“ (няма собственик), а мастърът може да покани истинския собственик.
  assert.deepEqual(await ownershipReviewQueue(), []);
  const invite = await createTransferInvite({
    organizationId: clientId,
    email: 'real-owner@example.test',
    actorId: masterId,
  });
  assert.ok(invite.token);
});

test('отказ: фирма без собственик, кантора, непозната фирма, невалидна причина', async () => {
  const isCode = (code: string) => (error: unknown) =>
    error instanceof OwnershipError && error.code === code;
  await assert.rejects(
    revokeOwnership({ organizationId: clientId, actorId: masterId, reason: 'mistake' }),
    isCode('noOwner'),
  );
  await assert.rejects(
    revokeOwnership({ organizationId: firm.organizationId, actorId: masterId, reason: 'mistake' }),
    isCode('notCompany'),
  );
  await assert.rejects(
    revokeOwnership({
      organizationId: 'clxxxxxxxxxxxxxxxxxxxxxxx',
      actorId: masterId,
      reason: 'other',
    }),
    isCode('notFound'),
  );
  await assert.rejects(
    // @ts-expect-error — причината е от затворен списък
    revokeOwnership({ organizationId: clientId, actorId: masterId, reason: 'nope' }),
    isCode('invalidReason'),
  );
});
