import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { dec, toFixed, toPlain, type Dec } from '../einvoice/decimal.js';
import { documentNote } from '../einvoice/notes.js';
import type { Calculated } from '../einvoice/calculate.js';
import type { InvoiceInput, PartyInput } from '../einvoice/model.js';

/**
 * Четимото копие на документа (A4). Правно значимият документ е XML-ът (UBL/CII); PDF-ът се прави от
 * СЪЩИЯ вход и СЪЩОТО изчисление, затова числата не могат да се разминат. Шрифт: DejaVu Sans (кирилица,
 * латиница, знакът €) — системен, в образа е fonts-dejavu-core. Долният ред на всяка страница носи
 * подписа на продукта и отпечатъка от веригата.
 */
export interface PdfMeta {
  number: string;
  chainIndex: bigint | null;
  sha256: string | null;
  signature: string | undefined;
  /** Кантората и пълномощното, когато документът е издаден от името на фирмата. */
  issuedVia: { firm: string; mandateRef: string } | null;
  fontDir: string;
}

const TITLES: Record<string, string> = {
  '380': 'ФАКТУРА',
  '381': 'КРЕДИТНО ИЗВЕСТИЕ',
  '383': 'ДЕБИТНО ИЗВЕСТИЕ',
  '384': 'КОРИГИРАЩА ФАКТУРА',
  '386': 'АВАНСОВА ФАКТУРА',
  '389': 'САМОФАКТУРА',
};

const MEANS: Record<string, string> = {
  '10': 'в брой',
  '30': 'банков превод',
  '31': 'дебитен превод',
  '42': 'по банкова сметка',
  '48': 'банкова карта',
  '49': 'директен дебит',
  '57': 'постоянно нареждане',
  '58': 'SEPA превод',
  '59': 'SEPA директен дебит',
  '68': 'онлайн плащане',
  '97': 'прихващане',
};

/** Мерните единици на български (UN/ECE Rec. 20); непознат код се показва както е. */
const UNITS: Record<string, string> = {
  C62: 'бр.',
  H87: 'бр.',
  HUR: 'ч',
  DAY: 'ден',
  WEE: 'седм.',
  MON: 'мес.',
  ANN: 'год.',
  MIN: 'мин',
  KGM: 'кг',
  GRM: 'г',
  TNE: 'т',
  MTR: 'м',
  KMT: 'км',
  MTK: 'м²',
  MTQ: 'м³',
  LTR: 'л',
  KWH: 'kWh',
  SET: 'компл.',
  PR: 'чифт',
  LS: 'общо',
  E48: 'услуга',
};

const INK = '#131722';
const SOFT = '#485064';
const RULE = '#cfd4dd';
const ACCENT = '#0b6b52';

