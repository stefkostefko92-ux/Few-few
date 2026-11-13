import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import type { OrgAccess } from '../auth/guards.js';
import { orgHasFeature } from '../billing/entitlements.js';
import { parseXml, XmlError } from '../xml/parse.js';
import {
  DocumentPaymentError,
  PAYABLE_TYPES,
  recordPaymentInTx,
  removePaymentInTx,
} from '../documents/payments.js';
import { isCamt, readCamt053 } from './camt.js';
import { decodeCsv, readCsv } from './csv.js';
import { BankFormatError, type BankEntry } from './entries.js';

/**
 * Сверката с банката (SPEC 54): извлечение (camt.053 или CSV) → постъпленията като редове (повторен
 * импорт и застъпващи се извлечения не дублират — уникален ключ на реда) → предложение по номер на
 * фактура в основанието и остатъка → потвърждение от човек → плащане по документа (`source: BANK`) в
 * същата транзакция. Пропускане и отмяна. Само с план `bank-matching`; пише, който може да издава.
 */
export class ReconcileError extends Error {
  constructor(readonly code: 'feature' | 'duplicate' | 'notFound' | 'state' | 'currency') {
    super(code);
  }
}

function lineKey(organizationId: string, e: BankEntry): string {
  return createHash('sha256')
    .update(
      [
        organizationId,
        e.bookingDate,
        e.amountCents.toString(),
        e.currency,
        e.bankRef ?? '',
        e.remittance,
        e.counterpartyIban ?? '',
      ].join('\u0001'),
    )
    .digest('hex');
}

/** Разпознаване по съдържанието: XML → camt.053, иначе CSV. */
export function readStatement(buffer: Buffer): { format: 'CAMT053' | 'CSV'; entries: BankEntry[] } {
  const text = decodeCsv(buffer);
  if (text.trimStart().startsWith('<')) {
    let root;
    try {
      root = parseXml(text);
    } catch (error) {
      if (error instanceof XmlError) throw new BankFormatError('xml');
      throw error;
    }
    if (!isCamt(root)) throw new BankFormatError('notCamt');
    return { format: 'CAMT053', entries: readCamt053(root) };
  }
  return { format: 'CSV', entries: readCsv(text) };
}

