// The text of the supplier PDFs (pdf-lib): a field that does not fit is made smaller, then wrapped or cut.
// A long word was cut one letter at a time, measuring the whole rest at every letter — 600 letters
// without a space in a note held the one thread of the portal for about 20 s (audit, 4 November 2026).
// The cut is now found by halves: the same lines as before, in a fraction of the time.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { PDFFont } from 'pdf-lib';
import {
  ARGANI,
  DMG_FIXTURES,
  DMG_PITAGORA,
  EQ_GEARED,
  EQ_GEARLESS,
  EQ_OLEO,
  MASTECH_NG120,
  MASTECH_QI,
  MOVILIFT,
  PELAZZA,
  SG,
  AMI_RTBS,
  fieldsOf,
  type Modulo,
} from '../src/ordini/moduli.js';
import { renderModulo } from '../src/ordini/pdf.js';
import { apriModulo, fitBlock, fitLine, fitRighe, wrap } from '../src/ordini/pdf-testo.js';
import { pdfFontPaths } from '../src/schede/pdf.js';

const fontDir = process.env.PDF_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);

/** The cut as it was: one letter at a time — the reference for what the lines must be. */
function wrapLetterByLetter(font: PDFFont, text: string, width: number, size: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      while (font.widthOfTextAtSize(line, size) > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut -= 1;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}

function fitLineLetterByLetter(font: PDFFont, text: string, width: number, size: number) {
  const wide = font.widthOfTextAtSize(text, size);
  if (wide <= width) return { text, size };
  const smaller = Math.max(5, Math.floor(((size * width) / wide) * 10) / 10);
  if (font.widthOfTextAtSize(text, smaller) <= width) return { text, size: smaller };
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, smaller) > width)
    cut = cut.slice(0, -1);
  return { text: `${cut}…`, size: smaller };
}

/** Texts as people write them: Italian words, numbers, codes, long words, new lines, odd letters. */
function samples(): string[] {
  let seed = 7;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const letters = 'abcdefghilmnopqrstuvzàèéìòùWMI0123456789-/.,()ÀÈ';
  const out = [
    'Quadro di manovra da sostituire, cablaggio vano e cabina',
    'W'.repeat(80),
    'i'.repeat(200),
    `Codice ${'X9'.repeat(40)} fine`,
    'riga uno\nriga due molto più lunga della prima riga\n\nquattro',
    'Ж'.repeat(30),
    'a',
    '',
  ];
  for (let n = 0; n < 60; n += 1) {
    const words = Array.from({ length: 1 + Math.floor(next() * 14) }, () =>
      Array.from(
        { length: 1 + Math.floor(next() * (next() < 0.15 ? 60 : 12)) },
        () => letters[Math.floor(next() * letters.length)],
      ).join(''),
    );
    out.push(words.join(next() < 0.1 ? '\n' : ' '));
  }
  return out;
}

describe(
  'the text of the supplier PDFs',
  { skip: !fontsHere && 'DejaVu fonts are not installed here' },
  () => {
    const font = async () => (await apriModulo(PELAZZA, fontDir)).font;

    it('wraps into the same lines as the letter-by-letter cut', async () => {
      const f = await font();
      for (const text of samples())
        for (const [width, size] of [
          [60, 9],
          [140, 7.5],
          [400, 10],
          [12, 9],
        ] as const)
          assert.deepEqual(
            wrap(f, text, width, size),
            wrapLetterByLetter(f, text, width, size),
            `${JSON.stringify(text)} in ${width} at ${size}`,
          );
    });

    it('shrinks and cuts one line exactly as before', async () => {
      const f = await font();
      for (const text of samples())
        for (const width of [30, 90, 250])
          assert.deepEqual(
            fitLine(f, text, width, 10),
            fitLineLetterByLetter(f, text, width, 10),
            `${JSON.stringify(text)} in ${width}`,
          );
    });

    it('keeps every wrapped line inside the box, a lone letter aside', async () => {
      const f = await font();
      for (const text of samples()) {
        const block = fitBlock(f, text, 120, 60, 9);
        for (const line of block.lines)
          assert.ok(
            line.length <= 1 || f.widthOfTextAtSize(line, block.size) <= 120,
            `${JSON.stringify(line)} at ${block.size}`,
          );
        const rows = fitRighe(f, text, 120, 3, 9);
        assert.ok(rows.lines.length <= 3);
      }
    });

    it('cuts 600 letters without a space in a fraction of a second', async () => {
      const f = await font();
      const long = 'W'.repeat(600);
      const start = performance.now();
      wrap(f, long, 400, 10);
      fitLine(f, long, 400, 10);
      fitBlock(f, long, 400, 80, 10);
      // Letter by letter: about 4 s on these three calls.
      assert.ok(performance.now() - start < 500, `${Math.round(performance.now() - start)} ms`);
    });

    it('draws every supplier form with every text field full and without a space quickly', async () => {
      const moduli: Modulo[] = [
        PELAZZA,
        ARGANI,
        MOVILIFT,
        SG,
        MASTECH_NG120,
        MASTECH_QI,
        EQ_GEARED,
        EQ_GEARLESS,
        EQ_OLEO,
        AMI_RTBS,
        DMG_PITAGORA,
        DMG_FIXTURES,
      ];
      for (const modulo of moduli) {
        const valori: Record<string, string | true> = {};
        for (const field of fieldsOf(modulo))
          if (field.kind === 'text' || field.kind === 'textarea')
            valori[field.key] = 'W'.repeat(field.maxLength);
        const start = performance.now();
        await renderModulo(modulo, valori, fontDir);
        const ms = Math.round(performance.now() - start);
        // Letter by letter the Pelazza note alone took about 20 s.
        assert.ok(ms < 3000, `${modulo.id}: ${ms} ms`);
      }
    });
  },
);
