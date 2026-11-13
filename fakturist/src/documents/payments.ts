import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { dec, isDecimalText, toCents } from '../einvoice/decimal.js';
import { sofiaToday } from '../time.js';
import { isIsoDate } from '../recurring/schedule.js';

/**
 * Плащането по издаден документ (SPEC 52): платен / частично / неплатен по сбора на записаните плащания
 * — ръчно отбелязани (`documents.issue`) или от сверката с банката (SPEC 54, `source: BANK`). Само
 * фактура и дебитно известие с положителна сума за плащане; надплащане не се приема. Документът се
 * заключва (FOR UPDATE) — две едновременни отбелязвания не надхвърлят сумата.
 */
export class DocumentPaymentError extends Error {
  constructor(readonly code: 'notFound' | 'notPayable' | 'amount' | 'date' | 'source') {
    super(code);
  }
}

export const PAYABLE_TYPES = ['380', '383'] as const;

export const PaymentFormSchema = z.object({
  amount: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s/g, '').replace(',', '.'))
    .refine((value) => isDecimalText(value) && /^\d+(\.\d{1,2})?$/.test(value)),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => value || undefined),
});

export function amountCents(text: string): bigint {
  return toCents(dec(text));
}

type State = 'UNPAID' | 'PARTIAL' | 'PAID';

export function paymentState(paid: bigint, payable: bigint): State {
  if (paid <= 0n) return 'UNPAID';
  return paid >= payable ? 'PAID' : 'PARTIAL';
}

async function lockDocument(tx: Prisma.TransactionClient, organizationId: string, id: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Document" WHERE "id" = ${id} AND "organizationId" = ${organizationId}
    FOR UPDATE`;
  if (rows.length !== 1) throw new DocumentPaymentError('notFound');
  return tx.document.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      status: true,
      typeCode: true,
      issueDate: true,
      payableCents: true,
      paidCents: true,
      number: true,
    },
  });
}

/** Сборът и състоянието наново от записаните плащания (не от разлики — без натрупани грешки). */
async function recompute(
  tx: Prisma.TransactionClient,
  documentId: string,
  payable: bigint,
): Promise<{ paid: bigint; state: State }> {
  const payments = await tx.documentPayment.findMany({
    where: { documentId },
    select: { amountCents: true, paidOn: true },
    orderBy: { paidOn: 'asc' },
  });
  const paid = payments.reduce((total, p) => total + p.amountCents, 0n);
  const state = paymentState(paid, payable);
  await tx.document.update({
    where: { id: documentId },
    data: {
      paidCents: paid,
      paymentState: state,
      paidAt: state === 'PAID' ? (payments[payments.length - 1]?.paidOn ?? null) : null,
    },
  });
  return { paid, state };
}

export interface RecordPaymentInput {
  organizationId: string;
  documentId: string;
  amountCents: bigint;
  paidOn: string;
  source: 'MANUAL' | 'BANK';
  note?: string | undefined;
  actorId: string | null;
}

/** Записва плащане в подадената транзакция (сверката с банката я държи отворена). */
export async function recordPaymentInTx(
  tx: Prisma.TransactionClient,
  input: RecordPaymentInput,
  today = sofiaToday(),
): Promise<{ paymentId: string; state: State }> {
  const doc = await lockDocument(tx, input.organizationId, input.documentId);
  if (
    doc.status !== 'ISSUED' ||
    !(PAYABLE_TYPES as readonly string[]).includes(doc.typeCode) ||
    doc.payableCents <= 0n
  ) {
    throw new DocumentPaymentError('notPayable');
  }
  if (input.amountCents <= 0n || input.amountCents > doc.payableCents - doc.paidCents) {
    throw new DocumentPaymentError('amount');
  }
  const issued = doc.issueDate.toISOString().slice(0, 10);
  if (!isIsoDate(input.paidOn) || input.paidOn > today) {
    throw new DocumentPaymentError('date');
  }
  // Плащане преди документа е аванс — то се отразява в документа (BT-113), не тук.
  if (input.paidOn < issued && input.source === 'MANUAL') throw new DocumentPaymentError('date');
  const payment = await tx.documentPayment.create({
    data: {
      documentId: doc.id,
      amountCents: input.amountCents,
      paidOn: new Date(`${input.paidOn}T00:00:00Z`),
      source: input.source,
      note: input.note ?? null,
      createdById: input.actorId,
    },
    select: { id: true },
  });
  const { state } = await recompute(tx, doc.id, doc.payableCents);
  await audit(tx, {
    actorId: input.actorId,
    organizationId: input.organizationId,
    action: 'document.payment.recorded',
    targetType: 'Document',
    targetId: doc.id,
    details: {
      number: doc.number,
      amountCents: input.amountCents.toString(),
      source: input.source,
      state,
    },
  });
  return { paymentId: payment.id, state };
}

export function recordPayment(
  input: RecordPaymentInput,
): Promise<{ paymentId: string; state: State }> {
  return prisma.$transaction((tx) => recordPaymentInTx(tx, input));
}

/** Махане на плащане в подадената транзакция; от сверката (`BANK`) — само от самата сверка. */
export async function removePaymentInTx(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    documentId: string;
    paymentId: string;
    actorId: string;
    source: 'MANUAL' | 'BANK';
  },
): Promise<void> {
  const doc = await lockDocument(tx, input.organizationId, input.documentId);
  const payment = await tx.documentPayment.findFirst({
    where: { id: input.paymentId, documentId: doc.id },
  });
  if (!payment) throw new DocumentPaymentError('notFound');
  if (payment.source !== input.source) throw new DocumentPaymentError('source');
  await tx.bankLine.updateMany({
    where: { documentPaymentId: payment.id },
    data: { documentPaymentId: null, status: 'NEW' },
  });
  await tx.documentPayment.delete({ where: { id: payment.id } });
  const { state } = await recompute(tx, doc.id, doc.payableCents);
  await audit(tx, {
    actorId: input.actorId,
    organizationId: input.organizationId,
    action: 'document.payment.removed',
    targetType: 'Document',
    targetId: doc.id,
    details: {
      number: doc.number,
      amountCents: payment.amountCents.toString(),
      source: payment.source,
      state,
    },
  });
}

/** Махане на ръчно отбелязано плащане (грешка при въвеждане); сверените се махат от сверката. */
export async function removePayment(input: {
  organizationId: string;
  documentId: string;
  paymentId: string;
  actorId: string;
}): Promise<void> {
  await prisma.$transaction((tx) => removePaymentInTx(tx, { ...input, source: 'MANUAL' }));
}
