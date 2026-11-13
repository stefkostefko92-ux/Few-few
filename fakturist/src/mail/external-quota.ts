import type { Prisma } from '@prisma/client';
import { DAY } from '../time.js';

/**
 * Таван на писмата на фирма до адреси извън Фактурист (повтарящите се, напомнянията, проформите) — за 24 часа.
 * Писмото тръгва от нашия домейн: таванът пази репутацията му от злоупотреба като спам релей.
 */
export const EXTERNAL_MAILS_PER_DAY = 200;
export const EXTERNAL_MAIL_KINDS = ['document.sent', 'document.reminder', 'proforma.sent'] as const;

export async function externalMailAllowed(
  tx: Prisma.TransactionClient,
  organizationId: string,
  now = new Date(),
): Promise<boolean> {
  const sent = await tx.notification.count({
    where: {
      organizationId,
      kind: { in: [...EXTERNAL_MAIL_KINDS] },
      createdAt: { gte: new Date(now.getTime() - DAY) },
    },
  });
  return sent < EXTERNAL_MAILS_PER_DAY;
}
