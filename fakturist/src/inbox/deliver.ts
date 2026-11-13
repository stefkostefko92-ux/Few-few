import type { Prisma } from '@prisma/client';
import { audit } from '../audit.js';

/** Ролите, които получават писмо за нов документ в шкафчето (и счетоводителите на кантората по пълномощно). */
const NOTIFY_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT'] as const;

/** ЕИК на получателя от фактурата: BT-47, иначе от българския ДДС номер BT-48 (BG + 9 цифри). */
export function recipientEik(buyer: {
  legalId?: string | undefined;
  vatId?: string | undefined;
}): string | null {
  if (buyer.legalId && /^\d{9}(\d{4})?$/.test(buyer.legalId)) return buyer.legalId.slice(0, 9);
  if (buyer.vatId && /^BG\d{9}$/.test(buyer.vatId)) return buyer.vatId.slice(2);
  return null;
}

export interface Delivery {
  entryId: string;
  recipientOrgId: string;
  notifications: number;
}

/**
 * Шкафчето: ако получателят по фактурата (по ЕИК) е фирма, регистрирана във Фактурист, документът се
 * доставя в нейното шкафче и всеки неин собственик, администратор и счетоводител (и счетоводителите на
 * кантора с действащо пълномощно) получава писмо — записано в опашката в СЪЩАТА транзакция като
 * издаването, затова няма издаден документ без доставка, нито доставка без документ.
 * ЕИК на клон (13 цифри) се свежда до ЕИК на юридическото лице.
 */
export async function deliverToInbox(
  tx: Prisma.TransactionClient,
  input: {
    documentId: string;
    senderOrgId: string;
    actorId: string;
    buyer: { legalId?: string | undefined; vatId?: string | undefined };
  },
): Promise<Delivery | null> {
  const eik = recipientEik(input.buyer);
  if (!eik) return null;
  const recipient = await tx.organization.findUnique({
    where: { eik },
    select: {
      id: true,
      deletedAt: true,
      memberships: {
        where: { role: { in: [...NOTIFY_ROLES] }, user: { disabledAt: null } },
        select: { user: { select: { email: true } } },
      },
      clientMandates: {
        where: { status: 'ACTIVE' },
        select: {
          firm: {
            select: {
              memberships: {
                where: { role: { in: [...NOTIFY_ROLES] }, user: { disabledAt: null } },
                select: { user: { select: { email: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!recipient || recipient.deletedAt || recipient.id === input.senderOrgId) return null;

  const entry = await tx.inboxEntry.create({
    data: {
      documentId: input.documentId,
      recipientOrgId: recipient.id,
      senderOrgId: input.senderOrgId,
    },
    select: { id: true },
  });
  const emails = new Set<string>([
    ...recipient.memberships.map((m) => m.user.email),
    ...recipient.clientMandates.flatMap((m) => m.firm.memberships.map((fm) => fm.user.email)),
  ]);
  for (const toEmail of emails) {
    await tx.notification.create({
      data: {
        organizationId: recipient.id,
        kind: 'inbox.received',
        toEmail,
        payload: { inboxEntryId: entry.id },
      },
    });
  }
  await audit(tx, {
    actorId: input.actorId,
    organizationId: recipient.id,
    action: 'inbox.delivered',
    targetType: 'InboxEntry',
    targetId: entry.id,
    details: {
      documentId: input.documentId,
      senderOrgId: input.senderOrgId,
      notifications: emails.size,
    },
  });
  return { entryId: entry.id, recipientOrgId: recipient.id, notifications: emails.size };
}
