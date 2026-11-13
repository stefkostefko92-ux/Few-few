import type { Prisma } from '@prisma/client';
import { audit } from '../audit.js';

/**
 * Анулиране по чл. 116 ЗДДС (SPEC 47; казусът — docs/kazus-anulirane.md). Анулира се само ПОГРЕШНО
 * СЪСТАВЕН документ — причина от затворен списък — и винаги заедно с нов документ: старият става
 * „анулиран“ в транзакцията, в която се издава новият (ал. 1 — „се анулират и се издават нови“).
 * Промяната на основата (отстъпка, връщане, развалена доставка) е известие по чл. 115, не анулиране.
 * Оригиналът (PDF, UBL, CII, веригата) не се пипа; анулирането е звено в одита (също верига).
 */
export const ANNUL_REASONS = ['requisite', 'vatMissing', 'vatCharged', 'vatRate'] as const;
export type AnnulReason = (typeof ANNUL_REASONS)[number];

export function isAnnulReason(value: unknown): value is AnnulReason {
  return typeof value === 'string' && (ANNUL_REASONS as readonly string[]).includes(value);
}

/** Основанието в протокола (чл. 116, ал. 4, т. 1) — кратко и с алинеята. */
export const ANNUL_REASON_TEXT: Record<AnnulReason, { bg: string; en: string }> = {
  requisite: {
    bg: 'Погрешно съставен документ — грешен реквизит (чл. 116, ал. 1 ЗДДС)',
    en: 'Incorrectly drawn up document — wrong particular (Art. 116(1) VAT Act)',
  },
  vatMissing: {
    bg: 'Не е начислен ДДС, когато е трябвало (чл. 116, ал. 2 ЗДДС)',
    en: 'VAT not charged when it should have been (Art. 116(2) VAT Act)',
  },
  vatCharged: {
    bg: 'Начислен е ДДС, когато не е трябвало (чл. 116, ал. 3 ЗДДС)',
    en: 'VAT charged when it should not have been (Art. 116(3) VAT Act)',
  },
  vatRate: {
    bg: 'Приложена е грешна ставка на ДДС (чл. 116, ал. 6 ЗДДС)',
    en: 'Wrong VAT rate applied (Art. 116(6) VAT Act)',
  },
};

export class AnnulError extends Error {
  constructor(
    readonly code: 'notFound' | 'notIssued' | 'hasFollowers' | 'typeMismatch' | 'invalidReason',
  ) {
    super(code);
  }
}

/**
 * Документът, който може да се анулира: издаден (не анулиран), на тази фирма, без издадени известия
 * към него (първо се решава веригата на известията — казусът, т. 7).
 */
export async function replaceable(
  tx: Prisma.TransactionClient,
  organizationId: string,
  documentId: string,
): Promise<{ id: string; typeCode: string; number: string; input: Prisma.JsonValue }> {
  const doc = await tx.document.findFirst({
    where: { id: documentId, organizationId },
    select: {
      id: true,
      status: true,
      typeCode: true,
      number: true,
      input: true,
      replacedById: true,
      followers: { where: { status: 'ISSUED' }, select: { id: true } },
    },
  });
  if (!doc || !doc.number) throw new AnnulError('notFound');
  if (doc.status !== 'ISSUED' || doc.replacedById) throw new AnnulError('notIssued');
  if (doc.followers.length > 0) throw new AnnulError('hasFollowers');
  return { id: doc.id, typeCode: doc.typeCode, number: doc.number, input: doc.input };
}

/**
 * В транзакцията на издаването на НОВИЯ документ (след като е създаден): старият става анулиран и сочи
 * новия. Условният UPDATE пази от двойно анулиране при едновременни заявки — тогава всичко се връща,
 * включително номерът на новия документ (номерацията остава без пропуски).
 */
export async function annulInTx(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    oldId: string;
    newId: string;
    newTypeCode: string;
    reason: AnnulReason;
    actorId: string;
    now?: Date;
  },
): Promise<void> {
  if (!isAnnulReason(input.reason)) throw new AnnulError('invalidReason');
  const old = await replaceable(tx, input.organizationId, input.oldId);
  if (old.typeCode !== input.newTypeCode) throw new AnnulError('typeMismatch');
  const now = input.now ?? new Date();
  const updated = await tx.document.updateMany({
    where: {
      id: old.id,
      organizationId: input.organizationId,
      status: 'ISSUED',
      replacedById: null,
    },
    data: {
      status: 'CANCELLED',
      cancelledAt: now,
      cancelReason: input.reason,
      cancelledById: input.actorId,
      replacedById: input.newId,
    },
  });
  if (updated.count !== 1) throw new AnnulError('notIssued');
  await audit(tx, {
    actorId: input.actorId,
    organizationId: input.organizationId,
    action: 'document.annulled',
    targetType: 'Document',
    targetId: old.id,
    details: { number: old.number, reason: input.reason, replacedById: input.newId },
  });
  // Получателите в шкафчето научават, че документът е анулиран и с кой е заменен.
  const entries = await tx.inboxEntry.findMany({
    where: { documentId: old.id },
    select: {
      id: true,
      recipientOrgId: true,
      recipientOrg: {
        select: {
          memberships: {
            where: { role: { in: ['OWNER', 'ADMIN', 'ACCOUNTANT'] }, user: { disabledAt: null } },
            select: { user: { select: { email: true } } },
          },
        },
      },
    },
  });
  for (const entry of entries) {
    for (const member of entry.recipientOrg.memberships) {
      await tx.notification.create({
        data: {
          organizationId: entry.recipientOrgId,
          kind: 'inbox.annulled',
          toEmail: member.user.email,
          payload: { inboxEntryId: entry.id, newDocumentId: input.newId },
        },
      });
    }
  }
}
