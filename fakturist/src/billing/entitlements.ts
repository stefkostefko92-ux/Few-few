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
