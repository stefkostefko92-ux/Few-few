// The photos at the end of the print and the PDF of a sheet, packed to save paper (the owner, 5 November
// 2026: "Поправи позиционирането на снимките при принтиране да се икономиса някой лист"): justified rows —
// the photos of a row share one height and together fill the width, about three landscape or four
// portrait per row, never cropped or stretched — and no page of their own: they continue under the sheet.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { translatorFor } from '../src/i18n.js';
import { CONTENT_WIDTH, MARGIN, type PdfContext } from '../src/schede/pdf-layout.js';
import { ALTEZZA_RIGA, drawFoto, MAX_PER_RIGA, righeFoto, SPAZIO } from '../src/schede/pdf-foto.js';
import { pdfFontPaths } from '../src/schede/pdf.js';

const fontDir = process.env.PDF_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);
const ORIZZONTALE = 4 / 3;
const VERTICALE = 3 / 4;

const larghezzaRiga = (riga: ReadonlyArray<{ larghezza: number }>) =>
  riga.reduce((s, p) => s + p.larghezza, 0) + SPAZIO * (riga.length - 1);

describe('the rows of photos', () => {
  it('puts three landscape photos on a row, filling the width, all of one height', () => {
    const righe = righeFoto(Array(9).fill(ORIZZONTALE), CONTENT_WIDTH);
    assert.deepEqual(
      righe.map((r) => r.length),
      [3, 3, 3],
    );
    for (const riga of righe) {
      assert.ok(Math.abs(larghezzaRiga(riga) - CONTENT_WIDTH) < 0.01);
      assert.ok(riga.every((p) => p.altezza === riga[0]!.altezza));
      assert.ok(riga[0]!.altezza > 110 && riga[0]!.altezza <= ALTEZZA_RIGA, `${riga[0]!.altezza}`);
    }
  });

  it('puts four portrait photos on a row, never more', () => {
    const righe = righeFoto(Array(8).fill(VERTICALE), CONTENT_WIDTH);
    assert.deepEqual(
      righe.map((r) => r.length),
      [MAX_PER_RIGA, MAX_PER_RIGA],
    );
    for (const riga of righe) assert.ok(Math.abs(larghezzaRiga(riga) - CONTENT_WIDTH) < 0.01);
  });

  it('keeps two wide (16:9) photos together rather than three tiny ones', () => {
    const righe = righeFoto(Array(4).fill(16 / 9), CONTENT_WIDTH);
    assert.deepEqual(
      righe.map((r) => r.length),
      [2, 2],
    );
  });

  it('never crops or stretches a photo, and leaves the last row at its height, from the left', () => {
    const rapporti = [ORIZZONTALE, VERTICALE, 1, 16 / 9, VERTICALE, ORIZZONTALE, 2.5];
    const righe = righeFoto(rapporti, CONTENT_WIDTH);
    assert.deepEqual(
      righe.flat().map((p) => p.indice),
      rapporti.map((_, i) => i),
      'every photo once, in order',
    );
    for (const p of righe.flat())
      assert.ok(Math.abs(p.larghezza / p.altezza - rapporti[p.indice]!) < 1e-9);
    for (const riga of righe) assert.ok(larghezzaRiga(riga) <= CONTENT_WIDTH + 0.01);
    const sola = righeFoto([ORIZZONTALE], CONTENT_WIDTH);
    assert.equal(sola[0]![0]!.altezza, ALTEZZA_RIGA, 'one photo is not blown up to the full width');
  });
});

describe(
  'the photos in the PDF',
  { skip: !fontsHere && 'DejaVu fonts are not installed here' },
  () => {
    it('fit twelve landscape photos with captions on one page (they used to take two)', async () => {
      const immagine = await sharp({
        create: { width: 120, height: 90, channels: 3, background: { r: 90, g: 90, b: 90 } },
      })
        .jpeg()
        .toBuffer();
      const paths = pdfFontPaths(fontDir);
      const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
      doc.registerFont('Sans', paths.regular);
      doc.registerFont('Sans-Bold', paths.bold);
      const ctx: PdfContext = { doc, t: translatorFor('it') };
      const foto = Array.from({ length: 12 }, (_, i) => ({
        immagine,
        larghezza: 1200,
        altezza: 900,
        didascalia: `Foto ${i + 1}: quadro di manovra`,
      }));
      drawFoto(ctx, [{ titolo: 'Locale macchina', foto }]);
      assert.equal(doc.bufferedPageRange().count, 1);
      doc.end();
    });

    it('puts photos of different sections side by side: one portrait each takes one row, not three', async () => {
      // The owner, 5 November 2026: "puoi metterle una accanto all'altra anche se sono di sezioni
      // diverse, così risparmiamo il foglio" — Quadro, Argano and Limitatore, one portrait photo each.
      const immagine = await sharp({
        create: { width: 90, height: 120, channels: 3, background: { r: 90, g: 90, b: 90 } },
      })
        .jpeg()
        .toBuffer();
      const paths = pdfFontPaths(fontDir);
      const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
      doc.registerFont('Sans', paths.regular);
      doc.registerFont('Sans-Bold', paths.bold);
      const ctx: PdfContext = { doc, t: translatorFor('it') };
      const una = (titolo: string, didascalia: string) => ({
        titolo,
        foto: [{ immagine, larghezza: 900, altezza: 1200, didascalia }],
      });
      const prima = doc.y;
      drawFoto(ctx, [
        una('Quadro', 'QUADRO LABEL'),
        una('Argano', 'ARGANO'),
        una('Limitatore', 'LIMITATORE'),
      ]);
      // The title, one row of three photos with their captions — well under two rows of photos.
      assert.ok(doc.y - prima < 40 + 2 * ALTEZZA_RIGA, `${doc.y - prima}`);
      assert.equal(doc.bufferedPageRange().count, 1);
      doc.end();
    });
  },
);
