// Rilievi — the ticks of the sheet's PDF (src/server/rilievi/pdf-spunte.ts), ported from rilievi's tests/spunte.test.ts
// (commit 988f3cf37): drawn with lines like the print, each choice whole on its line, the chosen one bold (the owner,
// 21 October 2026: «le spunte un po' più marcate»).
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import PDFDocument from 'pdfkit';
import { pdfFontPaths } from '../rilievi/pdf';
import { drawSpunte, layoutSpunte } from '../rilievi/pdf-spunte';

const fontDir = process.env.REPORT_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fonts = pdfFontPaths(fontDir);
const fontsHere = existsSync(fonts.regular);

function newDoc(compress = true): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'A4', margin: 40, compress });
  doc.registerFont('Sans', fonts.regular);
  doc.registerFont('Sans-Bold', fonts.bold);
  return doc;
}

const KINDS = [
  { label: 'Elettrico', checked: false },
  { label: 'Idraulico', checked: true },
  { label: 'MRL', checked: false },
];

describe('the ticks of the sheet PDF', { skip: !fontsHere && 'DejaVu fonts are not installed here' }, () => {
  it('puts the choices on one line while they fit, and wraps only between choices', () => {
    const doc = newDoc();
    const wide = layoutSpunte(doc, KINDS, 515, 11.5);
    assert.deepEqual(wide.posti.map((p) => p.y), [0, 0, 0]);
    const [a, b, c] = wide.posti;
    assert.ok(a?.x === 0 && b !== undefined && c !== undefined && b.x < c.x);
    doc.font('Sans').fontSize(11.5);
    const line = doc.currentLineHeight(true);
    assert.equal(wide.height, line);
    // too narrow for two: one choice per line, each whole, at the start of its line
    const narrow = layoutSpunte(doc, KINDS, 90, 11.5);
    assert.deepEqual(narrow.posti.map((p) => [p.x, p.y]), [[0, 0], [0, line], [0, line * 2]]);
    assert.equal(narrow.height, line * 3);
  });

  it('puts a label longer than the line alone on its line, wrapped in it', () => {
    const doc = newDoc();
    const long = { label: 'Riporto al piano e apertura porte per sbilanciamento MRL', checked: true };
    const [elettrico, , mrl] = KINDS;
    assert.ok(elettrico && mrl);
    const layout = layoutSpunte(doc, [elettrico, long, mrl], 160, 11.5);
    const [first, second, third] = layout.posti;
    assert.ok(first && second && third);
    assert.equal(first.y, 0);
    assert.ok(second.x === 0 && second.y > 0 && second.wrap !== undefined);
    assert.ok(third.x === 0 && third.y > second.y + 11.5, 'after the lines of the long label');
    assert.equal(layout.height, third.y + doc.currentLineHeight(true));
  });

  it('draws every box and the tick of the chosen one with lines', async () => {
    const doc = newDoc(false);
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    drawSpunte(doc, layoutSpunte(doc, KINDS, 515, 11.5), 40, 40, 11.5);
    doc.end();
    await once(doc, 'end');
    const content = Buffer.concat(chunks).toString('latin1');
    // three boxes and one tick, each a stroked path; the tick with round ends
    assert.equal(content.match(/^S$/gm)?.length, 4);
    assert.equal(content.match(/^1 J$/gm)?.length, 1);
    assert.match(content, /^1\.84 w$/m, 'the tick is 1.84 pt thick at 11.5 pt');
  });
});
