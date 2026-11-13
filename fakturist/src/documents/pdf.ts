import PDFDocument from 'pdfkit';
import { dec, toPlain } from '../einvoice/decimal.js';
import { documentNote } from '../einvoice/notes.js';
import type { Calculated } from '../einvoice/calculate.js';
import type { InvoiceInput, PartyInput } from '../einvoice/model.js';
import {
  bgAmount,
  bgDate,
  MEANS,
  partyLines,
  breakdownLine,
  TITLES,
  UNITS,
  unitPrice,
  vatCell,
} from './pdf-format.js';
import { drawDates, drawHeader, INK, METRICS, RULE, SOFT, tint, type Frame } from './pdf-layout.js';
import type { ResolvedPdfStyle } from './pdf-style.js';
import { drawFooters } from './pdf-footer.js';
import {
  englishOf,
  issuedViaText,
  labeler,
  PROFORMA_NOT_TAX,
  type PdfLanguage,
} from './pdf-labels.js';
export { bgAmount } from './pdf-format.js';

/**
 * Четимото копие на документа (A4). Правно значимият документ е XML-ът (UBL/CII); PDF-ът се прави от
 * СЪЩИЯ вход и СЪЩОТО изчисление, затова числата не могат да се разминат. Изгледът (шрифт, шаблон,
 * цвят, лого) е на фирмата (pdf-style.ts); съдържанието — реквизитите, сумите, пълномощното и подписът
 * на продукта в долния ред на всяка страница — е едно и също във всеки изглед.
 */
export interface PdfMeta {
  number: string;
  chainIndex: bigint | null;
  sha256: string | null;
  signature: string | undefined;
  /** Кантората и пълномощното, когато документът е издаден от името на фирмата. */
  issuedVia: { firm: string; mandateRef: string } | null;
  annulled?: string | null; // „АНУЛИРАН …“ горе на всяка страница (чл. 116 ЗДДС, pdf-stamp.ts)
  /** Български или двуезичен (pdf-labels.ts); липсва — български. */
  language?: PdfLanguage;
  /** Проформа (src/proforma/): заглавие „ПРОФОРМА ФАКТУРА“, без дата на данъчно събитие, с бележка, че не е данъчен документ. */
  proforma?: boolean;
}

