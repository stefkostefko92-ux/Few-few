import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';

prepareTestDatabase();
delete process.env['SMTP_HOST'];
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { invalidateSettings } = await import('../../src/admin/settings.js');
const { activatePayment, createOrder, quotePlan, BillingError } =
  await import('../../src/billing/orders.js');

/**
 * Ревюто на Кодаджията върху прихващането (13.11.2026): кредитът важи към датата на плащането (с
 * гратис 7 дни за банковия превод), а не към датата на поръчката; платеният план на кантората не се
 * „удължава“ от безплатния ѝ 100-годишен абонамент.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const DAY = 86_400_000;
const base = {
  password: PASSWORD,
  acceptTerms: 'on',
  addressStreet: 'ул. „Витоша“ 1',
  addressCity: 'София',
  postalCode: '1000',
} as const;
let masterId = '';

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  masterId = (
    await prisma.user.create({
      data: { email: 'm@example.test', name: 'Мастър', passwordHash: 'x', platformRole: 'MASTER' },
    })
  ).id;
  const supplier = await register({
    ...base,
    kind: 'company',
    name: 'Стефан Костадинов',
    email: 'supplier@example.test',
    legalName: 'Карбон Стелт ЕООД',
    eik: '208725180',
    vatNumber: 'BG208725180',
  });
  await prisma.organization.update({
    where: { id: supplier.organizationId },
    data: { iban: 'BG80BNBG96611020345678', bic: 'BNBGBGSF' },
  });
  await prisma.setting.upsert({
    where: { key: 'billing.supplierOrgId' },
    create: { key: 'billing.supplierOrgId', value: supplier.organizationId },
    update: { value: supplier.organizationId },
  });
  invalidateSettings();
});

after(async () => {
  await prisma.$disconnect();
});

test('кредитът важи към датата на плащането: превод много по-късно — при мастъра; до 7 дни — минава', async () => {
  const shop = await register({
    ...base,
    kind: 'company',
    name: 'Анна Борисова',
    email: 'late@example.test',
    legalName: 'Пекарна Изгрев ЕООД',
    eik: '175000168',
  });
  const orgId = shop.organizationId;
  const pro = await createOrder({
    organizationId: orgId,
    actorId: masterId,
    planCode: 'pro',
    interval: 'YEAR',
    method: 'transfer',
  });
  await activatePayment({ paymentId: pro.paymentId, paidAt: new Date(Date.now() - 5 * DAY) });
  const upgrade = await createOrder({
    organizationId: orgId,
    actorId: masterId,
    planCode: 'business',
    interval: 'YEAR',
    method: 'transfer',
  });
  assert.ok(upgrade.quote.creditCents > 8000, 'почти цялата година');
  // Ползва стария план и превежда месеци по-късно — кредитът за изтеклото време не се дава.
  await assert.rejects(
    activatePayment({ paymentId: upgrade.paymentId, paidAt: new Date(Date.now() + 8 * DAY) }),
    (error: unknown) => error instanceof BillingError && error.code === 'creditStale',
  );
  const still = await prisma.payment.findUniqueOrThrow({ where: { id: upgrade.paymentId } });
  assert.equal(still.status, 'PENDING', 'отказът не пипа поръчката');
  // Обичайният превод (до 7 дни) минава.
  const done = await activatePayment({
    paymentId: upgrade.paymentId,
    paidAt: new Date(Date.now() + 6 * DAY),
  });
  assert.equal(done.activated, true);
});

test('кантора: платеният „Кантора“ тръгва от плащането, не след безплатния 100-годишен; после годишен с кредит', async () => {
  const firm = await register({
    ...base,
    kind: 'accountant',
    name: 'Калина Колева',
    email: 'firm@example.test',
    legalName: 'Счетоводна кантора Колева ЕООД',
    eik: '175000175',
  });
  const firmId = firm.organizationId;
  for (let i = 0; i < 4; i += 1) {
    const client = await prisma.organization.create({
      data: {
        kind: 'COMPANY',
        legalName: `Клиент ${i} ЕООД`,
        addressStreet: 'ул. 1',
        addressCity: 'София',
        postalCode: '1000',
      },
    });
    await prisma.clientMandate.create({
      data: {
        firmId,
        clientId: client.id,
        status: 'ACTIVE',
        documentRef: `пълномощно ${i}`,
        validFrom: new Date(),
      },
    });
  }
  const month = await quotePlan(firmId, 'firm', 'MONTH');
  assert.equal(month.netCents, 400, 'една фирма над включените три');
  assert.equal(month.creditCents, 0, 'безплатният абонамент не носи кредит');
  const order = await createOrder({
    organizationId: firmId,
    actorId: masterId,
    planCode: 'firm',
    interval: 'MONTH',
    method: 'transfer',
  });
  const paidAt = new Date();
  await activatePayment({ paymentId: order.paymentId, paidAt });
  const active = await prisma.subscription.findFirstOrThrow({
    where: { organizationId: firmId, status: 'ACTIVE' },
  });
  assert.equal(active.currentPeriodStart.toISOString(), paidAt.toISOString());
  assert.ok(active.currentPeriodEnd.getUTCFullYear() < 2100, 'платен месец, не след 100 години');
  const year = await quotePlan(firmId, 'firm', 'YEAR');
  assert.ok(year.creditCents > 0 && year.creditCents <= 400, 'кредитът е до платеното');
  assert.equal(year.netCents, 4800 - year.creditCents);
});
