import type { EmailKind, Prisma } from '@prisma/client';
import type { NotificationEvent } from '../collab/notify.js';

/**
 * Опашката на имейл известията (transactional outbox, без Redis): редът се пише в СЪЩАТА
 * транзакция като известието в приложението — няма известие без писмо и писмо без известие.
 * Само ново (не слято) известие пуска писмо: второ съобщение в същия непрочетен разговор
 * увеличава брояча, без второ писмо. Писмото чака `delayMs` — прочетено междувременно → отпада.
 */

export interface MailPolicy {
  /** Забавянето за съобщения/споменавания (спешното тръгва веднага). */
  delayMs: number;
}

/** Кои известия стават писмо (§12.3: споменаване, ново съобщение, възложен/спешен случай). */
export const EMAIL_KIND_OF: Partial<Record<NotificationEvent, EmailKind>> = {
  'message.mention': 'MENTION',
  'message.created': 'MESSAGE',
  'case.assigned': 'CASE_ASSIGNED',
  'case.urgent': 'CASE_URGENT',
};

export async function enqueueNotificationEmail(
  tx: Prisma.TransactionClient,
  policy: MailPolicy,
  n: { id: string; tenantId: string; userId: string; eventType: string },
  now = new Date(),
): Promise<boolean> {
  const kind = EMAIL_KIND_OF[n.eventType as NotificationEvent];
  if (!kind) return false;
  const notBefore = new Date(now.getTime() + (kind === 'CASE_URGENT' ? 0 : policy.delayMs));
  const res = await tx.emailOutbox.createMany({
    data: [
      {
        tenantId: n.tenantId,
        userId: n.userId,
        kind,
        notificationId: n.id,
        dedupeKey: `n:${n.id}`,
        notBefore,
      },
    ],
    skipDuplicates: true,
  });
  return res.count > 0;
}
