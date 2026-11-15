import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { FALLBACK_YEARS, farEnd, startPlanFor } from './expiry.js';

/**
 * Ръчно даден план (SPEC 71–72; собственикът, 15.11.2026: „да мога да давам премиум на хора ръчно“):
 * мастърът дава план на фирма за срок или безсрочно — без плащане и без фактура. Абонаментът е
 * `granted`: функциите и таваните са на плана, за таваните се брои като платен (src/billing/entitlements.ts),
 * прихващане не дава (кредитът е само от плащане — proration.ts) и изтича като платен (expiry.ts).
 * Всичко е под заключването на фирмата и в одита; причината е задължителна.
 */
export const GRANT_MAX_MONTHS = 120;
export const GRANT_FOREVER_YEARS = FALLBACK_YEARS;
const NOTE_MIN = 3;
const NOTE_MAX = 200;

export type GrantMonths = number | 'forever';
export type GrantErrorCode =
  | 'notFound'
  | 'deleted'
  | 'terminated'
  | 'plan'
  | 'audience'
  | 'months'
  | 'note'
  | 'paidActive'
  | 'notGranted';

export class GrantError extends Error {
  constructor(readonly code: GrantErrorCode) {
    super(code);
  }
}

export interface GrantInput {
  planCode: string;
  months: GrantMonths;
  note: string;
  replacePaid: boolean;
}

/** Формата от мастър панела → входа; грешката е кодът на първото невалидно поле. */
export function parseGrantForm(
  body: Record<string, unknown>,
): { ok: true; value: GrantInput } | { ok: false; error: 'plan' | 'months' | 'note' } {
  const planCode = body['planCode'];
  if (typeof planCode !== 'string' || !/^[a-z0-9-]{1,40}$/.test(planCode)) {
    return { ok: false, error: 'plan' };
  }
  const rawMonths = body['months'];
  let months: GrantMonths;
  if (rawMonths === 'forever') {
    months = 'forever';
  } else if (typeof rawMonths === 'string' && /^\d{1,3}$/.test(rawMonths)) {
    months = Number(rawMonths);
    if (months < 1 || months > GRANT_MAX_MONTHS) return { ok: false, error: 'months' };
  } else {
    return { ok: false, error: 'months' };
  }
  const note = typeof body['note'] === 'string' ? body['note'].trim().replace(/\s+/g, ' ') : '';
  if ([...note].length < NOTE_MIN || [...note].length > NOTE_MAX) {
    return { ok: false, error: 'note' };
  }
  return { ok: true, value: { planCode, months, note, replacePaid: body['replacePaid'] === 'on' } };
}

/** Календарни месеци (UTC): 31-во число → последният ден на по-краткия месец. */
export function addMonthsUtc(from: Date, months: number): Date {
  const day = from.getUTCDate();
  const target = new Date(from);
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target;
}

