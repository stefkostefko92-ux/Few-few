import PDFDocument from 'pdfkit';
import { InvoiceInputSchema } from '../einvoice/model.js';
import { loadPdfStyle } from './pdf-style.js';
import { INK, RULE, SOFT } from './pdf-layout.js';
import { TITLES } from './pdf-format.js';
import { ANNUL_REASON_TEXT, isAnnulReason } from './annul.js';

/**
 * Протоколът за анулиране по чл. 116, ал. 4 ЗДДС (SPEC 47; docs/kazus-anulirane.md): основанието, номерът
 * и датата на анулирания и на новия документ, страните и място за подпис на съставителите — за всяка от
 * страните. Съставя се винаги (и когато документът още не е отразен в регистрите — безопасно).
 */
export interface ProtocolSource {
  organizationId: string;
  number: string | null;
  typeCode: string;
  issueDate: Date;
  input: unknown;
  cancelledAt: Date | null;
  cancelReason: string | null;
  cancelledBy: { name: string } | null;
  replacedBy: { number: string | null; issueDate: Date } | null;
}

const date = (value: Date | null | undefined) =>
  value ? value.toISOString().slice(0, 10).split('-').reverse().join('.') : '—';

export async function annulProtocolPdf(source: ProtocolSource): Promise<Buffer> {
  const input = InvoiceInputSchema.parse(source.input);
  const style = await loadPdfStyle(source.organizationId);
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 56, bottom: 56, left: 56, right: 56 },
    info: {
      Title: `Протокол за анулиране на ${source.number ?? ''}`,
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
  const title = TITLES[source.typeCode] ?? 'Документ';
  const reason = isAnnulReason(source.cancelReason)
    ? ANNUL_REASON_TEXT[source.cancelReason].bg
    : (source.cancelReason ?? '—');

  doc
    .font('bold')
    .fontSize(16)
    .fillColor(INK)
    .text('ПРОТОКОЛ', left, 56, { width, align: 'center' });
  doc
    .font('sans')
    .fontSize(11)
    .text('за анулиране на данъчен документ по чл. 116, ал. 4 ЗДДС', { width, align: 'center' });
  doc.moveDown(0.4);
  doc
    .fontSize(10)
    .fillColor(SOFT)
    .text(`Дата на анулирането: ${date(source.cancelledAt)}`, {
      width,
      align: 'center',
    });
  doc.moveDown(1.2);

  const row = (label: string, value: string) => {
    doc.font('bold').fontSize(9).fillColor(SOFT).text(label.toUpperCase(), { width });
    doc.font('sans').fontSize(11).fillColor(INK).text(value, { width });
    doc.moveDown(0.6);
  };
  const party = (p: { name: string; legalId?: string | undefined; vatId?: string | undefined }) =>
    [p.name, p.legalId ? `ЕИК ${p.legalId}` : null, p.vatId ? `ДДС № ${p.vatId}` : null]
      .filter(Boolean)
      .join(', ');

  row('Доставчик', party(input.seller));
  row('Получател', party(input.buyer));
  row('1. Основание за анулирането', reason);
  row('2. Анулиран документ', `${title} № ${source.number ?? '—'} от ${date(source.issueDate)}`);
  row(
    '3. Новият документ',
    source.replacedBy
      ? `${title} № ${source.replacedBy.number ?? '—'} от ${date(source.replacedBy.issueDate)}`
      : '—',
  );
  doc
    .font('sans')
    .fontSize(9)
    .fillColor(SOFT)
    .text(
      'Всички екземпляри на анулирания документ се съхраняват при издателя (чл. 116, ал. 5 ЗДДС). ' +
        'Протоколът се съставя за всяка от страните.',
      { width },
    );
  doc.moveDown(2);

  // 4. Подписите на съставителите — за всяка от страните.
  const y = doc.y;
  const col = (width - 24) / 2;
  const signature = (x: number, side: string, name: string) => {
    doc.font('bold').fontSize(9).fillColor(SOFT).text(side.toUpperCase(), x, y, { width: col });
    doc
      .moveTo(x, y + 52)
      .lineTo(x + col, y + 52)
      .lineWidth(0.6)
      .strokeColor(RULE)
      .stroke();
    doc
      .font('sans')
      .fontSize(9)
      .fillColor(INK)
      .text(name, x, y + 58, { width: col });
  };
  signature(
    left,
    'Съставил за доставчика',
    source.cancelledBy ? `${source.cancelledBy.name} (анулирал в системата)` : 'име и подпис',
  );
  signature(left + col + 24, 'Съставил за получателя', 'име и подпис');
  doc.end();
  return done;
}
