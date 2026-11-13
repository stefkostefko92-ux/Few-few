import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';

prepareTestDatabase();
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { inviteOwnerByFirm, acceptTransferInvite, createTransferInvite, TransferError } =
  await import('../../src/accounts/transfer.js');
const { revokeOwnership, ownershipReviewQueue, confirmOwnerReview, OwnershipError } =
  await import('../../src/accounts/ownership.js');
const { processOutbox } = await import('../../src/mail/outbox.js');
const { issueDocument } = await import('../../src/documents/issue.js');
const { domestic } = await import('../fixtures/einvoice-samples.js');
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
  await prisma.documentSeries.create({
    data: {
      organizationId: clientId,
      name: 'Основна',
      rangeStart: 1n,
      rangeEnd: 9_999_999_999n,
      nextNumber: 1n,
      isDefault: true,
    },
  });
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

const isTransfer = (code: string) => (error: unknown) =>
  error instanceof TransferError && error.code === code;

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
  assert.equal(queue.total, 1);
  assert.deepEqual(
    queue.items.map((item) => [item.organizationId, item.firmName]),
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

test('отнемане: членове вън, пълномощни чакащи, изгледът нулиран; кантората не си връща фирмата', async () => {
  await prisma.organization.update({ where: { id: clientId }, data: { verifiedAt: new Date() } });
  // Изгледът на PDF, сложен от отнетия собственик (напр. чуждо лого), не остава.
  await prisma.pdfStyle.create({
    data: { organizationId: clientId, template: 'band', accent: '#1f3a93' },
  });
  const oldOwner = await prisma.membership.findFirstOrThrow({
    where: { organizationId: clientId, role: 'OWNER' },
  });
  const result = await revokeOwnership({
    organizationId: clientId,
    actorId: masterId,
    reason: 'disputed',
  });
  assert.deepEqual(result, {
    removedMembers: 1,
    suspendedMandates: 1,
    revokedInvites: 0,
    pdfStyleReset: 1,
  });
  assert.equal(await prisma.membership.count({ where: { organizationId: clientId } }), 0);
  assert.equal(await prisma.pdfStyle.count({ where: { organizationId: clientId } }), 0);
  const mandate = await prisma.clientMandate.findFirstOrThrow({ where: { clientId } });
  assert.equal(mandate.status, 'PENDING');
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: clientId } });
  assert.equal(org.verifiedAt, null);
  assert.ok(org.ownershipLockedAt);
  const log = await prisma.auditLog.findFirstOrThrow({
    where: { action: 'organization.ownership.revoked', organizationId: clientId },
  });
  assert.equal(log.actorId, masterId);
  assert.deepEqual(log.details, {
    reason: 'disputed',
    removedMembers: 1,
    suspendedMandates: 1,
    revokedInvites: 0,
    pdfStyleReset: 1,
  });
  assert.deepEqual(await ownershipReviewQueue(), { items: [], total: 0 });

  // Издаване, започнало със стария достъп (сесия отпреди отнемането), не минава.
  const series = await prisma.documentSeries.findFirstOrThrow({
    where: { organizationId: clientId },
  });
  const { seller: _seller, number: _number, ...request } = domestic;
  await assert.rejects(
    issueDocument(
      { organizationId: clientId, role: 'OWNER', viaFirmId: null, mandateId: null },
      oldOwner.userId,
      { ...request, seriesId: series.id },
    ),
  );

  // Кантората не може да си върне фирмата с нова покана — до решението на мастъра кани само той.
  await assert.rejects(
    prisma.$transaction((tx) =>
      inviteOwnerByFirm(tx, {
        firmId: firm.organizationId,
        clientId,
        email: 'third-email@example.test',
        actorId: firm.userId,
      }),
    ),
    isTransfer('locked'),
  );
  const invite = await createTransferInvite({
    organizationId: clientId,
    email: 'real-owner@example.test',
    actorId: masterId,
  });
  await acceptTransferInvite({
    token: invite.token,
    user: { name: 'Истински Собственик', password: 'истинската-парола-2026' },
  });
  const owned = await prisma.organization.findUniqueOrThrow({ where: { id: clientId } });
  assert.equal(owned.ownershipLockedAt, null);
  // Собственик, поканен от мастъра, не е „за проверка“.
  assert.equal(owned.ownerReviewPendingAt, null);
});

test('фирма с вече потвърдено пълномощно пак влиза в „за проверка“, когато кантората покани собственик', async () => {
  const org = await prisma.organization.create({
    data: {
      kind: 'COMPANY',
      legalName: 'Пивоварна Хмел ООД',
      eik: '200000015',
      addressStreet: 'ул. „Шипка“ 9',
      addressCity: 'София',
      postalCode: '1000',
      createdByFirmId: firm.organizationId,
      // Мастърът е одобрил писменото пълномощно → фирмата е потвърдена (mandates.ts).
      verifiedAt: new Date(),
    },
  });
  await prisma.clientMandate.create({
    data: {
      firmId: firm.organizationId,
      clientId: org.id,
      status: 'ACTIVE',
      documentRef: 'Пълномощно № 2',
      validFrom: new Date('2026-11-01T00:00:00Z'),
    },
  });
  const { token } = await prisma.$transaction((tx) =>
    inviteOwnerByFirm(tx, {
      firmId: firm.organizationId,
      clientId: org.id,
      email: 'hmel-owner@example.test',
      actorId: firm.userId,
    }),
  );
  await acceptTransferInvite({
    token,
    user: { name: 'Хмел Собственик', password: 'горчивото-пиво-се-вари-бавно' },
  });
  const queue = await ownershipReviewQueue();
  assert.ok(queue.items.some((item) => item.organizationId === org.id));
  await confirmOwnerReview({ organizationId: org.id, actorId: masterId });
  const after = await ownershipReviewQueue();
  assert.ok(!after.items.some((item) => item.organizationId === org.id));
  const confirmed = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
  assert.equal(confirmed.ownerReviewPendingAt, null);
  assert.ok(confirmed.verifiedAt);
  await assert.rejects(
    confirmOwnerReview({ organizationId: org.id, actorId: masterId }),
    (error: unknown) => error instanceof OwnershipError && error.code === 'nothingToConfirm',
  );
});

test('отказ: фирма без собственик, кантора, непозната фирма, невалидна причина', async () => {
  const fresh = await prisma.organization.create({
    data: {
      kind: 'COMPANY',
      legalName: 'Без Собственик ЕООД',
      eik: '200000027',
      addressStreet: 'ул. „Шипка“ 4',
      addressCity: 'София',
      postalCode: '1000',
    },
  });
  const isCode = (code: string) => (error: unknown) =>
    error instanceof OwnershipError && error.code === code;
  await assert.rejects(
    revokeOwnership({ organizationId: fresh.id, actorId: masterId, reason: 'mistake' }),
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
