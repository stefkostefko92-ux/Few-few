/**
 * Документът в API-то (SPEC 53): сумите са десетичен текст („123.45“), не float; датите — „ГГГГ-ММ-ДД“.
 * Връзките са относителни към /api/v1.
 */
export interface DocumentRow {
  id: string;
  number: string | null;
  typeCode: string;
  status: string;
  issueDate: Date;
  taxPointDate: Date | null;
  dueDate: Date | null;
  currency: string;
  buyerName: string;
  buyerEik: string | null;
  taxExclusiveCents: bigint;
  vatCents: bigint;
  taxInclusiveCents: bigint;
  payableCents: bigint;
  paidCents: bigint;
  paymentState: string;
  cancelledAt: Date | null;
}

export const DOCUMENT_ROW_SELECT = {
  id: true,
  number: true,
  typeCode: true,
  status: true,
  issueDate: true,
  taxPointDate: true,
  dueDate: true,
  currency: true,
  buyerName: true,
  buyerEik: true,
  taxExclusiveCents: true,
  vatCents: true,
  taxInclusiveCents: true,
  payableCents: true,
  paidCents: true,
  paymentState: true,
  cancelledAt: true,
} as const;

export function amount(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  return `${negative ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

export function documentJson(doc: DocumentRow) {
  return {
    id: doc.id,
    number: doc.number,
    typeCode: doc.typeCode,
    status: doc.status,
    issueDate: day(doc.issueDate),
    taxPointDate: day(doc.taxPointDate),
    dueDate: day(doc.dueDate),
    currency: doc.currency,
    buyer: { name: doc.buyerName, legalId: doc.buyerEik },
    totals: {
      taxExclusive: amount(doc.taxExclusiveCents),
      vat: amount(doc.vatCents),
      taxInclusive: amount(doc.taxInclusiveCents),
      payable: amount(doc.payableCents),
    },
    payment: { state: doc.paymentState, paid: amount(doc.paidCents) },
    cancelledAt: doc.cancelledAt ? doc.cancelledAt.toISOString() : null,
    links: {
      self: `/api/v1/documents/${doc.id}`,
      pdf: `/api/v1/documents/${doc.id}/pdf`,
      ubl: `/api/v1/documents/${doc.id}/ubl.xml`,
      cii: `/api/v1/documents/${doc.id}/cii.xml`,
    },
  };
}
