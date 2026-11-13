import type { Frame } from './pdf-layout.js';

/** Червеното, с контраст ≥ 4,5:1 върху бяло. */
const STAMP = '#a4161a';

/**
 * „АНУЛИРАН“ над главата на всяка страница на анулиран документ (SPEC 47). Оригиналът (XML, веригата)
 * не се пипа — печатът е само в четимото копие, за да не се плати по анулиран документ.
 */
export function drawAnnulledStamp(doc: PDFKit.PDFDocument, text: string, frame: Frame): void {
  const savedTop = doc.page.margins.top;
  doc.page.margins.top = 0;
  const y = Math.max(8, savedTop - 26);
  doc
    .save()
    .rect(frame.left, y - 4, frame.width, 20)
    .lineWidth(1.2)
    .strokeColor(STAMP)
    .stroke()
    .restore();
  doc
    .font('bold')
    .fontSize(10)
    .fillColor(STAMP)
    .text(text, frame.left + 8, y + 1, {
      width: frame.width - 16,
      lineBreak: false,
      ellipsis: true,
    });
  doc.page.margins.top = savedTop;
}
