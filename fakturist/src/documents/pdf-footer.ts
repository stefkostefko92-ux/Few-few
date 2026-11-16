import type { Frame } from './pdf-layout.js';
import { RULE, SOFT } from './pdf-layout.js';
import { drawAnnulledStamp } from './pdf-stamp.js';

/**
 * Долният ред на всяка страница: подписът на продукта, звеното от веригата и отпечатъкът, номер на
 * страница; печатът „АНУЛИРАН“ горе (чл. 116 ЗДДС). Рисува се след съдържанието (bufferPages).
 */
export function drawFooters(
  doc: PDFKit.PDFDocument,
  frame: Frame,
  meta: {
    signature: string | undefined;
    chainIndex: bigint | null;
    sha256: string | null;
    annulled?: string | null;
  },
): void {
  const { left, right, width } = frame;
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(pages.start + i);
    if (meta.annulled) drawAnnulledStamp(doc, meta.annulled, frame);
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
}
