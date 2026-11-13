import { prisma } from '../db.js';
import { documentPdf } from '../documents/render.js';
import { DOWNLOAD_SELECT } from '../routes/app-shared.js';
import { ZipWriter, type ZipSink } from './zip.js';

/**
 * Износът на фирмата (SPEC 48; договорът за обработване, т. 11 — връщане на данните): ZIP с всеки
 * издаден документ като PDF, UBL и CII (XML-ите — точно както са издадени), регистър на документите
 * (CSV), контрагенти, артикули и серии (JSON). Документите се четат на страници — паметта не расте с
 * броя им.
 */
const PAGE = 100;

function csvCell(value: string): string {
  return /[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function cents(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  return `${negative ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

function json(value: unknown): Buffer {
  return Buffer.from(
    `${JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? v.toString() : v), 2)}\n`,
    'utf8',
  );
}

export async function exportOrganization(organizationId: string, sink: ZipSink): Promise<number> {
  const zip = new ZipWriter(sink);
  const register: string[] = [
    ['Номер', 'Вид', 'Дата', 'Статус', 'Получател', 'ЕИК', 'Валута', 'Без ДДС', 'ДДС', 'За плащане']
      .map(csvCell)
      .join(','),
  ];
  let count = 0;
  let cursor: string | undefined;
  for (;;) {
    const docs = await prisma.document.findMany({
      where: { organizationId, status: { not: 'DRAFT' } },
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        ...DOWNLOAD_SELECT,
        id: true,
        typeCode: true,
        issueDate: true,
        buyerName: true,
        buyerEik: true,
        currency: true,
        taxExclusiveCents: true,
        vatCents: true,
        payableCents: true,
      },
    });
    if (docs.length === 0) break;
    for (const doc of docs) {
      const number = doc.number ?? doc.id;
      await zip.add(`dokumenti/${number}.pdf`, await documentPdf(doc), false);
      if (doc.ublXml) await zip.add(`dokumenti/${number}-ubl.xml`, Buffer.from(doc.ublXml));
      if (doc.ciiXml) await zip.add(`dokumenti/${number}-cii.xml`, Buffer.from(doc.ciiXml));
      register.push(
        [
          number,
          doc.typeCode,
          doc.issueDate.toISOString().slice(0, 10),
          doc.status ?? '',
          doc.buyerName,
          doc.buyerEik ?? '',
          doc.currency,
          cents(doc.taxExclusiveCents),
          cents(doc.vatCents),
          cents(doc.payableCents),
        ]
          .map(csvCell)
          .join(','),
      );
      count += 1;
    }
    cursor = docs[docs.length - 1]?.id;
    if (docs.length < PAGE) break;
  }
  // UTF-8 с BOM — Excel отваря кирилицата правилно.
  await zip.add('dokumenti.csv', Buffer.from(`﻿${register.join('\r\n')}\r\n`, 'utf8'));
  const [org, parties, items, series] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        legalName: true,
        eik: true,
        vatNumber: true,
        addressStreet: true,
        addressCity: true,
        postalCode: true,
        iban: true,
      },
    }),
    prisma.party.findMany({ where: { organizationId }, orderBy: { name: 'asc' } }),
    prisma.item.findMany({ where: { organizationId }, orderBy: { name: 'asc' } }),
    prisma.documentSeries.findMany({ where: { organizationId }, orderBy: { rangeStart: 'asc' } }),
  ]);
  await zip.add('firma.json', json(org));
  await zip.add('kontragenti.json', json(parties));
  await zip.add('artikuli.json', json(items));
  await zip.add('serii.json', json(series));
  await zip.add(
    'PROCHETI.txt',
    Buffer.from(
      [
        `Износ от Фактурист — ${org.legalName}`,
        `Създаден: ${new Date().toISOString()}`,
        '',
        'dokumenti/ — всеки документ: PDF (четимо копие), UBL 2.1 и CII (структурираният XML по',
        'EN 16931, точно както е издаден). dokumenti.csv — регистърът. kontragenti.json, artikuli.json,',
        'serii.json, firma.json — каталогът и данните на фирмата.',
        '',
        'Документите се пазят от фирмата за сроковете по Закона за счетоводството и ЗДДС.',
        '',
      ].join('\r\n'),
      'utf8',
    ),
  );
  await zip.finish();
  return count;
}