export function renderPdf(
  input: InvoiceInput,
  calc: Calculated,
  meta: PdfMeta,
  style: ResolvedPdfStyle,
): Promise<Buffer> {
  const m = METRICS[style.template];
  const lang = meta.language ?? 'bg';
  const L = labeler(lang);
  const titleBg = meta.proforma ? 'ПРОФОРМА ФАКТУРА' : (TITLES[input.typeCode] ?? 'ДОКУМЕНТ');
  const title = L(titleBg);
  // При двуезичния английското заглавие е подзаглавие (pdf-layout.ts) — едно дълго не се побира.
  const subtitle = lang === 'bg-en' ? (englishOf(titleBg) ?? undefined) : undefined;
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: m.margin, bottom: m.margin + 16, left: m.margin, right: m.margin },
    bufferPages: true,
    info: {
      Title: `${title} ${meta.number}`,
      Author: input.seller.name,
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
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const frame: Frame = { left, right, width };
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const currency = input.currency;
  let y = doc.page.margins.top;

  const ensure = (height: number) => {
    if (y + height > bottom()) {
      doc.addPage();
      y = doc.page.margins.top;
    }
  };
  const rule = (at: number, color = RULE, thickness = 0.6) => {
    doc.moveTo(left, at).lineTo(right, at).lineWidth(thickness).strokeColor(color).stroke();
  };

  // --- Глава (по шаблона) и дати ---------------------------------------------------------------------
  y = drawHeader(doc, frame, y, {
    title: titleBg,
    subtitle,
    number: meta.number,
    style,
    m,
  });
  const dates: Array<[string, string]> = [[L('Дата на издаване', '\n'), bgDate(input.issueDate)]];
  if (!meta.proforma) {
    // Авансова фактура: датата е на получаване на плащането (чл. 114, ал. 1, т. 10 ЗДДС).
    const taxDate =
      input.typeCode === '386' ? 'Дата на получаване на плащането' : 'Дата на данъчното събитие';
    dates.push([L(taxDate, '\n'), bgDate(input.taxPointDate ?? input.issueDate)]);
  }
  if (input.dueDate) {
    dates.push([L(meta.proforma ? 'Срок за плащане' : 'Падеж', '\n'), bgDate(input.dueDate)]);
  }
  if (input.precedingInvoices[0]) {
    const p = input.precedingInvoices[0];
    dates.push([
      L('Към фактура', '\n'),
      `№ ${p.number}${p.issueDate ? ` / ${bgDate(p.issueDate)}` : ''}`,
    ]);
  }
  y = drawDates(doc, frame, y, dates, m);
  rule(y, INK, 1);
  y += 12;

  // --- Страните ------------------------------------------------------------------------------------
  const half = width / 2 - 12;
  const block = (title: string, party: PartyInput, x: number): number => {
    let at = y;
    doc
      .font('sans')
      .fontSize(m.small)
      .fillColor(SOFT)
      .text(title.toUpperCase(), x, at, { width: half, characterSpacing: 0.6 });
    at += m.small + 5;
    doc.font('bold').fontSize(m.partyName).fillColor(INK).text(party.name, x, at, { width: half });
    at = doc.y + 2;
    doc.font('sans').fontSize(m.body).fillColor(INK);
    for (const line of partyLines(party, L)) {
      doc.text(line, x, at, { width: half });
      at = doc.y + 1;
    }
    return at;
  };
  const end = Math.max(
    block(L('Доставчик'), input.seller, left),
    block(L('Получател'), input.buyer, left + width / 2 + 12),
  );
  y = end + 6;
  if (meta.issuedVia) {
    doc
      .font('sans')
      .fontSize(m.small)
      .fillColor(SOFT)
      .text(issuedViaText(lang, meta.issuedVia.firm, meta.issuedVia.mandateRef), left, y, {
        width,
      });
    y = doc.y + 4;
  }
  y += 8;

  // --- Редовете ------------------------------------------------------------------------------------
  const cols = [
    { label: '№', w: 22, align: 'left' as const },
    { label: L('Стока или услуга', '\n'), w: 0, align: 'left' as const },
    { label: L('Мярка', '\n'), w: 44, align: 'left' as const },
    { label: L('Кол.', '\n'), w: 42, align: 'right' as const },
    { label: L('Ед. цена', '\n'), w: 58, align: 'right' as const },
    { label: L('Отст.', '\n'), w: 40, align: 'right' as const },
    { label: L('ДДС', '\n'), w: 36, align: 'right' as const },
    { label: L('Стойност', '\n'), w: 72, align: 'right' as const },
  ];
  cols[1]!.w = width - cols.reduce((acc, c) => acc + c.w, 0);
  // Двуезичната глава е на два реда (български отгоре, английски отдолу).
  const headH = (lang === 'bg' ? m.head : m.head * 2 + 2) + 10.5;
  const header = () => {
    doc.rect(left, y, width, headH).fillColor(tint(style.accent)).fill();
    let x = left;
    doc.font('bold').fontSize(m.head).fillColor(INK);
    for (const c of cols) {
      const lines = lang === 'bg' ? 1 : 2;
      const top = y + (headH - m.head * lines - (lines - 1) * 2) / 2 - 0.5;
      doc.text(c.label, x + 4, top, { width: c.w - 8, align: c.align, lineGap: 2 });
      x += c.w;
    }
    y += headH + 2;
  };
  header();
  for (const line of calc.lines) {
    const source = input.lines[line.index]!;
    const discount = line.allowanceCharges
      .filter((a) => !a.isCharge)
      .map((a) => (a.percent ? `${toPlain(a.percent)}%` : bgAmount(a.amount)))
      .join(' ');
    const name = source.description ? `${source.name}\n${source.description}` : source.name;
    doc.font('sans').fontSize(m.body);
    const h = Math.max(doc.heightOfString(name, { width: cols[1]!.w - 8 }), 10) + m.rowPad;
    if (y + h > bottom()) {
      doc.addPage();
      y = doc.page.margins.top;
      header();
    }
    const cells = [
      source.id,
      name,
      UNITS[source.unitCode] ? L(UNITS[source.unitCode]!, '/') : source.unitCode,
      toPlain(dec(source.quantity)).replace('.', ','),
      unitPrice(source.netPrice),
      discount,
      vatCell(line.category, line.rate),
      bgAmount(line.net),
    ];
    let x = left;
    cells.forEach((cell, i) => {
      const c = cols[i]!;
      doc
        .font(i === 7 ? 'mono' : 'sans')
        .fillColor(INK)
        .text(cell, x + 4, y + m.rowPad / 2, { width: c.w - 8, align: c.align });
      x += c.w;
    });
    y += h;
    rule(y);
  }
  y += 10;

  // --- Разбивка по ДДС и тотали --------------------------------------------------------------------
  ensure(140);
  const t = calc.totals;
  const boxX = left + width * 0.5;
  const boxW = width * 0.5;
  const row = (label: string, value: string, strong = false) => {
    doc
      .font(strong ? 'bold' : 'sans')
      .fontSize(strong ? m.total : m.body + 0.5)
      .fillColor(INK);
    const labelH = doc.heightOfString(label, { width: boxW * 0.6 });
    doc.text(label, boxX, y, { width: boxW * 0.6 });
    doc
      .font(strong ? 'bold' : 'mono')
      .text(value, boxX + boxW * 0.6, y, { width: boxW * 0.4, align: 'right' });
    y += Math.max(labelH, strong ? m.total : m.body) + (strong ? 6.5 : 5.5);
  };
  const leftY = y;
  doc
    .font('bold')
    .fontSize(m.small)
    .fillColor(SOFT)
    .text(L('РАЗБИВКА ПО ДДС'), left, y, { characterSpacing: 0.6 });
  let ly = y + m.small + 5;
  for (const group of calc.breakdown) {
    doc
      .font('sans')
      .fontSize(m.body)
      .fillColor(INK)
      .text(breakdownLine(group, L), left, ly, { width: width * 0.46 });
    ly = doc.y + 2;
    if (group.exemptionReason) {
      doc
        .fillColor(SOFT)
        .text(`${L('Основание')}: ${group.exemptionReason}`, left, ly, { width: width * 0.46 });
      ly = doc.y + 2;
    }
  }
  y = leftY;
  row(L('Сума на редовете'), bgAmount(t.lineExtension));
  if (calc.hasDocumentAllowances) row(L('Отстъпки'), `−${bgAmount(t.allowances)}`);
  if (calc.hasDocumentCharges) row(L('Надбавки'), bgAmount(t.charges));
  row(L('Данъчна основа'), bgAmount(t.taxExclusive));
  const onlyReverse = calc.breakdown.every((group) => group.category === 'AE');
  if (!onlyReverse) row(L('ДДС'), bgAmount(t.vat));
  if (t.vatInEur && !onlyReverse) row(L('ДДС в евро'), `${bgAmount(t.vatInEur)} EUR`);
  row(L('Обща сума'), bgAmount(t.taxInclusive));
  if (t.prepaid.v !== 0n) row(L('Платено авансово'), `−${bgAmount(t.prepaid)}`);
  doc.moveTo(boxX, y).lineTo(right, y).lineWidth(1.2).strokeColor(style.accent).stroke();
  y += 5;
  row(`${L('За плащане')} (${currency})`, bgAmount(t.payable), true);
  y = Math.max(y, ly) + 12;

  // --- Плащане и бележка ---------------------------------------------------------------------------
  const info: string[] = [];
  if (input.payment) {
    const parts = [
      `${L('Начин на плащане')}: ${MEANS[input.payment.meansCode] ? L(MEANS[input.payment.meansCode]!) : input.payment.meansCode}`,
    ];
    if (input.payment.accountId) parts.push(`IBAN: ${input.payment.accountId}`);
    if (input.payment.bic) parts.push(`BIC: ${input.payment.bic}`);
    info.push(parts.join(' · '));
  }
  if (input.paymentTerms) info.push(`${L('Условия')}: ${input.paymentTerms}`);
  // Бележката без подписа — той е в долния ред на всяка страница.
  const note = documentNote(input, calc);
  if (note) info.push(note);
  if (meta.proforma) info.push(L(PROFORMA_NOT_TAX, '\n'));
  for (const text of info) {
    doc.font('sans').fontSize(m.body);
    ensure(doc.heightOfString(text, { width }) + 6);
    doc.fillColor(INK).text(text, left, y, { width });
    y = doc.y + 6;
  }

  // --- Долен ред на всяка страница: подпис, отпечатък, страница (pdf-footer.ts) ------------------
  drawFooters(doc, frame, meta);
  doc.end();
  return done;
}
