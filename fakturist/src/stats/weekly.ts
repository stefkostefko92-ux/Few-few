import { prisma } from '../db.js';
import { setting } from '../admin/settings.js';
import { PAYABLE_TYPES } from '../documents/payments.js';
import { DAY, sofiaToday } from '../time.js';

/**
 * Сборовете за петъчния отчет (vpsdash → „Бизнесът тази седмица“, `/internal/weekly`).
 *
 * Само числа — никога наименование, ЕИК, купувач или имейл: отчетът напуска сървъра (Telegram/имейл).
 * Седмицата: моментите (издаване, плащане на план, създаване) — последните 7×24 часа; датите без час
 * (плащане по документ, напомняне) — 7 календарни дни до днес включително, по софийско време;
 * просрочено — падеж ПРЕДИ днес. Парите — цели центове по валута, никога float.
 *
 * „Книгите“ са на собствената фирма — организацията от `billing.supplierOrgId` (тази, която издава
 * фактурите за плановете); без настройката те са null, а платформата остава.
 */
export interface Money {
  count: number;
  cents: Record<string, number>;
}

export interface WeeklyStats {
  app: 'fakturist';
  window: { from: string; to: string; fromDay: string; toDay: string };
  platform: {
    organizations: { total: number; new: number };
    subscriptions: { paid: number; granted: number; pastDue: number; new: number };
    payments: { completed: number; completedCents: number; pendingTransfers: number };
    documentsIssued: number;
    remindersSent: number;
  };
  supplier: null | {
    issued: Money;
    creditNotes: Money;
    paid: { cents: Record<string, number> };
    overdue: Money;
  };
}

/** BigInt/число от базата → безопасно цяло число (сборовете на седмица са далеч под 2^53). */
function int(value: bigint | number | null | undefined): number {
  const n = typeof value === 'bigint' ? Number(value) : (value ?? 0);
  if (!Number.isSafeInteger(n)) throw new Error('сборът излиза извън безопасните цели числа');
  return n;
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);
}

const dayStart = (iso: string) => new Date(`${iso}T00:00:00Z`);

export async function weeklyStats(now: Date = new Date()): Promise<WeeklyStats> {
  const from = new Date(now.getTime() - 7 * DAY);
  const toDay = sofiaToday(now);
  const fromDay = addDays(toDay, -6);
  const moments = { gte: from, lte: now };
  const days = { gte: dayStart(fromDay), lte: dayStart(toDay) };
  const alive = { deletedAt: null };

  const [
    orgTotal,
    orgNew,
    paid,
    granted,
    pastDue,
    subNew,
    payments,
    pendingTransfers,
    documentsIssued,
    remindersSent,
  ] = await Promise.all([
    prisma.organization.count({ where: alive }),
    prisma.organization.count({ where: { ...alive, createdAt: moments } }),
    prisma.subscription.count({ where: { status: 'ACTIVE', granted: false } }),
    prisma.subscription.count({ where: { status: 'ACTIVE', granted: true } }),
    prisma.subscription.count({ where: { status: 'PAST_DUE' } }),
    prisma.subscription.count({ where: { createdAt: moments } }),
    prisma.payment.aggregate({
      where: { status: 'COMPLETED', paidAt: moments },
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
    prisma.payment.count({ where: { status: 'PENDING', provider: 'MANUAL' } }),
    prisma.document.count({ where: { status: 'ISSUED', issuedAt: moments } }),
    prisma.paymentReminder.count({ where: { sentOn: days } }),
  ]);

  const supplierId = await setting('billing.supplierOrgId');
  return {
    app: 'fakturist',
    window: { from: from.toISOString(), to: now.toISOString(), fromDay, toDay },
    platform: {
      organizations: { total: orgTotal, new: orgNew },
      subscriptions: { paid, granted, pastDue, new: subNew },
      payments: {
        completed: payments._count._all,
        completedCents: int(payments._sum.amountCents),
        pendingTransfers,
      },
      documentsIssued,
      remindersSent,
    },
    supplier: supplierId ? await supplierBooks(supplierId, { moments, days, toDay }) : null,
  };
}

async function supplierBooks(
  organizationId: string,
  w: { moments: { gte: Date; lte: Date }; days: { gte: Date; lte: Date }; toDay: string },
): Promise<NonNullable<WeeklyStats['supplier']>> {
  const issuedBy = (typeCodes: readonly string[]) =>
    prisma.document.groupBy({
      by: ['currency'],
      where: {
        organizationId,
        status: 'ISSUED',
        typeCode: { in: [...typeCodes] },
        issuedAt: w.moments,
      },
      _count: { _all: true },
      _sum: { taxInclusiveCents: true },
    });
  const [invoices, credits, payments, overdue] = await Promise.all([
    issuedBy(PAYABLE_TYPES),
    issuedBy(['381']),
    prisma.documentPayment.findMany({
      where: { paidOn: w.days, document: { organizationId } },
      select: { amountCents: true, document: { select: { currency: true } } },
    }),
    // Като напомнянията (src/documents/reminders.ts): кредитирана фактура не е дълг — остатъкът е спорен.
    prisma.document.groupBy({
      by: ['currency'],
      where: {
        organizationId,
        status: 'ISSUED',
        typeCode: { in: [...PAYABLE_TYPES] },
        paymentState: { in: ['UNPAID', 'PARTIAL'] },
        payableCents: { gt: 0 },
        dueDate: { lt: dayStart(w.toDay) },
        followers: { none: { typeCode: '381', status: 'ISSUED' } },
      },
      _count: { _all: true },
      _sum: { payableCents: true, paidCents: true },
    }),
  ]);

  const money = (
    rows: Array<{
      currency: string;
      _count: { _all: number };
      _sum: { taxInclusiveCents: bigint | null };
    }>,
  ): Money => ({
    count: rows.reduce((sum, row) => sum + row._count._all, 0),
    cents: Object.fromEntries(rows.map((row) => [row.currency, int(row._sum.taxInclusiveCents)])),
  });

  const paidCents: Record<string, number> = {};
  for (const payment of payments) {
    const currency = payment.document.currency;
    paidCents[currency] = int((paidCents[currency] ?? 0) + int(payment.amountCents));
  }

  return {
    issued: money(invoices),
    creditNotes: money(credits),
    paid: { cents: paidCents },
    overdue: {
      count: overdue.reduce((sum, row) => sum + row._count._all, 0),
      cents: Object.fromEntries(
        overdue.map((row) => [row.currency, int(row._sum.payableCents) - int(row._sum.paidCents)]),
      ),
    },
  };
}
