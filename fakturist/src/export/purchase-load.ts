import { prisma } from '../db.js';
import { InvoiceInputSchema } from '../einvoice/model.js';
import { parseIncoming } from '../incoming/check.js';
import { journalPeriodOf } from '../incoming/vat-credit.js';
import { DAY, sofiaToday } from '../time.js';
import {
  supplierDocumentKey,
  type PurchaseEntry,
  type PurchaseManualReason,
} from './purchase-journal.js';

/**
 * Покупките за месеца на дневника: входящите (качени и получени през Peppol) и доставените в шкафчето, без
 * отказаните. Месецът е избраният за дневника, иначе месецът на издаване (SPEC 68). Тук се решава онова,
 * което иска базата, и документът отива „за ръчно“ с причина:
 *
 * - копие — същият документ на доставчика е два пъти (качен и в шкафчето, UBL и CII), в който и да е месец;
 * - без дата на издаване — в месеца на получаване (полето 03-07 е задължително);
 * - проверката при получаването: фактурата е до друга фирма (BUYER) или файлът не минава (`valid`);
 * - анулиран от доставчика: в месеца на дневника или преди него — не се вписва; по-късно — вписаният остава
 *   в своя месец, а в месеца на анулирането излиза за корекция (знакът и полето — от счетоводителя).
 */
function monthRange(period: string): { gte: Date; lt: Date } {
  const start = new Date(`${period}-01T00:00:00Z`);
  return { gte: start, lt: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) };
}

/** Моментите (получаване, анулиране) — по софийско време; заявката е с ден запас, месецът решава това. */
const sofiaMonth = (date: Date) => sofiaToday(date).slice(0, 7);
const withMargin = (range: { gte: Date; lt: Date }) => ({
  gte: new Date(range.gte.getTime() - DAY),
  lt: new Date(range.lt.getTime() + DAY),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown) => (typeof value === 'string' ? value : undefined);

/** Проверката при получаването е JSON — има ли правилото `rule`. */
function hasRule(issues: unknown, rule: string): boolean {
  return Array.isArray(issues) && issues.some((i) => isRecord(i) && i['rule'] === rule);
}

/** Доставчикът от входа на документ от шкафчето (JSON по модела) — без пълна проверка на схемата. */
function sellerOf(input: unknown): { vatId?: string; legalId?: string; name?: string } {
  const seller = isRecord(input) && isRecord(input['seller']) ? input['seller'] : {};
  const out: { vatId?: string; legalId?: string; name?: string } = {};
  const vatId = str(seller['vatId']);
  const legalId = str(seller['legalId']);
  const name = str(seller['name']);
  if (vatId) out.vatId = vatId;
  if (legalId) out.legalId = legalId;
  if (name) out.name = name;
  return out;
}

/**
 * Ключовете на документите с поне още едно неотказано копие — по всички месеци: копие с избран друг месец
 * иначе би влязло два пъти в два различни дневника.
 */
async function duplicatedKeys(organizationId: string, numbers: string[]): Promise<Set<string>> {
  if (!numbers.length) return new Set();
  const [incoming, inbox] = await Promise.all([
    prisma.incomingInvoice.findMany({
      where: { organizationId, status: { not: 'REJECTED' }, number: { in: numbers } },
      select: {
        number: true,
        typeCode: true,
        supplierVat: true,
        supplierEik: true,
        supplierName: true,
      },
    }),
    prisma.inboxEntry.findMany({
      where: {
        recipientOrgId: organizationId,
        status: { not: 'REJECTED' },
        document: { number: { in: numbers } },
      },
      select: { document: { select: { number: true, typeCode: true, input: true } } },
    }),
  ]);
  const keys = [
    ...incoming.map((row) =>
      supplierDocumentKey({
        vatId: row.supplierVat,
        legalId: row.supplierEik,
        name: row.supplierName,
        number: row.number,
        typeCode: row.typeCode,
      }),
    ),
    ...inbox.map((row) =>
      supplierDocumentKey({
        ...sellerOf(row.document.input),
        number: row.document.number ?? '',
        typeCode: row.document.typeCode,
      }),
    ),
  ];
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const key of keys) (seen.has(key) ? twice : seen).add(key);
  return twice;
}

