import { prisma } from '../db.js';
import { proformaDocumentPdf } from '../proforma/render.js';
import { csvCell } from './csv.js';
import type { ZipWriter } from './zip.js';

/**
 * Останалото в износа на фирмата (одитите от 13.11.2026 — договорът за обработване, т. 11: „всички
 * документи“): проформите (PDF), получените е-фактури (XML точно както са получени — качени или през
 * Peppol) и плащанията по документите (CSV). На страници — паметта не расте с броя им.
 */
const PAGE = 100;

function cents(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  return `${negative ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/** Безопасно име на файл в архива от номер, който идва отвън (входящите). */
function safeName(value: string): string {
  return value.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 80) || 'bez-nomer';
}

export async function addProformas(zip: ZipWriter, organizationId: string): Promise<number> {
  let count = 0;
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.proforma.findMany({
      where: { organizationId },
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, number: true, input: true, pdfLanguage: true, organizationId: true },
    });
    for (const proforma of page) {
      await zip.add(
        `proformi/${safeName(proforma.number)}.pdf`,
        await proformaDocumentPdf(proforma),
        false,
      );
      count += 1;
    }
    cursor = page[page.length - 1]?.id;
    if (page.length < PAGE) break;
  }
  return count;
}

export async function addIncoming(zip: ZipWriter, organizationId: string): Promise<number> {
  const register = [
    [
      'Файл',
      'Доставчик',
      'ЕИК',
      'Номер',
      'Дата',
      'Валута',
      'ДДС',
      'За плащане',
      'Източник',
      'Платено на',
    ]
      .map(csvCell)
      .join(','),
  ];
  let count = 0;
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.incomingInvoice.findMany({
      where: { organizationId },
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        xml: true,
        supplierName: true,
        supplierEik: true,
        number: true,
        issueDate: true,
        currency: true,
        vatCents: true,
        payableCents: true,
        source: true,
        paidAt: true,
      },
    });
    for (const entry of page) {
      const file = `vhodyashti/${safeName(entry.supplierEik ?? entry.supplierName)}-${safeName(entry.number)}-${entry.id.slice(-6)}.xml`;
      await zip.add(file, Buffer.from(entry.xml, 'utf8'));
      register.push(
        [
          file,
          entry.supplierName,
          entry.supplierEik ?? '',
          entry.number,
          entry.issueDate?.toISOString().slice(0, 10) ?? '',
          entry.currency,
          cents(entry.vatCents),
          cents(entry.payableCents),
          entry.source,
          entry.paidAt?.toISOString().slice(0, 10) ?? '',
        ]
          .map(csvCell)
          .join(','),
      );
      count += 1;
    }
    cursor = page[page.length - 1]?.id;
    if (page.length < PAGE) break;
  }
  if (count > 0) {
    await zip.add('vhodyashti.csv', Buffer.from(`﻿${register.join('\r\n')}\r\n`, 'utf8'));
  }
  return count;
}

export async function addPayments(zip: ZipWriter, organizationId: string): Promise<number> {
  const payments = await prisma.documentPayment.findMany({
    where: { document: { organizationId } },
    orderBy: [{ paidOn: 'asc' }, { id: 'asc' }],
    select: {
      amountCents: true,
      paidOn: true,
      source: true,
      note: true,
      document: { select: { number: true, currency: true } },
    },
  });
  if (payments.length === 0) return 0;
  const rows = [
    ['Документ', 'Дата', 'Сума', 'Валута', 'Източник', 'Бележка'].map(csvCell).join(','),
    ...payments.map((p) =>
      [
        p.document.number ?? '',
        p.paidOn.toISOString().slice(0, 10),
        cents(p.amountCents),
        p.document.currency,
        p.source,
        p.note ?? '',
      ]
        .map(csvCell)
        .join(','),
    ),
  ];
  await zip.add('plashtaniya.csv', Buffer.from(`﻿${rows.join('\r\n')}\r\n`, 'utf8'));
  return payments.length;
}
