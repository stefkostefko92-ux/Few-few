import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import type { OrgAccess } from '../auth/guards.js';
import { orgHasFeature } from '../billing/entitlements.js';
import { parseXml, XmlError } from '../xml/parse.js';
import {
  DocumentPaymentError,
  recordPaymentInTx,
  removePaymentInTx,
} from '../documents/payments.js';
import { isCamt, readCamt053 } from './camt.js';
import { decodeCsv, readCsv } from './csv.js';
import { BankFormatError, type BankEntry } from './entries.js';
import { BANK_RETENTION } from './retention.js';

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

/** Сверката е по план — и импортът, и свързването, пропускането и отмяната. */
async function requireBankFeature(access: OrgAccess): Promise<void> {
  const allowed = await orgHasFeature(access.organizationId, 'bank-matching', {
    viaFirmId: access.viaFirmId,
  });
  if (!allowed) throw new ReconcileError('feature');
}

/**
 * Ключът на реда: полетата + поредният номер на същите полета в ЕДИН файл — два реални превода с
 * еднакви данни (наем 100 от един наредител в един ден) са два реда, а застъпващото се извлечение пак
 * дава същите ключове и не дублира.
 */
function lineKey(organizationId: string, e: BankEntry, occurrence: number): string {
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
        String(occurrence),
      ].join('\u0001'),
    )
    .digest('hex');
}

/** Разпознаване по съдържанието: XML → camt.053, иначе CSV. */
export function readStatement(buffer: Buffer): {
  format: 'CAMT053' | 'CSV';
  entries: BankEntry[];
  skipped: number;
} {
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
    return { format: 'CAMT053', entries: readCamt053(root), skipped: 0 };
  }
  const csv = readCsv(text);
  return { format: 'CSV', entries: csv.entries, skipped: csv.skipped };
}

export async function importStatement(
  access: OrgAccess,
  actorId: string,
  file: { name: string | null; buffer: Buffer },
): Promise<{ statementId: string; total: number; created: number; skipped: number }> {
  await requireBankFeature(access);
  const read = readStatement(file.buffer);
  const format = read.format;
  // Постъпление, по-старо от срока за несвързани редове, не се внася (иначе изтритото би се върнало).
  const oldest = new Date(Date.now() - BANK_RETENTION.unmatchedMs).toISOString().slice(0, 10);
  const entries = read.entries.filter((e) => e.bookingDate >= oldest);
  const skipped = read.skipped + (read.entries.length - entries.length);
  const seen = new Map<string, number>();
  const keyed = entries.map((e) => {
    const base = lineKey(access.organizationId, e, 0);
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return {
      entry: e,
      key: occurrence === 1 ? base : lineKey(access.organizationId, e, occurrence),
    };
  });
  const sha256 = createHash('sha256').update(file.buffer).digest('hex');
  try {
    return await prisma.$transaction(async (tx) => {
      const statement = await tx.bankStatement.create({
        data: {
          organizationId: access.organizationId,
          format,
          // Името на файла не се пази (минимизация — правен преглед, H1).
          fileName: null,
          sha256,
          lineCount: entries.length,
          newLines: 0,
          createdById: actorId,
        },
        select: { id: true },
      });
      const created = await tx.bankLine.createMany({
        data: keyed.map(({ entry: e, key }) => ({
          organizationId: access.organizationId,
          statementId: statement.id,
          bookingDate: new Date(`${e.bookingDate}T00:00:00Z`),
          amountCents: e.amountCents,
          currency: e.currency,
          counterparty: e.counterparty ?? null,
          counterpartyIban: e.counterpartyIban ?? null,
          remittance: e.remittance,
          bankRef: e.bankRef ?? null,
          uniqueKey: key,
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
        details: { format, total: entries.length, created: created.count, skipped },
      });
      return {
        statementId: statement.id,
        total: entries.length,
        created: created.count,
        skipped,
      };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ReconcileError('duplicate');
    }
    throw error;
  }
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
  await requireBankFeature(access);
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
      data: { status: 'MATCHED', documentPaymentId: paymentId, decidedAt: new Date() },
    });
  });
}

export async function ignoreLine(
  access: OrgAccess,
  actorId: string,
  lineId: string,
): Promise<void> {
  await requireBankFeature(access);
  await prisma.$transaction(async (tx) => {
    const line = await lockLine(tx, access.organizationId, lineId);
    if (line.status !== 'NEW') throw new ReconcileError('state');
    await tx.bankLine.update({
      where: { id: line.id },
      data: { status: 'IGNORED', decidedAt: new Date() },
    });
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
  await requireBankFeature(access);
  await prisma.$transaction(async (tx) => {
    const line = await lockLine(tx, access.organizationId, lineId);
    if (line.status === 'IGNORED') {
      await tx.bankLine.update({
        where: { id: line.id },
        data: { status: 'NEW', decidedAt: null },
      });
      await audit(tx, {
        actorId,
        organizationId: access.organizationId,
        action: 'bank.line.restored',
        targetType: 'BankLine',
        targetId: line.id,
      });
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
export { numbersIn, suggest, suggestMany, type Suggestion } from './suggest.js';

/**
 * „Изтрий извлечението“: несвързаните редове си отиват; свързаните остават без наредителя, сметката и
 * основанието — ключът им пази от повторно внасяне на същия превод (иначе той пак е „нов“ и се свързва
 * втори път; ревюто на Кодаджията). Извлечението остава, докато има свързани редове (отпечатъкът му спира
 * същия файл). Плащанията по документите (счетоводният запис) остават.
 */
export async function deleteStatement(
  access: OrgAccess,
  actorId: string,
  statementId: string,
): Promise<{ removed: number; kept: number }> {
  return prisma.$transaction(async (tx) => {
    const found = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "BankStatement"
      WHERE "id" = ${statementId} AND "organizationId" = ${access.organizationId} FOR UPDATE`;
    if (found.length !== 1) throw new ReconcileError('notFound');
    const removed = await tx.bankLine.deleteMany({
      where: { statementId, status: { not: 'MATCHED' } },
    });
    const kept = await tx.bankLine.updateMany({
      where: { statementId, status: 'MATCHED' },
      data: { counterparty: null, counterpartyIban: null, remittance: '' },
    });
    if (kept.count === 0) await tx.bankStatement.delete({ where: { id: statementId } });
    await audit(tx, {
      actorId,
      organizationId: access.organizationId,
      action: 'bank.statement.deleted',
      targetType: 'BankStatement',
      targetId: statementId,
      details: { removed: removed.count, kept: kept.count },
    });
    return { removed: removed.count, kept: kept.count };
  });
}
