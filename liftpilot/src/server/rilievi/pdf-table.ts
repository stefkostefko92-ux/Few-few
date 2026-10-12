import 'server-only';
// The table of the old push-button panels' measurements in the PDF: a row per stop, on the whole width. The head row is
// repeated on every new page; a row never splits over two pages. Ported 1:1 from rilievi (src/schede/pdf-table.ts).
import type { TableView } from '@/lib/rilievi/misure';
import { CONTENT_WIDTH, ensureSpace, INK, MARGIN, MUTED, RULE, type PdfContext } from './pdf-layout';

/** The columns' widths as shares: №, floor, length, width, the two hole spacings, display. */
const WEIGHTS = [0.55, 1, 1.05, 1.05, 1.6, 1.6, 0.85];
const PAD = 3;

export function drawTable(ctx: PdfContext, table: TableView): void {
  const { doc } = ctx;
  const weights = table.head.map((_, i) => WEIGHTS[i] ?? 1);
  const total = weights.reduce((sum, w) => sum + w, 0);
  const widths = weights.map((w) => (CONTENT_WIDTH * w) / total);
  const lefts = widths.map((_, i) => MARGIN + widths.slice(0, i).reduce((sum, w) => sum + w, 0));
  const inner = (i: number) => (widths[i] ?? 0) - PAD * 2;

  const rowHeight = (cells: readonly string[], size: number) => {
    doc.font('Sans').fontSize(size);
    const heights = cells.map((cell, i) => doc.heightOfString(cell || '—', { width: inner(i) }));
    return Math.max(...heights) + PAD * 2;
  };

  const rule = (y: number, color: string, width: number) => {
    doc
      .moveTo(MARGIN, y)
      .lineTo(MARGIN + CONTENT_WIDTH, y)
      .lineWidth(width)
      .stroke(color);
  };

  const drawHead = () => {
    const height = rowHeight(table.head, 7);
    const y = doc.y;
    table.head.forEach((head, i) => {
      doc
        .font('Sans')
        .fontSize(7)
        .fillColor(MUTED)
        .text(head, (lefts[i] ?? MARGIN) + PAD, y + PAD, { width: inner(i) });
    });
    rule(y + height, INK, 0.8);
    doc.y = y + height;
  };

  const headHeight = rowHeight(table.head, 7);
  const firstRow = table.rows[0] ? rowHeight(table.rows[0], 9) : 0;
  ensureSpace(ctx, headHeight + firstRow + 4);
  doc.y += 2;
  drawHead();
  for (const row of table.rows) {
    const height = rowHeight(row, 9);
    if (ensureSpace(ctx, height)) drawHead();
    const y = doc.y;
    row.forEach((cell, i) => {
      doc
        .font(i === 0 ? 'Sans-Bold' : 'Sans')
        .fontSize(9)
        .fillColor(cell ? INK : MUTED)
        .text(cell || '—', (lefts[i] ?? MARGIN) + PAD, y + PAD, { width: inner(i) });
    });
    rule(y + height, RULE, 0.5);
    doc.y = y + height;
  }
  doc.y += 8;
}
