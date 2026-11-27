import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient } from './http.js';

/**
 * Сборовете за петъчния отчет (vpsdash → „Бизнесът тази седмица“). Числа, никога имена: отчетът
 * напуска сървъра (Telegram/имейл), затова в отговора няма наименование, ЕИК, купувач или имейл.
 * Седмицата: моментите — последните 7×24 часа; датите (плащане, напомняне) — 7 календарни дни до днес
 * по софийско време; просрочено — падеж преди днес.
 */
const TOKEN = 'c'.repeat(64);
process.env['INTERNAL_STATS_TOKEN'] = TOKEN;
prepareTestDatabase();
const { prisma } = await import('../../src/db.js');
const { weeklyStats } = await import('../../src/stats/weekly.js');
const { createServer } = await import('../../src/server.js');
const { DAY } = await import('../../src/time.js');
const { invalidateSettings } = await import('../../src/admin/settings.js');

const NOW = new Date('2026-11-27T15:00:00Z'); // петък, 17:00 в София
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
let supplierId = '';
let http: HttpClient;

async function org(name: string, eik: string, createdAt: Date) {
  return prisma.organization.create({
    data: {
      kind: 'COMPANY',
      legalName: name,
      eik,
      addressStreet: 'ул. 1',
      addressCity: 'София',
      postalCode: '1000',
      createdAt,
    },
  });
}

async function doc(organizationId: string, data: Record<string, unknown>) {
  return prisma.document.create({
    data: {
      organizationId,
      typeCode: '380',
      status: 'ISSUED',
      issueDate: day('2026-11-25'),
      input: {},
      buyerName: 'Купувач Тайнов ООД',
      buyerEik: '131468980',
      currency: 'EUR',
      ...data,
    },
  });
}

