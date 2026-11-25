import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';

prepareTestDatabase();
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { updateCompanyProfile, changeCompanyEik, ProfileError } =
  await import('../../src/accounts/company-profile.js');
const { generateTotpSecret, totpCodeAt, totpStep } = await import('../../src/auth/totp.js');
const { encryptTotpSecret } = await import('../../src/auth/keys.js');

/**
 * SPEC 82–83: данните на фирмата сменя собственикът (и мастърът); ЕИК — само мастърът с 2FA и основание.
 * Издадените документи не се пипат — доставчикът е записан във входа им при издаване.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const secret = generateTotpSecret();
let ownerId = '';
let orgId = '';
let masterId = '';

const isCode = (code: string) => (error: unknown) =>
  error instanceof ProfileError && error.code === code;

async function code(): Promise<string> {
  await prisma.user.update({ where: { id: masterId }, data: { totpLastStep: null } });
  return totpCodeAt(secret, totpStep(Math.floor(Date.now() / 1000)));
}

const profile = {
  legalName: 'Пекарна Зора 2 ЕООД',
  addressStreet: 'бул. „България“ 10',
  addressCity: 'Перник',
  postalCode: '2304',
  vatNumber: 'BG131063188',
  iban: 'BG80 BNBG 9661 1020 3456 78',
  bic: 'BNBGBGSD',
  bankName: 'Българска народна банка',
  email: 'office@example.test',
  phone: '+359 888 123 456',
};

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
  masterId = (
    await prisma.user.create({
      data: {
        email: 'master@example.test',
        name: 'Мастър',
        passwordHash: 'x',
        platformRole: 'MASTER',
        totpEnabledAt: new Date(),
      },
    })
  ).id;
  await prisma.user.update({
    where: { id: masterId },
    data: { totpSecretEnc: encryptTotpSecret(secret, masterId) },
  });
});

after(async () => {
  await prisma.$disconnect();
});

test('собственикът сменя данните; одит със сменените полета', async () => {
  await updateCompanyProfile({
    organizationId: orgId,
    actor: { userId: ownerId, master: false },
    input: profile,
  });
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  assert.equal(org.legalName, profile.legalName);
  assert.equal(org.iban, 'BG80BNBG96611020345678');
  assert.equal(org.vatNumber, 'BG131063188');
  assert.equal(org.email, 'office@example.test');
  assert.equal(org.eik, '131063188', 'ЕИК не се сменя оттук');
  const entry = await prisma.auditLog.findFirstOrThrow({
    where: { organizationId: orgId, action: 'organization.profile.updated' },
  });
  const fields = (entry.details as { fields: string[] }).fields;
  assert.ok(fields.includes('legalName') && fields.includes('iban'));
  assert.ok(!fields.includes('eik'));
});

test('отказ: администратор, ДДС номер на друг ЕИК, невалиден IBAN, Peppol, прекратена фирма', async () => {
  const admin = await prisma.user.create({
    data: { email: 'admin@example.test', name: 'Админ', passwordHash: 'x' },
  });
  await prisma.membership.create({
    data: { userId: admin.id, organizationId: orgId, role: 'ADMIN' },
  });
  const as = (userId: string, input: Record<string, string>) =>
    updateCompanyProfile({
      organizationId: orgId,
      actor: { userId, master: false },
      input: { ...profile, ...input },
    });
  await assert.rejects(as(admin.id, {}), isCode('notOwner'));
  await assert.rejects(as(ownerId, { vatNumber: 'BG121604974' }), isCode('invalid'));
  await assert.rejects(as(ownerId, { iban: 'DE89370400440532013000' }), isCode('invalid'));

  await prisma.peppolParticipant.create({
    data: { organizationId: orgId, partyId: '9926:BG131063188', status: 'ACTIVE' },
  });
  await assert.rejects(as(ownerId, { vatNumber: '' }), isCode('peppolActive'));
  await as(ownerId, { phone: '+359 888 000 000' }); // без смяна на ДДС номера — минава
  await prisma.peppolParticipant.deleteMany({ where: { organizationId: orgId } });

  await prisma.organization.update({ where: { id: orgId }, data: { terminatedAt: new Date() } });
  await assert.rejects(as(ownerId, {}), isCode('terminated'));
  await prisma.organization.update({ where: { id: orgId }, data: { terminatedAt: null } });
});

test('мастърът сменя данните без собственик; ЕИК — само с 2FA и основание, свободен', async () => {
  await updateCompanyProfile({
    organizationId: orgId,
    actor: { userId: masterId, master: true },
    input: { ...profile, legalName: 'Пекарна Зора 3 ЕООД' },
  });
  assert.equal(
    (await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })).legalName,
    'Пекарна Зора 3 ЕООД',
  );
  await prisma.organization.create({
    data: {
      kind: 'COMPANY',
      legalName: 'Друга ЕООД',
      eik: '123456786',
      addressStreet: 'ул. 1',
      addressCity: 'София',
      postalCode: '1000',
    },
  });
  const base = { organizationId: orgId, actorId: masterId, reason: 'Пререгистрация в ТР' };
  await assert.rejects(
    changeCompanyEik({ ...base, eik: '987654322', code: '000000' }),
    isCode('code'),
  );
  await assert.rejects(
    changeCompanyEik({ ...base, eik: '987654322', code: await code(), reason: 'а' }),
    isCode('reason'),
  );
  await assert.rejects(
    changeCompanyEik({ ...base, eik: '123456789', code: await code() }),
    isCode('invalidEik'),
  );
  await assert.rejects(
    changeCompanyEik({ ...base, eik: '123456786', code: await code() }),
    isCode('eikTaken'),
  );
  await changeCompanyEik({ ...base, eik: '987654322', code: await code() });
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  assert.equal(org.eik, '987654322');
  assert.equal(org.vatNumber, 'BG987654322', 'ДДС номерът следва ЕИК');
  assert.equal(
    await prisma.notification.count({
      where: { kind: 'org.eikChanged', toEmail: 'owner@example.test' },
    }),
    1,
  );
  assert.equal(
    await prisma.auditLog.count({
      where: { organizationId: orgId, action: 'organization.eik.changed' },
    }),
    1,
  );
});

test('Разбивача: собственик „за проверка“ не сменя данните; ЕИК не се сменя при Peppol (освен изключена)', async () => {
  await prisma.organization.update({
    where: { id: orgId },
    data: { ownerReviewPendingAt: new Date() },
  });
  await assert.rejects(
    updateCompanyProfile({
      organizationId: orgId,
      actor: { userId: ownerId, master: false },
      input: { ...profile, iban: 'BG18RZBB91550123456789' },
    }),
    isCode('reviewPending'),
  );
  await prisma.organization.update({ where: { id: orgId }, data: { ownerReviewPendingAt: null } });

  const current = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  await prisma.peppolParticipant.create({
    data: { organizationId: orgId, partyId: `9926:${current.vatNumber}`, status: 'FAILED' },
  });
  // FAILED може да е записан при доставчика — и тогава първо изключване.
  await assert.rejects(
    updateCompanyProfile({
      organizationId: orgId,
      actor: { userId: ownerId, master: false },
      input: { ...profile, vatNumber: '' },
    }),
    isCode('peppolActive'),
  );
  const base = {
    organizationId: orgId,
    actorId: masterId,
    reason: 'Поправка на грешно вписан ЕИК',
  };
  await assert.rejects(
    changeCompanyEik({ ...base, eik: '112233440', code: await code() }),
    isCode('peppolActive'),
  );
  await prisma.peppolParticipant.updateMany({
    where: { organizationId: orgId },
    data: { status: 'REMOVED' },
  });
  await changeCompanyEik({ ...base, eik: '112233440', code: await code() });
  await prisma.peppolParticipant.deleteMany({ where: { organizationId: orgId } });
});
