import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { feature, type FeatureCode } from '../features.js';

/**
 * Има ли фирмата функцията (повтарящи се фактури, напомняния, API, сверка): функцията е налична
 * (`live` в регистъра), не е изключена глобално от мастъра и е в плана на активния абонамент. При
 * работа по пълномощно стига и планът на кантората (тя плаща за фирмите-клиенти).
 */
type Db = Prisma.TransactionClient | typeof prisma;

async function planHas(db: Db, organizationId: string, code: FeatureCode): Promise<boolean> {
  const subscription = await db.subscription.findFirst({
    where: { organizationId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    select: { plan: { select: { features: true } } },
  });
  return subscription?.plan.features.includes(code) ?? false;
}

export async function orgHasFeature(
  organizationId: string,
  code: FeatureCode,
  options: { viaFirmId?: string | null; db?: Db } = {},
): Promise<boolean> {
  if (feature(code).status !== 'live') return false;
  const db = options.db ?? prisma;
  const flag = await db.featureFlag.findUnique({ where: { code }, select: { enabled: true } });
  if (flag && !flag.enabled) return false;
  if (await planHas(db, organizationId, code)) return true;
  return options.viaFirmId ? planHas(db, options.viaFirmId, code) : false;
}

export interface PlanLimits {
  /** Потребители (членове + отворени покани); null — без таван. */
  maxUsers: number | null;
  /** Фирми-клиенти на кантора без платен абонамент; null — без таван. */
  includedClientCompanies: number | null;
  /** Абонаментът е платен (има завършено плащане) — допълнителните фирми-клиенти се таксуват. */
  paid: boolean;
}

/**
 * Таваните от плана на активния абонамент. Фирма без абонамент (добавена от кантора — плаща кантората)
 * няма таван тук: функциите ѝ идват по пълномощното.
 */
export async function planLimits(db: Db, organizationId: string): Promise<PlanLimits> {
  const subscription = await db.subscription.findFirst({
    where: { organizationId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    select: {
      plan: { select: { maxUsers: true, includedClientCompanies: true } },
      payments: { where: { status: 'COMPLETED' }, select: { id: true }, take: 1 },
    },
  });
  if (!subscription) return { maxUsers: null, includedClientCompanies: null, paid: false };
  return {
    maxUsers: subscription.plan.maxUsers,
    includedClientCompanies: subscription.plan.includedClientCompanies,
    paid: subscription.payments.length > 0,
  };
}

/** Колко места заемат членовете и отворените покани за член — срещу `maxUsers`. */
export async function seatsTaken(db: Db, organizationId: string, now: Date): Promise<number> {
  const [members, invites] = await Promise.all([
    db.membership.count({ where: { organizationId } }),
    db.memberInvite.count({
      where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
    }),
  ]);
  return members + invites;
}