before(async () => {
  await truncateAll(prisma);
  const supplier = await org('Карбон Стелт ВКЦ', '206789011', ago(400));
  supplierId = supplier.id;
  await prisma.setting.create({ data: { key: 'billing.supplierOrgId', value: supplierId } });
  const fresh = await org('Нова Фирма ЕООД', '175074752', ago(2));
  await org('Стара Фирма АД', '121234567', ago(30));
  const gone = await org('Изтрита ЕООД', '000000019', ago(3));
  await prisma.organization.update({ where: { id: gone.id }, data: { deletedAt: ago(1) } });

  const plan = await prisma.plan.create({
    data: {
      code: 'start',
      audience: 'COMPANY',
      nameBg: 'Старт',
      nameEn: 'Start',
      features: [],
      priceMonthlyCents: 1500,
    },
  });
  const sub = (organizationId: string, extra: Record<string, unknown>) =>
    prisma.subscription.create({
      data: {
        organizationId,
        planCode: plan.code,
        currentPeriodStart: ago(1),
        currentPeriodEnd: ago(-29),
        ...extra,
      },
    });
  await sub(fresh.id, { createdAt: ago(1) });
  await sub(supplierId, { granted: true, createdAt: ago(100) });
  await sub(supplierId, { status: 'PAST_DUE', createdAt: ago(60) });

  const pay = (
    status: 'COMPLETED' | 'PENDING',
    amountCents: number,
    paidAt: Date | null,
    provider: 'REVOLUT' | 'MANUAL',
  ) =>
    prisma.payment.create({
      data: {
        organizationId: fresh.id,
        amountCents,
        status,
        paidAt,
        provider,
        netCents: 0,
        vatCents: 0,
      },
    });
  await pay('COMPLETED', 1800, ago(1), 'REVOLUT');
  await pay('COMPLETED', 21600, ago(6.9), 'MANUAL');
  await pay('COMPLETED', 9999, ago(8), 'REVOLUT'); // извън седмицата
  await pay('PENDING', 1800, null, 'MANUAL'); // чакащ превод

  // Документите на собствената фирма (Карбон Стелт).
  const inWeek = await doc(supplierId, {
    number: '0000000001',
    issuedAt: ago(2),
    taxInclusiveCents: 12000n,
    payableCents: 12000n,
    dueDate: day('2026-12-10'),
  });
  await doc(supplierId, {
    number: '0000000002',
    issuedAt: ago(3),
    taxInclusiveCents: 5000n,
    payableCents: 5000n,
    currency: 'BGN',
  });
  await doc(supplierId, {
    number: '0000000003',
    typeCode: '381',
    issuedAt: ago(1),
    taxInclusiveCents: 2000n,
    payableCents: 2000n,
  });
  await doc(supplierId, {
    number: '0000000004',
    status: 'CANCELLED',
    issuedAt: ago(1),
    taxInclusiveCents: 99900n,
  });
  await doc(supplierId, { number: '0000000005', issuedAt: ago(9), taxInclusiveCents: 7000n }); // извън седмицата
  // Просрочени: падеж преди днес, неплатени/частично; кредитираната не е дълг, платената — също.
  await doc(supplierId, {
    number: '0000000006',
    issuedAt: ago(40),
    payableCents: 30000n,
    paidCents: 10000n,
    paymentState: 'PARTIAL',
    dueDate: day('2026-11-20'),
  });
  const credited = await doc(supplierId, {
    number: '0000000007',
    issuedAt: ago(40),
    payableCents: 4000n,
    dueDate: day('2026-11-01'),
  });
  await doc(supplierId, {
    number: '0000000008',
    typeCode: '381',
    issuedAt: ago(35),
    precedingId: credited.id,
    payableCents: 4000n,
  });
  await doc(supplierId, {
    number: '0000000009',
    issuedAt: ago(40),
    payableCents: 1000n,
    paidCents: 1000n,
    paymentState: 'PAID',
    dueDate: day('2026-11-01'),
  });
  await doc(supplierId, {
    number: '0000000010',
    issuedAt: ago(5),
    taxInclusiveCents: 777n,
    payableCents: 777n,
    dueDate: day('2026-11-27'),
  }); // падеж днес — още не
  // Плащане по документ: в седмицата и извън нея.
  await prisma.documentPayment.create({
    data: { documentId: inWeek.id, amountCents: 6000n, paidOn: day('2026-11-26') },
  });
  await prisma.documentPayment.create({
    data: { documentId: inWeek.id, amountCents: 1n, paidOn: day('2026-11-20') },
  });
  // Чужда фирма: влиза в броя издадени за платформата, не и в книгите на Карбон Стелт.
  const other = await doc(fresh.id, {
    number: '0000000001',
    issuedAt: ago(1),
    taxInclusiveCents: 500000n,
  });
  await prisma.paymentReminder.create({
    data: { documentId: other.id, step: 3, sentOn: day('2026-11-24') },
  });
  await prisma.paymentReminder.create({
    data: { documentId: other.id, step: 10, sentOn: day('2026-11-19') },
  }); // извън

  http = await startHttp(createServer);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

test('платформата: фирми, абонаменти, плащания, издадени, напомняния — само в седмицата', async () => {
  const s = await weeklyStats(NOW);
  assert.equal(s.app, 'fakturist');
  assert.equal(s.window.fromDay, '2026-11-21');
  assert.equal(s.window.toDay, '2026-11-27');
  assert.deepEqual(s.platform.organizations, { total: 3, new: 1 });
  assert.deepEqual(s.platform.subscriptions, { paid: 1, granted: 1, pastDue: 1, new: 1 });
  assert.deepEqual(s.platform.payments, {
    completed: 2,
    completedCents: 23400,
    pendingTransfers: 1,
  });
  assert.equal(s.platform.documentsIssued, 5, 'издадени в седмицата (без анулирания и стария)');
  assert.equal(s.platform.remindersSent, 1);
});

test('книгите на собствената фирма: издадени по валута, кредитни, платени, просрочени', async () => {
  const s = await weeklyStats(NOW);
  assert.ok(s.supplier);
  assert.deepEqual(s.supplier.issued, { count: 3, cents: { EUR: 12777, BGN: 5000 } });
  assert.deepEqual(s.supplier.creditNotes, { count: 1, cents: { EUR: 2000 } });
  assert.deepEqual(s.supplier.paid, { cents: { EUR: 6000 } });
  assert.deepEqual(
    s.supplier.overdue,
    { count: 1, cents: { EUR: 20000 } },
    'частично платената: остатъкът',
  );
});

test('без настроена собствена фирма книгите са null, платформата остава', async () => {
  await prisma.setting.update({ where: { key: 'billing.supplierOrgId' }, data: { value: '' } });
  invalidateSettings();
  try {
    const s = await weeklyStats(NOW);
    assert.equal(s.supplier, null);
    assert.equal(s.platform.organizations.total, 3);
  } finally {
    await prisma.setting.update({
      where: { key: 'billing.supplierOrgId' },
      data: { value: supplierId },
    });
    invalidateSettings();
  }
});

test('HTTP: токен → 200 и нула имена; прокси → 404; без токен → 401', async () => {
  const ok = await fetch(`${http.origin}/internal/weekly`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  const body = await ok.text();
  for (const secret of ['Карбон', 'Купувач', '131468980', '206789011', 'Нова Фирма', '@']) {
    assert.ok(!body.includes(secret), `отговорът не съдържа „${secret}“`);
  }
  assert.equal(JSON.parse(body).app, 'fakturist');
  const proxied = await fetch(`${http.origin}/internal/weekly`, {
    headers: { authorization: `Bearer ${TOKEN}`, 'x-forwarded-for': '203.0.113.7' },
  });
  assert.equal(proxied.status, 404);
  assert.equal((await fetch(`${http.origin}/internal/weekly`)).status, 401);
});
