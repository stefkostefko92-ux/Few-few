import { prisma } from '../db.js';
import { InvoiceInputSchema, type InvoiceInput } from '../einvoice/model.js';
import { checkIncoming } from '../incoming/check.js';
import type { PurchaseEntry } from './purchase-journal.js';

/**
 * Покупките за месеца на дневника: входящите (качени и получени през Peppol) и доставените в шкафчето, без
 * отказаните. Месецът е избраният за дневника, иначе месецът на издаване (SPEC 68). Анулиран от
 * изпращача документ от шкафчето не се смята наслуки — излиза „за ръчно“ (Приложение № 12: анулиран в
 * месеца на издаване не се вписва, по-късно — с обратен знак в месеца на анулирането).
 */
function monthRange(period: string): { gte: Date; lt: Date } {
  const start = new Date(`${period}-01T00:00:00Z`);
  return { gte: start, lt: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) };
}

/** Входящ XML → входа по модела; неразчетен — null (не хвърля: файлът е получен, грешката се показва). */
function parsedIncoming(xml: string): InvoiceInput | null {
  try {
    return checkIncoming(xml).parsed;
  } catch {
    return null;
  }
}

export async function loadPurchases(
  organizationId: string,
  period: string,
): Promise<{ entries: PurchaseEntry[]; cancelled: string[] }> {
  const month = monthRange(period);
  const [incoming, inbox] = await Promise.all([
    prisma.incomingInvoice.findMany({
      where: {
        organizationId,
        status: { not: 'REJECTED' },
        OR: [{ journalPeriod: period }, { journalPeriod: null, issueDate: month }],
      },
      select: { number: true, typeCode: true, issueDate: true, vatCredit: true, xml: true },
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
          select: { number: true, typeCode: true, issueDate: true, status: true, input: true },
        },
      },
    }),
  ]);
  const entries: PurchaseEntry[] = [];
  const cancelled: string[] = [];
  for (const row of incoming) {
    if (!row.issueDate) continue;
    entries.push({
      number: row.number,
      typeCode: row.typeCode,
      issueDate: row.issueDate,
      credit: row.vatCredit,
      input: parsedIncoming(row.xml),
    });
  }
  for (const row of inbox) {
    const doc = row.document;
    if (doc.status === 'CANCELLED') {
      cancelled.push(doc.number ?? '');
      continue;
    }
    const input = InvoiceInputSchema.safeParse(doc.input);
    entries.push({
      number: doc.number ?? '',
      typeCode: doc.typeCode,
      issueDate: doc.issueDate,
      credit: row.vatCredit,
      input: input.success ? input.data : null,
    });
  }
  return { entries, cancelled };
}
