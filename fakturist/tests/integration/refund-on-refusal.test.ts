import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';

prepareTestDatabase();
delete process.env['SMTP_HOST'];
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { hashPassword } = await import('../../src/auth/password.js');
const { requestTermination } = await import('../../src/accounts/termination.js');
const { composeMasterMail } = await import('../../src/mail/master-mail.js');
const { DAY } = await import('../../src/time.js');

/**
 * Общите условия, т. 11 и 15: собственик, който прекратява, без да е приел новата версия на условията
 * (SPEC 92), се отказва от нея — връщаме платеното за неизползвания период. Връщането е ръчно; мастърите
 * получават писмо с ориентировъчната сума, одитът пази причината (Правният Разбирач, 25.11.2026).
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const OLD_VERSION = '2026-11-13.3';
const NOW = new Date('2026-11-25T10:00:00Z');
const base = {
  password: PASSWORD,
  acceptTerms: 'on' as const,
  kind: 'company' as const,
  addressStreet: 'ул. „Раковски“ 2',
  addressCity: 'Перник',
  postalCode: '2300',
};

/** Платен месец: 10 дни ползван, 20 остават; 12,00 € платени. */
async function paidMonth(organizationId: string): Promise<void> {
  await prisma.subscription.updateMany({
    where: { organizationId, status: 'ACTIVE' },
    data: { status: 'CANCELLED' },
  });
  const start = new Date(NOW.getTime() - 10 * DAY);
  const subscription = await prisma.subscription.create({
    data: {
      organizationId,
      planCode: 'business',
      interval: 'MONTH',
      status: 'ACTIVE',
      currentPeriodStart: start,
      currentPeriodEnd: new Date(start.getTime() + 30 * DAY),
      provider: 'REVOLUT',
    },
  });
  await prisma.payment.create({
    data: {
      organizationId,
      subscriptionId: subscription.id,
      planCode: 'business',
      interval: 'MONTH',
      amountCents: 1200,
      netCents: 1000,
      vatCents: 200,
      reference: `FKT-REFUND-${organizationId.slice(-6)}`,
      provider: 'REVOLUT',
      status: 'COMPLETED',
      paidAt: start,
    },
  });
}

let refused = { orgId: '', userId: '' };
let accepted = { orgId: '', userId: '' };

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  await prisma.user.create({
    data: {
      email: 'master@example.test',
      name: 'Мастър',
      passwordHash: await hashPassword(PASSWORD),
      platformRole: 'MASTER',
    },
  });
  const a = await register({
    ...base,
    name: 'Иван Петров',
    email: 'owner@example.test',
    legalName: 'Пекарна Зора ЕООД',
    eik: '131063188',
  });
  const b = await register({
    ...base,
    name: 'Роза Иванова',
    email: 'roza@example.test',
    legalName: 'Сладкарница Роза ЕООД',
    eik: '121604974',
  });
  refused = { orgId: a.organizationId, userId: a.userId };
  accepted = { orgId: b.organizationId, userId: b.userId };
  await paidMonth(refused.orgId);
  await paidMonth(accepted.orgId);
  // Собственикът на първата още не е приел текущата версия.
  await prisma.legalAcceptance.updateMany({
    where: { userId: refused.userId },
    data: { version: OLD_VERSION },
  });
});

after(async () => {
  await prisma.$disconnect();
});

const refunds = (organizationId: string) =>
  prisma.notification.findMany({
    where: { kind: 'master.refund', payload: { path: ['organizationId'], equals: organizationId } },
  });

const terminatedAudit = (organizationId: string) =>
  prisma.auditLog.findFirstOrThrow({
    where: { action: 'org.terminated', organizationId },
  });

test('прекратяване без приети нови условия → писмо до мастъра с неизползваното, причината в одита', async () => {
  await requestTermination({
    organizationId: refused.orgId,
    actor: { userId: refused.userId, master: false },
    password: PASSWORD,
    now: NOW,
  });
  const notices = await refunds(refused.orgId);
  assert.equal(notices.length, 1);
  assert.equal(notices[0]!.toEmail, 'master@example.test');
  assert.equal(notices[0]!.organizationId, null, 'писмото на мастъра не се трие с фирмата');
  const payload = notices[0]!.payload as { reason: string; amountCents: number; paidCents: number };
  assert.equal(payload.reason, 'legalRefused');
  assert.equal(payload.paidCents, 1200);
  assert.equal(payload.amountCents, 800, '20 от 30 дни × 12,00 €, надолу до цент');
  const details = (await terminatedAudit(refused.orgId)).details as Record<string, unknown>;
  assert.equal(details['reason'], 'legal.refused');
  assert.equal(details['refundCents'], 800);

  const mail = await composeMasterMail('master.refund', 'master@example.test', notices[0]!.payload);
  assert.match(mail.subject, /Пекарна Зора ЕООД/);
  assert.match(mail.text, /т\. 11 и 15/);
  assert.match(mail.text, /ориентировъчно 8,00/);
});

test('прекратяване с приети условия → без писмо за връщане (платен период не се възстановява, т. 11)', async () => {
  await requestTermination({
    organizationId: accepted.orgId,
    actor: { userId: accepted.userId, master: false },
    password: PASSWORD,
    now: NOW,
  });
  assert.equal((await refunds(accepted.orgId)).length, 0);
  const details = (await terminatedAudit(accepted.orgId)).details as Record<string, unknown>;
  assert.equal(details['reason'], undefined);
});
