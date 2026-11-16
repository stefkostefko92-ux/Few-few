import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';

prepareTestDatabase();
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { inviteOwnerByFirm } = await import('../../src/accounts/transfer.js');
const { startFirmHandover, decideFirmHandover, handoverStatus, HandoverError } =
  await import('../../src/accounts/handover.js');
const { requestTermination } = await import('../../src/accounts/termination.js');
const { DAY } = await import('../../src/time.js');

/**
 * SPEC 86, 88: собственикът предава фирмата на кантора с действащо пълномощно; кантората приема или
 * отказва. При приемане собственикът и членовете излизат, а кантората води фирмата и може да покани
 * нов собственик.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const EIKS = ['131063188', '123456786', '987654322', '112233440', '556677881', '998877668'];
let n = 0;
let firm = { userId: '', organizationId: '' };
let otherFirm = { userId: '', organizationId: '' };

async function company(mandate: 'ACTIVE' | 'PENDING' | null = 'ACTIVE') {
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
  if (mandate) {
    await prisma.clientMandate.create({
      data: {
        firmId: firm.organizationId,
        clientId: organizationId,
        status: mandate,
        documentRef: 'Пълномощно № 1',
        validFrom: new Date('2026-11-01T00:00:00Z'),
      },
    });
  }
  return { ownerId: userId, orgId: organizationId, email };
}

const isCode = (code: string) => (error: unknown) =>
  error instanceof HandoverError && error.code === code;

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  const firmData = {
    kind: 'accountant' as const,
    name: 'Цвета Колева',
    password: PASSWORD,
    acceptTerms: 'on' as const,
    addressStreet: 'ул. „Шипка“ 1',
    addressCity: 'София',
    postalCode: '1000',
  };
  firm = await register({
    ...firmData,
    email: 'firm@example.test',
    legalName: 'Кантора Баланс ООД',
    eik: '121604974',
  });
  otherFirm = await register({
    ...firmData,
    email: 'firm2@example.test',
    legalName: 'Кантора Друга ООД',
    eik: '135792467',
  });
});

after(async () => {
  await prisma.$disconnect();
});

test('само кантора с действащо пълномощно; до решението на кантората нищо не се сменя', async () => {
  const { ownerId, orgId } = await company('ACTIVE');
  const status = await handoverStatus(orgId);
  assert.deepEqual(
    status.firms.map((f) => f.id),
    [firm.organizationId],
  );
  const base = { organizationId: orgId, actorId: ownerId, password: PASSWORD };
  await assert.rejects(
    startFirmHandover({ ...base, firmId: otherFirm.organizationId }),
    isCode('noMandate'),
  );
  await assert.rejects(
    startFirmHandover({ ...base, firmId: firm.organizationId, password: 'грешна' }),
    isCode('password'),
  );
  await startFirmHandover({ ...base, firmId: firm.organizationId });
  const proposal = await prisma.firmHandover.findFirstOrThrow({ where: { organizationId: orgId } });
  assert.equal(proposal.status, 'PENDING');
  assert.equal(
    await prisma.notification.count({
      where: { kind: 'handover.firmProposal', toEmail: 'firm@example.test' },
    }),
    1,
  );
  const owner = await prisma.membership.findFirst({
    where: { organizationId: orgId, role: 'OWNER' },
  });
  assert.equal(owner?.userId, ownerId);

  // Само кантора без действащо пълномощно — не: чакащото не стига.
  const pending = await company('PENDING');
  await assert.rejects(
    startFirmHandover({
      organizationId: pending.orgId,
      actorId: pending.ownerId,
      password: PASSWORD,
      firmId: firm.organizationId,
    }),
    isCode('noMandate'),
  );
});

test('кантората отказва — нищо не се сменя; приема — членовете излизат, тя води фирмата и кани собственик', async () => {
  const { ownerId, orgId, email } = await company('ACTIVE');
  const member = await prisma.user.create({
    data: { email: 'chlen@example.test', name: 'Член', passwordHash: 'x' },
  });
  await prisma.membership.create({
    data: { userId: member.id, organizationId: orgId, role: 'ISSUER' },
  });
  await prisma.apiKey.create({
    data: {
      organizationId: orgId,
      createdById: ownerId,
      name: 'Склад',
      prefix: 'fkt_test',
      keyHash: 'a'.repeat(64),
      scopes: ['read'],
    },
  });
  const base = {
    organizationId: orgId,
    actorId: ownerId,
    password: PASSWORD,
    firmId: firm.organizationId,
  };
  const first = await startFirmHandover(base);
  // Само собственик или администратор на кантората решава.
  await assert.rejects(
    decideFirmHandover({
      handoverId: first.id,
      firmId: firm.organizationId,
      actorId: member.id,
      accept: true,
    }),
    isCode('notAllowed'),
  );
  await decideFirmHandover({
    handoverId: first.id,
    firmId: firm.organizationId,
    actorId: firm.userId,
    accept: false,
  });
  assert.equal(
    (await prisma.firmHandover.findUniqueOrThrow({ where: { id: first.id } })).status,
    'DECLINED',
  );
  assert.equal(await prisma.membership.count({ where: { organizationId: orgId } }), 2);
  assert.equal(
    await prisma.notification.count({ where: { kind: 'handover.firmDeclined', toEmail: email } }),
    1,
  );

  const second = await startFirmHandover(base);
  // Правният Разбирач: без декларацията по т. 1а от договора за обработване кантората не поема фирмата.
  await assert.rejects(
    decideFirmHandover({
      handoverId: second.id,
      firmId: firm.organizationId,
      actorId: firm.userId,
      accept: true,
    }),
    isCode('declaration'),
  );
  assert.equal(await prisma.membership.count({ where: { organizationId: orgId } }), 2);
  const firmDeclarations = () =>
    prisma.legalAcceptance.count({
      where: { organizationId: orgId, document: 'dpa', userId: firm.userId },
    });
  assert.equal(await firmDeclarations(), 0);
  await decideFirmHandover({
    handoverId: second.id,
    firmId: firm.organizationId,
    actorId: firm.userId,
    accept: true,
    declaration: true,
  });
  assert.equal(await firmDeclarations(), 1, 'декларацията на кантората е записана за клиента');
  assert.equal(await prisma.membership.count({ where: { organizationId: orgId } }), 0);
  assert.equal(await prisma.apiKey.count({ where: { organizationId: orgId, revokedAt: null } }), 0);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  assert.equal(org.createdByFirmId, firm.organizationId);
  assert.equal(
    await prisma.notification.count({ where: { kind: 'handover.firmAccepted', toEmail: email } }),
    1,
  );
  // Кантората вече може да покани нов собственик.
  await prisma.$transaction((tx) =>
    inviteOwnerByFirm(tx, {
      firmId: firm.organizationId,
      clientId: orgId,
      email: 'nov-sobstvenik@example.test',
      actorId: firm.userId,
    }),
  );
  // Второ решение по същото предложение — отказ.
  await assert.rejects(
    decideFirmHandover({
      handoverId: second.id,
      firmId: firm.organizationId,
      actorId: firm.userId,
      accept: true,
      declaration: true,
    }),
    isCode('invalid'),
  );
});

test('изтекло предложение, оттеглено пълномощно или сменен собственик — отказ при приемане', async () => {
  const a = await company('ACTIVE');
  const base = (c: typeof a) => ({
    organizationId: c.orgId,
    actorId: c.ownerId,
    password: PASSWORD,
    firmId: firm.organizationId,
  });
  const decide = (id: string, now?: Date) =>
    decideFirmHandover({
      handoverId: id,
      firmId: firm.organizationId,
      actorId: firm.userId,
      accept: true,
      declaration: true,
      now,
    });
  const expired = await startFirmHandover(base(a));
  await assert.rejects(decide(expired.id, new Date(Date.now() + 8 * DAY)), isCode('expired'));

  const revoked = await startFirmHandover(base(a));
  await prisma.clientMandate.updateMany({
    where: { clientId: a.orgId },
    data: { status: 'REVOKED' },
  });
  await assert.rejects(decide(revoked.id), isCode('noMandate'));

  const b = await company('ACTIVE');
  const changed = await startFirmHandover(base(b));
  await prisma.membership.update({
    where: { userId_organizationId: { userId: b.ownerId, organizationId: b.orgId } },
    data: { role: 'ADMIN' },
  });
  await assert.rejects(decide(changed.id), isCode('invalid'));
});

test('прекратяване на фирмата отменя чакащото предложение', async () => {
  const { ownerId, orgId } = await company('ACTIVE');
  const proposal = await startFirmHandover({
    organizationId: orgId,
    actorId: ownerId,
    password: PASSWORD,
    firmId: firm.organizationId,
  });
  await requestTermination({
    organizationId: orgId,
    actor: { userId: ownerId, master: false },
    password: PASSWORD,
  });
  assert.equal(
    (await prisma.firmHandover.findUniqueOrThrow({ where: { id: proposal.id } })).status,
    'REVOKED',
  );
});
