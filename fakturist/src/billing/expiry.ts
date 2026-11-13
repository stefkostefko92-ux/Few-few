import { prisma } from '../db.js';
import { audit } from '../audit.js';

/**
 * Изтекъл платен период (SPEC 49): абонаментът става PAST_DUE и фирмата се връща на началния план
 * (безплатният за фирма, „Кантора“ за кантора — както при регистрация). Документите и данните не се
 * пипат; нов платен период идва само от нова поръчка. Безплатните абонаменти са със срок 100 години.
 */
const FALLBACK_YEARS = 100;

export async function expireSubscriptions(now = new Date()): Promise<number> {
  const expired = await prisma.subscription.findMany({
    where: { status: 'ACTIVE', currentPeriodEnd: { lte: now } },
    select: { id: true, organizationId: true, planCode: true },
    take: 200,
  });
  let count = 0;
  for (const subscription of expired) {
    const done = await prisma.$transaction(async (tx) => {
      // Условно: ново плащане в същия момент (активиране) печели — то вече е отменило този запис.
      const updated = await tx.subscription.updateMany({
        where: { id: subscription.id, status: 'ACTIVE', currentPeriodEnd: { lte: now } },
        data: { status: 'PAST_DUE' },
      });
      if (updated.count !== 1) return false;
      const org = await tx.organization.findUniqueOrThrow({
        where: { id: subscription.organizationId },
        select: { kind: true },
      });
      const end = new Date(now);
      end.setUTCFullYear(end.getUTCFullYear() + FALLBACK_YEARS);
      const planCode = org.kind === 'ACCOUNTING_FIRM' ? 'firm' : 'free';
      await tx.subscription.create({
        data: {
          organizationId: subscription.organizationId,
          planCode,
          currentPeriodStart: now,
          currentPeriodEnd: end,
        },
      });
      await audit(tx, {
        actorId: null,
        organizationId: subscription.organizationId,
        action: 'billing.subscription.expired',
        targetType: 'Subscription',
        targetId: subscription.id,
        details: { planCode: subscription.planCode, fallback: planCode },
      });
      return true;
    });
    if (done) count += 1;
  }
  return count;
}
