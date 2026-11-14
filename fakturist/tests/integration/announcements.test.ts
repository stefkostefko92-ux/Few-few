import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';

prepareTestDatabase();
delete process.env['SMTP_HOST'];
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { generateTotpSecret, totpCodeAt, totpStep } = await import('../../src/auth/totp.js');
const { encryptTotpSecret } = await import('../../src/auth/keys.js');
const { sendAnnouncement, AnnouncementError, earliestEffective } =
  await import('../../src/admin/announcements.js');
const { composeOrgMail } = await import('../../src/mail/org-mail.js');
const { purgeLegalRecords, LEGAL_RETENTION_MS } = await import('../../src/legal/retention.js');
const { DAY } = await import('../../src/time.js');

/**
 * Каналът към клиентите (одитът на правния, M4) и сроковете на приетите условия и одита (политиката за
 * поверителност — 5 години).
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
let masterId = '';
let secret = '';
const orgs = { a: '', b: '' };

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
  orgs.a = (
    await register({
      ...base,
      kind: 'company',
      name: 'Иван Петров',
      email: 'owner@example.test',
      legalName: 'Пекарна Зора ЕООД',
      eik: '131063188',
    })
  ).organizationId;
  orgs.b = (
    await register({
      ...base,
      kind: 'company',
      name: 'Роза Иванова',
      email: 'roza@example.test',
      legalName: 'Сладкарница Роза ЕООД',
      eik: '121604974',
    })
  ).organizationId;
  // Изтрита (надгробие) — собственикът ѝ не получава.
  await prisma.organization.update({ where: { id: orgs.b }, data: { deletedAt: new Date() } });
  secret = generateTotpSecret();
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
});

after(async () => {
  await prisma.$disconnect();
});

const code = async () => {
  await prisma.user.update({ where: { id: masterId }, data: { totpLastStep: null } });
  return totpCodeAt(secret, totpStep(Math.floor(Date.now() / 1000)));
};
const isCode = (c: string) => (error: unknown) =>
  error instanceof AnnouncementError && error.code === c;

test('промяна в условията: поне 30 дни напред; грешен код — нищо не тръгва', async () => {
  const form = {
    kind: 'legal' as const,
    subject: 'Нова версия на общите условия',
    body: 'Сменяме т. 8 — нов подобработващ.\n\nПодробности на страницата с условията.',
    effectiveOn: '2026-11-20',
    confirm: 'on' as const,
    code: await code(),
  };
  await assert.rejects(
    sendAnnouncement({ actorId: masterId, form, today: '2026-11-14' }),
    isCode('effective'),
  );
  await assert.rejects(
    sendAnnouncement({
      actorId: masterId,
      form: { ...form, effectiveOn: earliestEffective('2026-11-14'), code: '000000' },
      today: '2026-11-14',
    }),
    isCode('code'),
  );
  assert.equal(await prisma.announcement.count(), 0);
  assert.equal(await prisma.notification.count({ where: { kind: 'org.notice' } }), 0);
});

test('пратено: по едно писмо на собственик/администратор на неизтрита фирма; записът и одитът остават', async () => {
  const result = await sendAnnouncement({
    actorId: masterId,
    form: {
      kind: 'incident',
      subject: 'Инцидент със сигурността на 14.11.2026',
      body: 'Какво се случи и какво направихме.\n\nКакво да направите вие: сменете паролата си.',
      effectiveOn: '',
      confirm: 'on',
      code: await code(),
    },
  });
  assert.equal(result.recipients, 1, 'само Зора — Роза е изтрита');
  const mails = await prisma.notification.findMany({ where: { kind: 'org.notice' } });
  assert.deepEqual(
    mails.map((m) => m.toEmail),
    ['owner@example.test'],
  );
  const stored = await prisma.announcement.findUniqueOrThrow({ where: { id: result.id } });
  assert.equal(stored.recipients, 1);
  assert.equal(await prisma.auditLog.count({ where: { action: 'announcement.sent' } }), 1);

  const mail = await composeOrgMail('org.notice', 'owner@example.test', mails[0]!.payload);
  assert.match(mail.subject, /Инцидент със сигурността/);
  assert.match(mail.text, /сменете паролата си/);
  assert.doesNotMatch(mail.html, /<script/);
});

test('сроковете: приетите условия и одитът — 5 години след закриване/изтриване', async () => {
  const now = new Date();
  const old = new Date(now.getTime() - LEGAL_RETENTION_MS - DAY);
  // Закрит профил преди повече от 5 години — личното приемане се трие, на работещата фирма — без човека.
  const closed = await prisma.user.create({
    data: {
      email: 'closed+old@fakturist.invalid',
      name: 'Закрит профил',
      passwordHash: 'x',
      disabledAt: old,
    },
  });
  const personal = await prisma.legalAcceptance.create({
    data: { userId: closed.id, document: 'privacy', version: '2026-11-13' },
  });
  const forOrg = await prisma.legalAcceptance.create({
    data: { userId: closed.id, organizationId: orgs.a, document: 'terms', version: '2026-11-13' },
  });
  // Изтрита преди повече от 5 години фирма — приетите ѝ условия и одитът ѝ се трият.
  await prisma.organization.update({ where: { id: orgs.b }, data: { deletedAt: old } });
  const before = await prisma.auditLog.count({ where: { organizationId: orgs.b } });
  assert.ok(before > 0);
  const recentAudit = await prisma.auditLog.count({ where: { organizationId: orgs.a } });

  const result = await purgeLegalRecords(now);
  assert.ok(result.acceptances >= 2);
  assert.equal(await prisma.legalAcceptance.count({ where: { id: personal.id } }), 0);
  assert.equal(
    (await prisma.legalAcceptance.findUniqueOrThrow({ where: { id: forOrg.id } })).userId,
    null,
  );
  assert.equal(await prisma.legalAcceptance.count({ where: { organizationId: orgs.b } }), 0);
  assert.equal(await prisma.auditLog.count({ where: { organizationId: orgs.b } }), 0);
  assert.equal(
    await prisma.auditLog.count({ where: { organizationId: orgs.a } }),
    recentAudit,
    'одитът на работещата фирма остава',
  );
  assert.ok((await prisma.legalAcceptance.count({ where: { organizationId: orgs.a } })) > 0);
});
