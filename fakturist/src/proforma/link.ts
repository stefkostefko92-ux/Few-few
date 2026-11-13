import type { Prisma } from '@prisma/client';
import { audit } from '../audit.js';

/**
 * Връзката проформа → фактура (без зависимост от издаването, за да няма цикъл в модулите). Проформата
 * се превръща във фактура веднъж: условен запис по състоянието в транзакцията на издаването — втори опит
 * (двоен клик, втори таб) хвърля и връща номера на фактурата.
 */
export class ProformaError extends Error {
  constructor(readonly code: 'notFound' | 'notOpen' | 'type' | 'mailLimit' | 'noEmail') {
    super(code);
  }
}

/** Видовете фактура, в които проформа може да се превърне: фактура или авансова фактура. */
export const PROFORMA_TARGET_TYPES: readonly string[] = ['380', '386'];

export async function linkProformaInvoice(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    proformaId: string;
    documentId: string;
    typeCode: string;
    actorId: string;
  },
): Promise<void> {
  if (!PROFORMA_TARGET_TYPES.includes(input.typeCode)) throw new ProformaError('type');
  const linked = await tx.proforma.updateMany({
    where: { id: input.proformaId, organizationId: input.organizationId, status: 'OPEN' },
    data: { status: 'INVOICED', invoiceDocumentId: input.documentId, invoicedAt: new Date() },
  });
  if (linked.count !== 1) throw new ProformaError('notOpen');
  await audit(tx, {
    actorId: input.actorId,
    organizationId: input.organizationId,
    action: 'proforma.invoiced',
    targetType: 'Proforma',
    targetId: input.proformaId,
    details: { documentId: input.documentId },
  });
}
