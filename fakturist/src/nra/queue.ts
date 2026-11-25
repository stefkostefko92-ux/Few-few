import type { Prisma } from '@prisma/client';
import type { Calculated } from '../einvoice/calculate.js';
import { toCents, toFixed, type Dec } from '../einvoice/decimal.js';

/**
 * Опашката за отчитане към НАП (SPEC 63; чл. 120д от законопроект № 52-602-01-60 — данните „в момента на
 * издаване“): по ред на събитие — издаден, анулиран. Нищо не се праща, докато няма API на НАП (наредбата
 * по чл. 120а, ал. 9); затова редът носи и нормализираната разбивка по ставки в евро — когато описанието
 * излезе, данните са готови, без да се смята наново от XML-а.
 */
export const NRA_EVENTS = ['ISSUED', 'CANCELLED'] as const;
export type NraEvent = (typeof NRA_EVENTS)[number];

export type NraBreakdownRow = {
  category: string;
  rate: string | null;
  baseEurCents: string;
  vatEurCents: string;
};

const cents = (value: Dec | null) => (value ? toCents(value).toString() : '0');

/** Основата и ДДС по категория и ставка — в евро (при валута — по курса от документа, BT-111). */
export function nraBreakdown(calc: Calculated, currency: string): NraBreakdownRow[] {
  const inEur = currency === 'EUR';
  return calc.breakdown.map((group) => ({
    category: group.category,
    rate: group.rate ? toFixed(group.rate, 2) : null,
    baseEurCents: inEur ? cents(group.taxable) : cents(group.taxableEur),
    vatEurCents: inEur ? cents(group.vat) : cents(group.vatEur),
  }));
}

export async function recordNraEvent(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    documentId: string;
    typeCode: string;
    ublSha256: string;
    event: NraEvent;
    breakdown: NraBreakdownRow[];
  },
): Promise<void> {
  await tx.nraReport.create({
    data: { ...input, breakdown: input.breakdown as unknown as Prisma.InputJsonValue },
  });
}

/** Анулиране (чл. 116 ЗДДС): събитие със същия отпечатък и разбивка като издаването — в същата транзакция. */
export async function recordNraCancellation(
  tx: Prisma.TransactionClient,
  documentId: string,
): Promise<void> {
  const issued = await tx.nraReport.findUnique({
    where: { documentId_event: { documentId, event: 'ISSUED' } },
  });
  // Документ отпреди опашката (няма ред „издаден“) — няма какво да се допълни.
  if (!issued) return;
  await tx.nraReport.create({
    data: {
      organizationId: issued.organizationId,
      documentId,
      typeCode: issued.typeCode,
      ublSha256: issued.ublSha256,
      event: 'CANCELLED',
      breakdown: (issued.breakdown ?? []) as Prisma.InputJsonValue,
    },
  });
}
