import type { PdfTemplate, ResolvedPdfStyle } from './pdf-style.js';

/**
 * Шаблоните на PDF-а: размерите на шрифта и полетата и главата (вид, номер, лого). Тялото — страните,
 * редовете, тоталите и долният ред — е общо (pdf.ts), затова реквизитите са във всеки шаблон.
 */
export interface Metrics {
  margin: number;
  title: number;
  number: number;
  body: number;
  small: number;
  head: number;
  rowPad: number;
  partyName: number;
  total: number;
  logo: { w: number; h: number };
}

export const METRICS: Record<PdfTemplate, Metrics> = {
  classic: {
    margin: 48,
    title: 20,
    number: 16,
    body: 8.5,
    small: 8,
    head: 7.5,
    rowPad: 8,
    partyName: 10.5,
    total: 10.5,
    logo: { w: 150, h: 50 },
  },
  band: {
    margin: 48,
    title: 19,
    number: 14,
    body: 8.5,
    small: 8,
    head: 7.5,
    rowPad: 8,
    partyName: 10.5,
    total: 10.5,
    logo: { w: 110, h: 42 },
  },
  compact: {
    margin: 36,
    title: 15,
    number: 12,
    body: 7.5,
    small: 7,
    head: 6.8,
    rowPad: 5,
    partyName: 9.5,
    total: 9.5,
    logo: { w: 120, h: 40 },
  },
};

export const INK = '#131722';
export const SOFT = '#485064';
export const RULE = '#cfd4dd';

/** Светъл оттенък на акцента (фонът на заглавката на таблицата) — смес с бяло. */
export function tint(hex: string, amount = 0.88): string {
  const mix = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16);
    return Math.round(c + (255 - c) * amount)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}

export interface Frame {
  left: number;
  right: number;
  width: number;
}

/** Размерът на логото, вписано в кутия (без разтягане). */
function fitLogo(style: ResolvedPdfStyle, box: { w: number; h: number }): { w: number; h: number } {
  if (!style.logo) return { w: 0, h: 0 };
  const scale = Math.min(box.w / style.logo.width, box.h / style.logo.height, 1);
  return { w: style.logo.width * scale, h: style.logo.height * scale };
}

/**
 * Главата: вид на документа (при двуезичния — английското заглавие е подзаглавие отдолу), номер и лого
 * според шаблона. Височините се мерят (дългото заглавие се пренася, без да застъпва номера). Връща y
 * под главата.
 */
export function drawHeader(
  doc: PDFKit.PDFDocument,
  frame: Frame,
  top: number,
  opts: {
    title: string;
    subtitle?: string;
    number: string;
    style: ResolvedPdfStyle;
    m: Metrics;
  },
): number {
  const { left, right, width } = frame;
  const { style, m } = opts;
  const logo = fitLogo(style, m.logo);
  const logoLeft = style.logoPosition === 'left';
  const numberText = `№ ${opts.number}`;
  const subSize = Math.max(m.small + 2, Math.round(m.title * 0.55));
  const numberW = doc.font('mono').fontSize(m.number).widthOfString(numberText);
  /** Заглавието и подзаглавието в колона с ширина `w` от (x, y); връща долния им край. */
  const titleBlock = (
    x: number,
    y: number,
    w: number,
    color: string,
    align: 'left' | 'right',
    draw: boolean,
  ): number => {
    doc.font('bold').fontSize(m.title);
    const titleH = doc.heightOfString(opts.title, { width: w });
    if (draw) doc.fillColor(color).text(opts.title, x, y, { width: w, align });
    let bottom = y + titleH;
    if (opts.subtitle) {
      doc.font('sans').fontSize(subSize);
      const subH = doc.heightOfString(opts.subtitle, { width: w });
      if (draw) doc.fillColor(color).text(opts.subtitle, x, bottom + 1, { width: w, align });
      bottom += 1 + subH;
    }
    return bottom;
  };

  if (style.template === 'band') {
    const pad = 12;
    const textX = style.logo && logoLeft ? left + pad + logo.w + 24 : left + pad;
    const textW = width - pad * 2 - (style.logo ? logo.w + 24 : 0);
    const align = style.logo && logoLeft ? 'right' : 'left';
    // С лого: заглавие, подзаглавие и номер едно под друго; без лого: номерът е вдясно на заглавието.
    const stacked = Boolean(style.logo);
    const titleW = stacked ? textW : textW - numberW - 16;
    const textH =
      titleBlock(textX, 0, titleW, '#ffffff', align, false) + (stacked ? m.number + 4 : 0);
    const bandH = Math.max(62, logo.h + 20, textH + 24);
    doc.rect(left, top, width, bandH).fillColor(style.accent).fill();
    if (style.logo) {
      const boxW = logo.w + 12;
      const boxH = logo.h + 12;
      const boxX = logoLeft ? left + pad : right - pad - boxW;
      const boxY = top + (bandH - boxH) / 2;
      doc.roundedRect(boxX, boxY, boxW, boxH, 3).fillColor('#ffffff').fill();
      doc.image(style.logo.data, boxX + 6, boxY + 6, { width: logo.w, height: logo.h });
    }
    const textY = top + (bandH - textH) / 2;
    const bottom = titleBlock(textX, textY, titleW, '#ffffff', align, true);
    doc.font('mono').fontSize(m.number).fillColor('#ffffff');
    if (stacked) {
      doc.text(numberText, textX, bottom + 4, { width: textW, align });
    } else {
      doc.text(numberText, textX, textY + 3, { width: textW, align: 'right' });
    }
    return top + bandH + 14;
  }

  // Класически и компактен: бяла глава, номерът в акцентния цвят.
  if (!style.logo) {
    const bottom = titleBlock(left, top, width - numberW - 16, INK, 'left', true);
    doc
      .font('mono')
      .fontSize(m.number)
      .fillColor(style.accent)
      .text(numberText, left, top + 4, { width, align: 'right' });
    return bottom + 14;
  }
  const textW = width - logo.w - 24;
  const textX = logoLeft ? left + logo.w + 24 : left;
  const align = logoLeft ? 'right' : 'left';
  doc.image(style.logo.data, logoLeft ? left : right - logo.w, top, {
    width: logo.w,
    height: logo.h,
  });
  const bottom = titleBlock(textX, top, textW, INK, align, true);
  doc
    .font('mono')
    .fontSize(m.number)
    .fillColor(style.accent)
    .text(numberText, textX, bottom + 6, { width: textW, align });
  return Math.max(top + logo.h, bottom + 6 + m.number) + 14;
}

/** Датите под главата: до четири колони, стойностите под най-високия етикет. */
export function drawDates(
  doc: PDFKit.PDFDocument,
  frame: Frame,
  top: number,
  dates: Array<[string, string]>,
  m: Metrics,
): number {
  const { left, width } = frame;
  const colW = width / 4 - 8;
  doc.font('sans').fontSize(m.body);
  const labelH = Math.max(...dates.map(([label]) => doc.heightOfString(label, { width: colW })));
  dates.forEach(([label, value], index) => {
    const x = left + (index % 4) * (width / 4);
    doc.font('sans').fillColor(SOFT).text(label, x, top, { width: colW });
    doc
      .font('bold')
      .fillColor(INK)
      .text(value, x, top + labelH + 2, { width: colW });
  });
  return top + labelH + m.body + 10;
}
