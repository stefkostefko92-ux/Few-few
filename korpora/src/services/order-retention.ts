import type { Prisma, User } from '@prisma/client';
import { prisma } from '../db.js';
import { LABEL } from '../labels.js';
import { mailStaffNotice } from '../mail/order-templates.js';
import { ORDER_RETENTION_DAYS } from '../retention.js';
import { DAY } from '../time.js';

/*
 * Поръчките на изтрит акаунт (решение на собственика): акаунтът и проектите се трият, а поръчките остават
 * само с данните на договора — кой (име и имейл), какво и за колко, кога, по кои условия, ранното начало и
 * отказа — и се трият ORDER_RETENTION_DAYS след изтриването. Съобщението към поръчката (данни за фактура,
 * свободен текст) си отива с акаунта.
 */

/** Полетата от износа на поръчките, които остават след изтриването на акаунта (services/account-export.ts). */
export const ORDER_FIELDS_KEPT = [
  'id',
  'at',
  'option',
  'months',
  'priceWithoutVatCents',
  'buyer',
  'earlyStartRequestedAt',
  'termsVersion',
  'status',
  'closedAt',
  'confirmationSentAt',
  'withdrawnAt',
  'withdrawalAckSentAt',
  'withdrawalOutcome',
  'customerName',
  'customerEmail',
] as const;

export interface KeptOrders {
  /** Колко поръчки остават като договори. */
  count: number;
  /** Чакащите плащане — отменени с изтриването: изпълнение вече няма на кого. */
  cancelled: string[];
}

/**
 * В транзакцията на изтриването, ПРЕДИ реда на акаунта. Взима ключа на поръчките на акаунта (същия като
 * при нова поръчка, services/plan-requests.ts): поръчка, направена в същия миг, не остава без името и
 * имейла по договора.
 */
export async function keepOrdersAsContracts(
  tx: Prisma.TransactionClient,
  user: Pick<User, 'id' | 'name' | 'email'>,
  now: Date,
): Promise<KeptOrders> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7241021, hashtext(${user.id}))`;
  const cancelled = await tx.upgradeRequest.updateManyAndReturn({
    where: { userId: user.id, status: 'OPEN' },
    data: { status: 'CANCELLED', handledAt: now, handledByLabel: LABEL.accountDeleted },
    select: { id: true },
  });
  const kept = await tx.upgradeRequest.updateMany({
    where: { userId: user.id },
    data: {
      customerName: user.name,
      customerEmail: user.email,
      accountDeletedAt: now,
      message: null,
    },
  });
  return { count: kept.count, cancelled: cancelled.map((row) => row.id) };
}

/**
 * Екипът научава за отменените поръчки на изтрит акаунт: по тях може вече да е тръгнало плащане, което
 * се връща. Без отменени поръчки писмо няма.
 */
export function notifyStaffOfDeletedOrders(email: string, kept: KeptOrders): void {
  if (!kept.cancelled.length) return;
  void mailStaffNotice('staffAccountDeleted', { email, ids: kept.cancelled.join(', ') });
}

/** Поддръжката: поръчките на изтрити акаунти след срока за пазене. Връща колко са изтрити. */
export async function purgeExpiredOrders(now: Date): Promise<number> {
  const result = await prisma.upgradeRequest.deleteMany({
    where: {
      userId: null,
      accountDeletedAt: { lt: new Date(now.getTime() - ORDER_RETENTION_DAYS * DAY) },
    },
  });
  return result.count;
}
