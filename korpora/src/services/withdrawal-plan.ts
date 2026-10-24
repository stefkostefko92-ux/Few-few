import type { Prisma, UpgradeRequest, User } from '@prisma/client';
import { customerLabel, LABEL } from '../labels.js';
import type { PlanOutcome } from '../plans/withdrawal.js';

/**
 * Планът след отказа от договора — в транзакцията на отказа, когато поръчката и човекът вече са
 * заключени. Ако поръчката е била активирана и оттогава планът не е пипан, връща плана отпреди нея;
 * иначе го оправя екипът.
 */
export async function settlePlanAfterWithdrawal(
  tx: Prisma.TransactionClient,
  user: Pick<User, 'id'>,
  order: Pick<UpgradeRequest, 'id' | 'status' | 'createdAt'>,
): Promise<PlanOutcome> {
  const activation = await tx.planChange.findFirst({
    where: { requestId: order.id },
    orderBy: { createdAt: 'desc' },
  });
  if (!activation) {
    // Активирана, но без връзка към промяната (или планът е сменен на ръка след поръчката) — не
    // гадаем какво да върнем: оправя го екипът.
    const changedSince = await tx.planChange.count({
      where: { userId: user.id, createdAt: { gt: order.createdAt } },
    });
    return order.status === 'DONE' || changedSince > 0 ? 'manual' : 'open';
  }
  const [latest, current] = await Promise.all([
    tx.planChange.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
    tx.user.findUniqueOrThrow({ where: { id: user.id } }),
  ]);
  const untouched =
    latest?.id === activation.id &&
    current.plan === activation.toPlan &&
    (current.planExpiresAt?.getTime() ?? null) === (activation.toExpiresAt?.getTime() ?? null);
  // Друга поръчка на човека е отказана, а планът ѝ не е върнат автоматично: „преди“ на тази активация
  // може да носи платеното от нея — не го връщаме, оправя го екипът.
  const unsettled = await tx.upgradeRequest.count({
    where: {
      userId: user.id,
      id: { not: order.id },
      status: 'WITHDRAWN',
      planChanges: { some: {} },
      NOT: { planChanges: { some: { note: LABEL.withdrawal } } },
    },
  });
  if (!untouched || !activation.fromPlan || unsettled > 0) return 'manual';
  await tx.user.update({
    where: { id: user.id },
    data: { plan: activation.fromPlan, planExpiresAt: activation.fromExpiresAt },
  });
  await tx.planChange.create({
    data: {
      userId: user.id,
      actorId: user.id,
      actorLabel: customerLabel(user.id),
      fromPlan: current.plan,
      toPlan: activation.fromPlan,
      fromExpiresAt: current.planExpiresAt,
      toExpiresAt: activation.fromExpiresAt,
      note: LABEL.withdrawal,
      requestId: order.id,
    },
  });
  return 'reverted';
}
