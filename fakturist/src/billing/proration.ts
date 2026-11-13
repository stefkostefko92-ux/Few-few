import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import type { Interval } from './billing-core.js';

/**
 * Прихващане при смяна на план (решение на собственика, 13.11.2026; общите условия, т. 6): неизползваната
 * част от последно платеното по действащия платен абонамент — основата без ДДС, пропорционално на
 * оставащото време, в цели центове надолу (BigInt — без float и без загуба на точност). Същият план и
 * период не се прихваща — той се удължава от края си (orders.ts).
 */
export function prorationCredit(input: {
  paidNetCents: number;
  start: Date;
  end: Date;
  now: Date;
}): number {
  // Цената на времето е тази на последния платен период; оставащото е от днес до края — при удължен
  // абонамент (следващият период започва в бъдещето) то покрива и текущия месец от предишното плащане.
  const total = BigInt(input.end.getTime() - input.start.getTime());
  if (total <= 0n) return 0;
  const left = BigInt(input.end.getTime() - input.now.getTime());
  if (left <= 0n) return 0;
  return Number((BigInt(input.paidNetCents) * left) / total);
}

export interface Credit {
  cents: number;
  /** Абонаментът, от който е кредитът — активирането проверява, че още е действащият. */
  subscriptionId: string;
  /** Платеният план, от който е кредитът — за реда на фактурата. */
  planCode: string;
  start: Date;
  end: Date;
}

type Db = Prisma.TransactionClient | typeof prisma;

/** Кредитът за нова поръчка: действащ ПЛАТЕН абонамент с друг план или период. */
export async function currentCredit(
  organizationId: string,
  planCode: string,
  interval: Interval,
  now = new Date(),
  db: Db = prisma,
): Promise<Credit | null> {
  const current = await db.subscription.findFirst({
    where: { organizationId, status: 'ACTIVE', currentPeriodEnd: { gt: now } },
    orderBy: { createdAt: 'desc' },
  });
  if (!current || (current.planCode === planCode && current.interval === interval)) return null;
  const paid = await db.payment.findFirst({
    where: { subscriptionId: current.id, status: 'COMPLETED' },
    orderBy: { paidAt: 'desc' },
    select: { netCents: true, creditCents: true },
  });
  if (!paid) return null;
  const cents = prorationCredit({
    // Стойността на периода е цената му — и частта, покрита с прихващане от още по-предишен план.
    paidNetCents: paid.netCents + paid.creditCents,
    start: current.currentPeriodStart,
    end: current.currentPeriodEnd,
    now,
  });
  return cents > 0
    ? {
        cents,
        subscriptionId: current.id,
        planCode: current.planCode,
        start: current.currentPeriodStart,
        end: current.currentPeriodEnd,
      }
    : null;
}