export async function loadPurchases(
  organizationId: string,
  period: string,
): Promise<PurchaseEntry[]> {
  const month = monthRange(period);
  const [incoming, inbox, cancelledLater] = await Promise.all([
    prisma.incomingInvoice.findMany({
      where: {
        organizationId,
        status: { not: 'REJECTED' },
        OR: [
          { journalPeriod: period },
          { journalPeriod: null, issueDate: month },
          { journalPeriod: null, issueDate: null, createdAt: withMargin(month) },
        ],
      },
      select: {
        number: true,
        typeCode: true,
        issueDate: true,
        journalPeriod: true,
        createdAt: true,
        vatCredit: true,
        valid: true,
        issues: true,
        supplierVat: true,
        supplierEik: true,
        supplierName: true,
        xml: true,
      },
    }),
    prisma.inboxEntry.findMany({
      where: {
        recipientOrgId: organizationId,
        status: { not: 'REJECTED' },
        OR: [{ journalPeriod: period }, { journalPeriod: null, document: { issueDate: month } }],
      },
      select: {
        vatCredit: true,
        document: {
          select: {
            number: true,
            typeCode: true,
            issueDate: true,
            status: true,
            cancelledAt: true,
            input: true,
          },
        },
      },
    }),
    // Анулираните в този месец, вписани в по-ранен — за корекция.
    prisma.inboxEntry.findMany({
      where: {
        recipientOrgId: organizationId,
        status: { not: 'REJECTED' },
        document: { status: 'CANCELLED', cancelledAt: withMargin(month) },
      },
      select: {
        journalPeriod: true,
        document: { select: { number: true, typeCode: true, issueDate: true, cancelledAt: true } },
      },
    }),
  ]);

  const numbers = [
    ...incoming.map((row) => row.number),
    ...inbox.flatMap((row) => (row.document.number ? [row.document.number] : [])),
  ];
  const duplicated = await duplicatedKeys(organizationId, [...new Set(numbers)]);
  const entries: PurchaseEntry[] = [];

  for (const row of incoming) {
    // Без дата: само в месеца на получаване (или в избрания); редовете от запаса на заявката — не.
    if (!row.issueDate && row.journalPeriod !== period && sofiaMonth(row.createdAt) !== period) {
      continue;
    }
    const key = supplierDocumentKey({
      vatId: row.supplierVat,
      legalId: row.supplierEik,
      name: row.supplierName,
      number: row.number,
      typeCode: row.typeCode,
    });
    const manual: PurchaseManualReason | undefined = !row.issueDate
      ? 'date'
      : duplicated.has(key)
        ? 'duplicate'
        : hasRule(row.issues, 'BUYER')
          ? 'buyer'
          : !row.valid
            ? 'invalid'
            : undefined;
    entries.push({
      number: row.number,
      typeCode: row.typeCode,
      issueDate: row.issueDate,
      credit: row.vatCredit,
      input: manual ? null : parseIncoming(row.xml),
      ...(manual ? { manual } : {}),
    });
  }

  for (const row of inbox) {
    const doc = row.document;
    const number = doc.number ?? '';
    const key = supplierDocumentKey({
      ...sellerOf(doc.input),
      number,
      typeCode: doc.typeCode,
    });
    // Анулиран до края на месеца на дневника — не се вписва; по-късно — вписва се, корекцията е отделно.
    const cancelledBy =
      doc.status === 'CANCELLED' && (!doc.cancelledAt || sofiaMonth(doc.cancelledAt) <= period);
    const manual: PurchaseManualReason | undefined = cancelledBy
      ? 'cancelled'
      : duplicated.has(key)
        ? 'duplicate'
        : undefined;
    const input = manual ? null : InvoiceInputSchema.safeParse(doc.input);
    entries.push({
      number,
      typeCode: doc.typeCode,
      issueDate: doc.issueDate,
      credit: row.vatCredit,
      input: input?.success ? input.data : null,
      ...(manual ? { manual } : {}),
    });
  }

  for (const row of cancelledLater) {
    const doc = row.document;
    if (!doc.cancelledAt || sofiaMonth(doc.cancelledAt) !== period) continue;
    const journal = journalPeriodOf({ journalPeriod: row.journalPeriod, issueDate: doc.issueDate });
    if (!journal || journal >= period) continue;
    entries.push({
      number: doc.number ?? '',
      typeCode: doc.typeCode,
      issueDate: doc.issueDate,
      credit: 'FULL',
      input: null,
      manual: 'cancelledLater',
    });
  }
  return entries;
}