/** „1 234,50“ — групи по три с неразделим интервал, десетична запетая (българският запис). */
export function bgAmount(value: Dec): string {
  const [whole = '0', fraction = '00'] = toFixed(value, 2).split('.');
  const negative = whole.startsWith('-');
  const digits = negative ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${negative ? '−' : ''}${grouped},${fraction}`;
}

/** Единичната цена: поне 2 знака след запетаята, повече — само ако ги има („12,50“, „4,995“). */
function unitPrice(text: string): string {
  const value = dec(text);
  return value.s <= 2 ? bgAmount(value) : toPlain(value).replace('.', ',');
}

function bgDate(iso: string | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function partyLines(party: PartyInput): string[] {
  const address = [
    party.address.street,
    party.address.additionalStreet,
    [party.address.postalCode, party.address.city].filter(Boolean).join(' '),
    party.address.countryCode !== 'BG' ? party.address.countryCode : undefined,
  ]
    .filter(Boolean)
    .join(', ');
  return [
    party.legalId ? `ЕИК: ${party.legalId}` : '',
    party.vatId ? `ДДС №: ${party.vatId}` : '',
    address,
  ].filter(Boolean);
}

export function renderPdf(input: InvoiceInput, calc: Calculated, meta: PdfMeta): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 48, bottom: 64, left: 48, right: 48 },
    bufferPages: true,
    info: {
      Title: `${TITLES[input.typeCode] ?? 'Документ'} ${meta.number}`,
      Author: input.seller.name,
      Creator: 'fakturist.eu — Carbon Stealth VCC',
      Producer: 'Фактурист',
    },
  });
  doc.registerFont('sans', join(meta.fontDir, 'DejaVuSans.ttf'));
  doc.registerFont('bold', join(meta.fontDir, 'DejaVuSans-Bold.ttf'));
  doc.registerFont('mono', join(meta.fontDir, 'DejaVuSansMono.ttf'));

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
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

  // --- Глава: вид, номер, дати ---------------------------------------------------------------------
  doc
    .font('bold')
    .fontSize(20)
    .fillColor(INK)
    .text(TITLES[input.typeCode] ?? 'ДОКУМЕНТ', left, y);
  doc
    .font('mono')
    .fontSize(16)
    .fillColor(ACCENT)
    .text(`№ ${meta.number}`, left, y + 4, {
      width,
      align: 'right',
    });
  y += 34;
  const dates: Array<[string, string]> = [
    ['Дата на издаване', bgDate(input.issueDate)],
    ['Дата на данъчното събитие', bgDate(input.taxPointDate ?? input.issueDate)],
  ];
  if (input.dueDate) dates.push(['Падеж', bgDate(input.dueDate)]);
  if (input.precedingInvoices[0]) {
    const p = input.precedingInvoices[0];
    dates.push(['Към фактура', `№ ${p.number}${p.issueDate ? ` от ${bgDate(p.issueDate)}` : ''}`]);
  }
  // Етикетите може да се пренесат на два реда — стойностите са под най-високия етикет.
  const colW = width / 4 - 8;
  doc.font('sans').fontSize(8.5);
  const labelH = Math.max(...dates.map(([label]) => doc.heightOfString(label, { width: colW })));
  dates.forEach(([label, value], index) => {
    const x = left + (index % 4) * (width / 4);
    doc.font('sans').fillColor(SOFT).text(label, x, y, { width: colW });
    doc
      .font('bold')
      .fillColor(INK)
      .text(value, x, y + labelH + 2, { width: colW });
  });
  y += labelH + 18;
  rule(y, INK, 1);
  y += 12;

  // --- Страните ------------------------------------------------------------------------------------
  const half = width / 2 - 12;
  const block = (title: string, party: PartyInput, x: number): number => {
    let at = y;
    doc
      .font('sans')
      .fontSize(8)
      .fillColor(SOFT)
      .text(title.toUpperCase(), x, at, { width: half, characterSpacing: 0.6 });
    at += 13;
    doc.font('bold').fontSize(10.5).fillColor(INK).text(party.name, x, at, { width: half });
    at = doc.y + 2;
    doc.font('sans').fontSize(8.5).fillColor(INK);
    for (const line of partyLines(party)) {
      doc.text(line, x, at, { width: half });
      at = doc.y + 1;
    }
    return at;
  };
  const end = Math.max(
    block('Доставчик', input.seller, left),
    block('Получател', input.buyer, left + width / 2 + 12),
  );
  y = end + 6;
  if (meta.issuedVia) {
    doc
      .font('sans')
      .fontSize(8)
      .fillColor(SOFT)
      .text(
        `Издаден от ${meta.issuedVia.firm} от името на доставчика по пълномощно: ${meta.issuedVia.mandateRef} (чл. 113, ал. 7 ЗДДС)`,
        left,
        y,
        { width },
      );
    y = doc.y + 4;
  }
  y += 8;

  // --- Редовете ------------------------------------------------------------------------------------
  const cols = [
    { label: '№', w: 22, align: 'left' as const },
    { label: 'Стока или услуга', w: 0, align: 'left' as const },
    { label: 'Мярка', w: 44, align: 'left' as const },
    { label: 'Кол.', w: 42, align: 'right' as const },
    { label: 'Ед. цена', w: 58, align: 'right' as const },
    { label: 'Отст.', w: 40, align: 'right' as const },
    { label: 'ДДС', w: 36, align: 'right' as const },
    { label: 'Стойност', w: 72, align: 'right' as const },
  ];
  cols[1]!.w = width - cols.reduce((acc, c) => acc + c.w, 0);
  const header = () => {
    doc.rect(left, y, width, 18).fillColor('#eaedf1').fill();
    let x = left;
    doc.font('bold').fontSize(7.5).fillColor(INK);
    for (const c of cols) {
      doc.text(c.label, x + 4, y + 5, { width: c.w - 8, align: c.align });
      x += c.w;
    }
    y += 20;
  };
  header();
  for (const line of calc.lines) {
    const source = input.lines[line.index]!;
    const discount = line.allowanceCharges
      .filter((a) => !a.isCharge)
      .map((a) => (a.percent ? `${toPlain(a.percent)}%` : bgAmount(a.amount)))
      .join(' ');
    const name = source.description ? `${source.name}\n${source.description}` : source.name;
    doc.font('sans').fontSize(8.5);
    const h = Math.max(doc.heightOfString(name, { width: cols[1]!.w - 8 }), 10) + 8;
    if (y + h > bottom()) {
      doc.addPage();
      y = doc.page.margins.top;
      header();
    }
    const cells = [
      source.id,
      name,
      UNITS[source.unitCode] ?? source.unitCode,
      toPlain(dec(source.quantity)).replace('.', ','),
      unitPrice(source.netPrice),
      discount,
      line.rate ? `${toPlain(line.rate)}%` : line.category,
      bgAmount(line.net),
    ];
    let x = left;
    cells.forEach((cell, i) => {
      const c = cols[i]!;
      doc
        .font(i === 7 ? 'mono' : 'sans')
        .fillColor(INK)
        .text(cell, x + 4, y + 4, { width: c.w - 8, align: c.align });
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
      .fontSize(strong ? 10.5 : 9)
      .fillColor(INK);
    doc.text(label, boxX, y, { width: boxW * 0.6 });
    doc
      .font(strong ? 'bold' : 'mono')
      .text(value, boxX + boxW * 0.6, y, { width: boxW * 0.4, align: 'right' });
    y += strong ? 17 : 14;
  };
  const leftY = y;
  doc
    .font('bold')
    .fontSize(8)
    .fillColor(SOFT)
    .text('РАЗБИВКА ПО ДДС', left, y, { characterSpacing: 0.6 });
  let ly = y + 13;
  for (const group of calc.breakdown) {
    const label = group.rate ? `${group.category} ${toPlain(group.rate)}%` : group.category;
    doc
      .font('sans')
      .fontSize(8.5)
      .fillColor(INK)
      .text(`${label}: основа ${bgAmount(group.taxable)}, ДДС ${bgAmount(group.vat)}`, left, ly, {
        width: width * 0.46,
      });
    ly = doc.y + 2;
    if (group.exemptionReason) {
      doc
        .fillColor(SOFT)
        .text(`Основание: ${group.exemptionReason}`, left, ly, { width: width * 0.46 });
      ly = doc.y + 2;
    }
  }
  y = leftY;
  row('Сума на редовете', bgAmount(t.lineExtension));
  if (calc.hasDocumentAllowances) row('Отстъпки', `−${bgAmount(t.allowances)}`);
  if (calc.hasDocumentCharges) row('Надбавки', bgAmount(t.charges));
  row('Данъчна основа', bgAmount(t.taxExclusive));
  row('ДДС', bgAmount(t.vat));
  if (t.vatInEur) row('ДДС в евро', `${bgAmount(t.vatInEur)} EUR`);
  row('Обща сума', bgAmount(t.taxInclusive));
  if (t.prepaid.v !== 0n) row('Платено авансово', `−${bgAmount(t.prepaid)}`);
  doc.moveTo(boxX, y).lineTo(right, y).lineWidth(1).strokeColor(INK).stroke();
  y += 5;
  row(`За плащане (${currency})`, bgAmount(t.payable), true);
  y = Math.max(y, ly) + 12;

  // --- Плащане и бележка ---------------------------------------------------------------------------
  const info: string[] = [];
  if (input.payment) {
    const parts = [
      `Начин на плащане: ${MEANS[input.payment.meansCode] ?? input.payment.meansCode}`,
    ];
    if (input.payment.accountId) parts.push(`IBAN: ${input.payment.accountId}`);
    if (input.payment.bic) parts.push(`BIC: ${input.payment.bic}`);
    info.push(parts.join(' · '));
  }
  if (input.paymentTerms) info.push(`Условия: ${input.paymentTerms}`);
  // Бележката без подписа — той е в долния ред на всяка страница.
  const note = documentNote(input, calc);
  if (note) info.push(note);
  for (const text of info) {
    doc.font('sans').fontSize(8.5);
    ensure(doc.heightOfString(text, { width }) + 6);
    doc.fillColor(INK).text(text, left, y, { width });
    y = doc.y + 6;
  }

  // --- Долен ред на всяка страница: подпис, отпечатък, страница -----------------------------------
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(pages.start + i);
    // Под долното поле: без временно нулево поле pdfkit би пренесъл текста на нова страница.
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const footY = doc.page.height - savedBottom + 18;
    doc
      .moveTo(left, footY - 6)
      .lineTo(right, footY - 6)
      .lineWidth(0.6)
      .strokeColor(RULE)
      .stroke();
    const chain = meta.sha256
      ? `Звено № ${meta.chainIndex?.toString() ?? '—'} · SHA-256 ${meta.sha256.slice(0, 16)}…`
      : '';
    doc.font('sans').fontSize(7).fillColor(SOFT);
    doc.text(meta.signature ?? '', left, footY, { width: width * 0.62, lineBreak: false });
    doc.font('mono').text(`${chain}   ${i + 1}/${pages.count}`, left + width * 0.62, footY, {
      width: width * 0.38,
      align: 'right',
      lineBreak: false,
    });
    doc.page.margins.bottom = savedBottom;
  }
  doc.end();
  return done;
}
