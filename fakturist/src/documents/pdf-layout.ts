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

/** Главата: вид на документа, номер и лого според шаблона. Връща y под нея. */
export function drawHeader(
  doc: PDFKit.PDFDocument,
  frame: Frame,
  top: number,
  opts: { title: string; number: string; style: ResolvedPdfStyle; m: Metrics },
): number {
  const { left, right, width } = frame;
  const { style, m } = opts;
  const logo = fitLogo(style, m.logo);
  const logoLeft = style.logoPosition === 'left';

  if (style.template === 'band') {
    const bandH = Math.max(62, logo.h + 20);
    doc.rect(left, top, width, bandH).fillColor(style.accent).fill();
    const pad = 12;
    if (style.logo) {
      const boxW = logo.w + 12;
      const boxH = logo.h + 12;
      const boxX = logoLeft ? left + pad : right - pad - boxW;
      const boxY = top + (bandH - boxH) / 2;
      doc.roundedRect(boxX, boxY, boxW, boxH, 3).fillColor('#ffffff').fill();
      doc.image(style.logo.data, boxX + 6, boxY + 6, { width: logo.w, height: logo.h });
    }
    const textX = style.logo && logoLeft ? left + pad + logo.w + 24 : left + pad;
    const textW = width - pad * 2 - (style.logo ? logo.w + 24 : 0);
    const align = style.logo && logoLeft ? 'right' : 'left';
    const titleY = top + bandH / 2 - (m.title + m.number) / 2 - 2;
    if (style.logo) {
      doc.font('bold').fontSize(m.title).fillColor('#ffffff').text(opts.title, textX, titleY, {
        width: textW,
        align,
      });
      doc
        .font('mono')
        .fontSize(m.number)
        .text(`№ ${opts.number}`, textX, titleY + m.title + 4, { width: textW, align });
    } else {
      const midY = top + bandH / 2 - m.title / 2 - 1;
      doc
        .font('bold')
        .fontSize(m.title)
        .fillColor('#ffffff')
        .text(opts.title, textX, midY, { width: textW });
      doc
        .font('mono')
        .fontSize(m.number)
        .text(`№ ${opts.number}`, textX, midY + 3, { width: textW, align: 'right' });
    }
    return top + bandH + 14;
  }

  // Класически и компактен: бяла глава, номерът в акцентния цвят.
  if (!style.logo) {
    doc.font('bold').fontSize(m.title).fillColor(INK).text(opts.title, left, top);
    doc
      .font('mono')
      .fontSize(m.number)
      .fillColor(style.accent)
      .text(`№ ${opts.number}`, left, top + 4, { width, align: 'right' });
    return top + m.title + 14;
  }
  const textW = width - logo.w - 24;
  const textX = logoLeft ? left + logo.w + 24 : left;
  const align = logoLeft ? 'right' : 'left';
  doc.image(style.logo.data, logoLeft ? left : right - logo.w, top, {
    width: logo.w,
    height: logo.h,
  });
  doc
    .font('bold')
    .fontSize(m.title)
    .fillColor(INK)
    .text(opts.title, textX, top, { width: textW, align });
  doc
    .font('mono')
    .fontSize(m.number)
    .fillColor(style.accent)
    .text(`№ ${opts.number}`, textX, top + m.title + 6, { width: textW, align });
  return top + Math.max(logo.h, m.title + m.number + 8) + 12;
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
