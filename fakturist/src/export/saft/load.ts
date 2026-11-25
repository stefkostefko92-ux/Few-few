import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { InvoiceInputSchema, type PartyInput } from '../../einvoice/model.js';
import { sofiaToday } from '../../time.js';
import { customerBalances, type BalanceDocument } from './balances.js';
import type { SaftBalance, SaftCodes, SaftDocument } from './model.js';

/**
 * Данните за месеца от базата: документите, издадени в него (по дата на издаване), и — само за файла —
 * салдата на клиентите им по документите и плащанията във Фактурист. В Customers влизат само
 * контрагентите, които се срещат в другите секции (Приложение 3).
 */
const day = (date: Date) => date.toISOString().slice(0, 10);

export function monthBounds(period: string): { start: Date; next: Date; from: string; to: string } {
  const start = new Date(`${period}-01T00:00:00Z`);
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { start, next, from: day(start), to: day(new Date(next.getTime() - 1)) };
}

/**
 * Надмножество на документите на тези купувачи — по наименование, ЕИК (колоните) или ДДС номер (пътят в
 * JSON-а, за купувач без ЕИК); точното съвпадение по CustomerID е в JS.
 */
function buyersFilter(buyers: readonly PartyInput[]): Prisma.DocumentWhereInput[] {
  const names = [...new Set(buyers.map((b) => b.name))];
  const legalIds = [...new Set(buyers.flatMap((b) => (b.legalId ? [b.legalId] : [])))];
  const vatIds = [...new Set(buyers.flatMap((b) => (!b.legalId && b.vatId ? [b.vatId] : [])))];
  return [
    { buyerName: { in: names } },
    ...(legalIds.length ? [{ buyerEik: { in: legalIds } }] : []),
    ...vatIds.map((vat) => ({ input: { path: ['buyer', 'vatId'], equals: vat } })),
  ];
}

async function loadBalances(
  organizationId: string,
  documents: readonly SaftDocument[],
  period: string,
  codes: SaftCodes,
): Promise<Map<string, SaftBalance>> {
  const { next, from, to } = monthBounds(period);
  const customers = new Set(documents.map((d) => codes.customerId(d.input.buyer)));
  if (customers.size === 0) return new Map();
  const OR = buyersFilter(documents.map((d) => d.input.buyer));
  // Без горна граница по дата: заменящ документ, издаден след месеца, носи плащания, направени в него.
  const history = await prisma.document.findMany({
    where: { organizationId, status: { in: ['ISSUED', 'CANCELLED'] }, OR },
    select: {
      id: true,
      typeCode: true,
      issueDate: true,
      cancelledAt: true,
      payableCents: true,
      input: true,
      preceding: { select: { typeCode: true } },
    },
  });
  const balanceDocs: BalanceDocument[] = [];
  for (const doc of history) {
    const input = InvoiceInputSchema.parse(doc.input);
    const customerId = codes.customerId(input.buyer);
    if (!customers.has(customerId)) continue;
    balanceDocs.push({
      id: doc.id,
      customerId,
      typeCode: doc.typeCode,
      precedingTypeCode: doc.preceding?.typeCode ?? null,
      issueDate: day(doc.issueDate),
      cancelledOn: doc.cancelledAt ? sofiaToday(doc.cancelledAt) : null,
      payableCents: doc.payableCents,
      currency: input.currency,
      eurExchangeRate: input.eurExchangeRate,
    });
  }
  // Плащанията — по същия филтър през връзката (без списък от id-та: таванът на параметрите).
  const payments = await prisma.documentPayment.findMany({
    where: { paidOn: { lt: next }, document: { organizationId, OR } },
    select: { documentId: true, paidOn: true, amountCents: true },
  });
  return customerBalances(
    balanceDocs,
    payments.map((p) => ({ ...p, paidOn: day(p.paidOn) })),
    from,
    to,
  );
}

export async function loadSaftMonth(
  organizationId: string,
  period: string,
  codes: SaftCodes,
  options: { balances: boolean },
): Promise<{ documents: SaftDocument[]; balances: Map<string, SaftBalance> }> {
  const { start, next } = monthBounds(period);
  const rows = await prisma.document.findMany({
    where: {
      organizationId,
      status: { in: ['ISSUED', 'CANCELLED'] },
      number: { not: null },
      issueDate: { gte: start, lt: next },
    },
    orderBy: [{ issueDate: 'asc' }, { chainIndex: 'asc' }],
    select: { number: true, typeCode: true, status: true, input: true },
  });
  const documents: SaftDocument[] = rows.map((row) => ({
    number: row.number!,
    typeCode: row.typeCode,
    status: row.status === 'CANCELLED' ? 'CANCELLED' : 'ISSUED',
    input: InvoiceInputSchema.parse(row.input),
  }));
  const balances = options.balances
    ? await loadBalances(organizationId, documents, period, codes)
    : new Map<string, SaftBalance>();
  return { documents, balances };
}