export async function importStatement(
  access: OrgAccess,
  actorId: string,
  file: { name: string | null; buffer: Buffer },
): Promise<{ statementId: string; total: number; created: number }> {
  if (
    !(await orgHasFeature(access.organizationId, 'bank-matching', { viaFirmId: access.viaFirmId }))
  ) {
    throw new ReconcileError('feature');
  }
  const { format, entries } = readStatement(file.buffer);
  const sha256 = createHash('sha256').update(file.buffer).digest('hex');
  try {
    return await prisma.$transaction(async (tx) => {
      const statement = await tx.bankStatement.create({
        data: {
          organizationId: access.organizationId,
          format,
          fileName: file.name?.slice(0, 200) ?? null,
          sha256,
          lineCount: entries.length,
          newLines: 0,
          createdById: actorId,
        },
        select: { id: true },
      });
      const created = await tx.bankLine.createMany({
        data: entries.map((e) => ({
          organizationId: access.organizationId,
          statementId: statement.id,
          bookingDate: new Date(`${e.bookingDate}T00:00:00Z`),
          amountCents: e.amountCents,
          currency: e.currency,
          counterparty: e.counterparty ?? null,
          counterpartyIban: e.counterpartyIban ?? null,
          remittance: e.remittance,
          bankRef: e.bankRef ?? null,
          uniqueKey: lineKey(access.organizationId, e),
        })),
        skipDuplicates: true,
      });
      await tx.bankStatement.update({
        where: { id: statement.id },
        data: { newLines: created.count },
      });
      await audit(tx, {
        actorId,
        organizationId: access.organizationId,
        action: 'bank.statement.imported',
        targetType: 'BankStatement',
        targetId: statement.id,
        details: { format, total: entries.length, created: created.count },
      });
      return { statementId: statement.id, total: entries.length, created: created.count };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ReconcileError('duplicate');
    }
    throw error;
  }
}

export interface Suggestion {
  documentId: string;
  number: string;
  remainingCents: bigint;
  reason: 'number' | 'amount';
}

/** Номерата във вид на фактура от основанието (3–10 цифри) → десетразрядни. */
export function numbersIn(remittance: string): string[] {
  const found = remittance.match(/\d{3,10}/g) ?? [];
  return [...new Set(found.map((n) => n.padStart(10, '0')))];
}

/**
 * Предложение за ред: фактура с номера от основанието и остатък ≥ сумата (точният остатък — пръв);
 * иначе — единствената неплатена фактура с точно такъв остатък.
 */
export async function suggest(
  organizationId: string,
  line: { remittance: string; amountCents: bigint; currency: string },
): Promise<Suggestion | null> {
  const open = {
    organizationId,
    status: 'ISSUED' as const,
    typeCode: { in: [...PAYABLE_TYPES] },
    paymentState: { in: ['UNPAID' as const, 'PARTIAL' as const] },
    currency: line.currency,
  };
  const numbers = numbersIn(line.remittance);
  if (numbers.length) {
    const byNumber = await prisma.document.findMany({
      where: { ...open, number: { in: numbers } },
      select: { id: true, number: true, payableCents: true, paidCents: true },
    });
    const fitting = byNumber
      .map((d) => ({ ...d, remaining: d.payableCents - d.paidCents }))
      .filter((d) => d.remaining >= line.amountCents)
      .sort(
        (a, b) =>
          Number(a.remaining === line.amountCents ? -1 : 0) -
          Number(b.remaining === line.amountCents ? -1 : 0),
      );
    const best = fitting[0];
    if (best?.number) {
      return {
        documentId: best.id,
        number: best.number,
        remainingCents: best.remaining,
        reason: 'number',
      };
    }
  }
  const byAmount = await prisma.$queryRaw<Array<{ id: string; number: string }>>`
    SELECT "id", "number" FROM "Document"
    WHERE "organizationId" = ${organizationId} AND "status" = 'ISSUED'
      AND "typeCode" IN ('380', '383') AND "paymentState" IN ('UNPAID', 'PARTIAL')
      AND "currency" = ${line.currency}
      AND "payableCents" - "paidCents" = ${line.amountCents}
    LIMIT 2`;
  if (byAmount.length === 1) {
    return {
      documentId: byAmount[0]!.id,
      number: byAmount[0]!.number,
      remainingCents: line.amountCents,
      reason: 'amount',
    };
  }
  return null;
}

async function lockLine(tx: Prisma.TransactionClient, organizationId: string, id: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "BankLine" WHERE "id" = ${id} AND "organizationId" = ${organizationId}
    FOR UPDATE`;
  if (rows.length !== 1) throw new ReconcileError('notFound');
  return tx.bankLine.findUniqueOrThrow({ where: { id } });
}

/** Потвърждение: редът става плащане по документа (номерът — от предложението или въведен). */
export async function matchLine(
  access: OrgAccess,
  actorId: string,
  lineId: string,
  documentNumber: string,
): Promise<void> {
  const number = documentNumber.trim().padStart(10, '0');
  await prisma.$transaction(async (tx) => {
    const line = await lockLine(tx, access.organizationId, lineId);
    if (line.status !== 'NEW') throw new ReconcileError('state');
    const doc = await tx.document.findFirst({
      where: { organizationId: access.organizationId, number },
      select: { id: true, currency: true },
    });
    if (!doc) throw new ReconcileError('notFound');
    if (doc.currency !== line.currency) throw new ReconcileError('currency');
    const { paymentId } = await recordPaymentInTx(tx, {
      organizationId: access.organizationId,
      documentId: doc.id,
      amountCents: line.amountCents,
      paidOn: line.bookingDate.toISOString().slice(0, 10),
      source: 'BANK',
      note: line.bankRef ? `Извлечение, реф. ${line.bankRef}` : 'Извлечение',
      actorId,
    });
    await tx.bankLine.update({
      where: { id: line.id },
      data: { status: 'MATCHED', documentPaymentId: paymentId },
    });
  });
}

export async function ignoreLine(
  access: OrgAccess,
  actorId: string,
  lineId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const line = await lockLine(tx, access.organizationId, lineId);
    if (line.status !== 'NEW') throw new ReconcileError('state');
    await tx.bankLine.update({ where: { id: line.id }, data: { status: 'IGNORED' } });
    await audit(tx, {
      actorId,
      organizationId: access.organizationId,
      action: 'bank.line.ignored',
      targetType: 'BankLine',
      targetId: line.id,
    });
  });
}

/** Отмяна: свързаният ред — плащането се маха от документа; пропуснатият — пак „нов“. */
export async function undoLine(access: OrgAccess, actorId: string, lineId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const line = await lockLine(tx, access.organizationId, lineId);
    if (line.status === 'IGNORED') {
      await tx.bankLine.update({ where: { id: line.id }, data: { status: 'NEW' } });
      return;
    }
    if (line.status !== 'MATCHED' || !line.documentPaymentId) throw new ReconcileError('state');
    const payment = await tx.documentPayment.findUniqueOrThrow({
      where: { id: line.documentPaymentId },
      select: { id: true, documentId: true },
    });
    await removePaymentInTx(tx, {
      organizationId: access.organizationId,
      documentId: payment.documentId,
      paymentId: payment.id,
      actorId,
      source: 'BANK',
    });
  });
}

export { DocumentPaymentError };
