import PDFDocument from 'pdfkit';
import { loadPdfStyle } from '../documents/pdf-style.js';
import { INK, RULE, SOFT } from '../documents/pdf-layout.js';

/**
 * Проформата за банков превод (SPEC 49): покана за плащане с основанието, по което мастърът сверява
 * превода. НЕ е данъчен документ — фактурата се издава от Карбон Стелт при получаване на плащането
 * (датата на плащането е данъчното събитие). Сумите идват от поръчката (сървъра), не от формата.
 */
export interface ProformaSource {
  supplierOrgId: string;
  supplier: {
    legalName: string;
    eik: string | null;
    vatNumber: string | null;
    address: string;
    iban: string;
    bic: string | null;
  };
  buyer: { legalName: string; eik: string | null; vatNumber: string | null; address: string };
  reference: string;
  createdAt: Date;
  description: string;
  netCents: number;
  vatCents: number;
  vatRate: string;
  totalCents: number;
}

const date = (value: Date) => value.toISOString().slice(0, 10).split('-').reverse().join('.');

function eur(cents: number): string {
  const whole = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${whole},${String(cents % 100).padStart(2, '0')} €`;
}

export async function proformaPdf(source: ProformaSource): Promise<Buffer> {
  const style = await loadPdfStyle(source.supplierOrgId);
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 56, bottom: 56, left: 56, right: 56 },
    info: {
      Title: `Проформа ${source.reference}`,
      Creator: 'fakturist.eu — Carbon Stealth VCC',
      Producer: 'Фактурист',
    },
  });
  doc.registerFont('sans', style.fonts.regular);
  doc.registerFont('bold', style.fonts.bold);
  doc.registerFont('mono', style.fonts.mono);
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  doc.font('bold').fontSize(18).fillColor(INK).text('ПРОФОРМА', left, 56, { width });
  doc
    .font('sans')
    .fontSize(10)
    .fillColor(SOFT)
    .text(`№ ${source.reference} от ${date(source.createdAt)} · покана за плащане`, { width });
  doc.moveDown(1.2);

  const party = (label: string, p: ProformaSource['buyer']) => {
    doc.font('bold').fontSize(9).fillColor(SOFT).text(label.toUpperCase(), { width });
    doc.font('sans').fontSize(11).fillColor(INK).text(p.legalName, { width });
    const ids = [p.eik ? `ЕИК ${p.eik}` : null, p.vatNumber ? `ДДС № ${p.vatNumber}` : null]
      .filter(Boolean)
      .join(' · ');
    if (ids) doc.fontSize(10).text(ids, { width });
    if (p.address) doc.fontSize(10).fillColor(SOFT).text(p.address, { width });
    doc.moveDown(0.8);
  };
  party('Доставчик', source.supplier);
  party('Получател', source.buyer);

  const row = (label: string, value: string, bold = false) => {
    const y = doc.y;
    doc
      .font(bold ? 'bold' : 'sans')
      .fontSize(11)
      .fillColor(INK)
      .text(label, left, y, { width: width - 140 });
    doc.text(value, left + width - 140, y, { width: 140, align: 'right' });
    doc.moveDown(0.4);
  };
  doc
    .moveTo(left, doc.y)
    .lineTo(left + width, doc.y)
    .lineWidth(0.6)
    .strokeColor(RULE)
    .stroke();
  doc.moveDown(0.6);
  row(source.description, eur(source.netCents));
  row(`ДДС ${source.vatRate} %`, eur(source.vatCents));
  row('За плащане', eur(source.totalCents), true);
  doc.moveDown(1);

  doc
    .font('bold')
    .fontSize(9)
    .fillColor(SOFT)
    .text('ПЛАЩАНЕ ПО БАНКОВ ПЪТ', left, doc.y, { width });
  doc.font('sans').fontSize(11).fillColor(INK);
  doc.text(`Получател: ${source.supplier.legalName}`, { width });
  doc.font('mono').text(`IBAN: ${source.supplier.iban}`, { width });
  if (source.supplier.bic) doc.text(`BIC: ${source.supplier.bic}`, { width });
  doc.font('bold').text(`Основание: ${source.reference}`, { width });
  doc.moveDown(1);
  doc
    .font('sans')
    .fontSize(9)
    .fillColor(SOFT)
    .text(
      'Посочете основанието точно — по него се свързва преводът с поръчката. Проформата не е данъчен ' +
        'документ: фактурата се издава при получаване на плащането, с датата му, и пристига в шкафчето ' +
        'на фирмата във Фактурист и по имейл.',
      { width },
    );
  doc.end();
  return done;
}