export const grantEnd = (now: Date, months: GrantMonths): Date =>
  months === 'forever' ? farEnd(now) : addMonthsUtc(now, months);

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Фирмата под заключване (FOR UPDATE) — едно действие по плана ѝ наведнъж (и спрямо активирането). */
async function lockedOrganization(tx: Tx, organizationId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`;
  if (rows.length !== 1) throw new GrantError('notFound');
  const org = await tx.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { kind: true, deletedAt: true, terminatedAt: true },
  });
  if (org.deletedAt) throw new GrantError('deleted');
  if (org.terminatedAt) throw new GrantError('terminated');
  return org;
}

async function activeSubscription(tx: Tx, organizationId: string) {
  return tx.subscription.findFirst({
    where: { organizationId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      planCode: true,
      granted: true,
      currentPeriodEnd: true,
      payments: { where: { status: 'COMPLETED' }, select: { id: true }, take: 1 },
    },
  });
}

export async function grantPlan(
  input: GrantInput & { organizationId: string; actorId: string; now?: Date },
): Promise<{ subscriptionId: string; end: Date }> {
  const now = input.now ?? new Date();
  if (input.months !== 'forever') {
    if (!Number.isInteger(input.months) || input.months < 1 || input.months > GRANT_MAX_MONTHS) {
      throw new GrantError('months');
    }
  }
  return prisma.$transaction(async (tx) => {
    const org = await lockedOrganization(tx, input.organizationId);
    const plan = await tx.plan.findUnique({
      where: { code: input.planCode },
      select: { code: true, audience: true, isActive: true },
    });
    if (!plan || !plan.isActive) throw new GrantError('plan');
    const audience = org.kind === 'ACCOUNTING_FIRM' ? 'ACCOUNTANT' : 'COMPANY';
    if (plan.audience !== audience) throw new GrantError('audience');
    const current = await activeSubscription(tx, input.organizationId);
    const paidRunning =
      current !== null && current.payments.length > 0 && current.currentPeriodEnd > now;
    if (paidRunning && !input.replacePaid) throw new GrantError('paidActive');

    await tx.subscription.updateMany({
      where: { organizationId: input.organizationId, status: 'ACTIVE' },
      data: { status: 'CANCELLED' },
    });
    const end = grantEnd(now, input.months);
    const created = await tx.subscription.create({
      data: {
        organizationId: input.organizationId,
        planCode: plan.code,
        status: 'ACTIVE',
        interval: 'MONTH',
        currentPeriodStart: now,
        currentPeriodEnd: end,
        provider: 'MANUAL',
        granted: true,
        grantedById: input.actorId,
        grantNote: input.note,
      },
      select: { id: true },
    });
    await audit(tx, {
      actorId: input.actorId,
      organizationId: input.organizationId,
      action: 'billing.subscription.granted',
      targetType: 'Subscription',
      targetId: created.id,
      details: {
        planCode: plan.code,
        months: input.months,
        previousPlanCode: current?.planCode ?? null,
        replacedPaid: paidRunning,
        note: input.note,
      },
    });
    return { subscriptionId: created.id, end };
  });
}

/** Прекратява дадения план сега → началният план (както при изтичане). Само даден план. */
export async function endGrant(input: {
  organizationId: string;
  actorId: string;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  await prisma.$transaction(async (tx) => {
    const org = await lockedOrganization(tx, input.organizationId);
    const current = await activeSubscription(tx, input.organizationId);
    if (!current || !current.granted) throw new GrantError('notGranted');
    await tx.subscription.update({ where: { id: current.id }, data: { status: 'CANCELLED' } });
    const planCode = startPlanFor(org.kind);
    await tx.subscription.create({
      data: {
        organizationId: input.organizationId,
        planCode,
        currentPeriodStart: now,
        currentPeriodEnd: farEnd(now),
      },
    });
    await audit(tx, {
      actorId: input.actorId,
      organizationId: input.organizationId,
      action: 'billing.subscription.grantEnded',
      targetType: 'Subscription',
      targetId: current.id,
      details: { planCode: current.planCode, fallback: planCode },
    });
  });
}

/** За картата на фирмата в панела: текущият абонамент и плановете, които могат да се дадат. */
export async function grantView(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { kind: true },
  });
  if (!org) return null;
  const [current, plans] = await Promise.all([
    prisma.subscription.findFirst({
      where: { organizationId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: {
        planCode: true,
        granted: true,
        grantNote: true,
        currentPeriodEnd: true,
        payments: { where: { status: 'COMPLETED' }, select: { id: true }, take: 1 },
      },
    }),
    prisma.plan.findMany({
      where: {
        isActive: true,
        audience: org.kind === 'ACCOUNTING_FIRM' ? 'ACCOUNTANT' : 'COMPANY',
      },
      orderBy: { sortOrder: 'asc' },
      select: { code: true, nameBg: true, nameEn: true },
    }),
  ]);
  // Безплатният план на фирма не се „дава“ — за нея има смисъл само платен; кантората има един план.
  const offered =
    org.kind === 'ACCOUNTING_FIRM' ? plans : plans.filter((p) => p.code !== startPlanFor(org.kind));
  return {
    current: current
      ? {
          planCode: current.planCode,
          granted: current.granted,
          note: current.grantNote,
          end: current.currentPeriodEnd,
          forever: current.currentPeriodEnd.getUTCFullYear() >= 2100,
          paid: current.payments.length > 0,
        }
      : null,
    plans: offered,
    allPlans: plans,
    maxMonths: GRANT_MAX_MONTHS,
  };
}
