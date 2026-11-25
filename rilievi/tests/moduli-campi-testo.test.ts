// What is written in a text field of a supplier's fillable form stays inside its box (the owner, 13 November
// 2026: the date of the DMG sheet came out cut in half — "Искам да бъде перфектен, погледни и датата как е
// срязана"). The vendor marks some one-row fields as multi-line, and a library that lays a multi-line text
// from the top down then drops the line below the box, where the box cuts it; a long note lost its last rows
// the same way. Checked on every text field of every form, with a short value (the largest font) and with a
// long one (the smallest font, the most rows): the ink of every row is inside the box that clips it.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import fontkit from '@pdf-lib/fontkit';
import {
  decodePDFRawStream,
  PDFDict,
  PDFName,
  PDFRawStream,
  PDFStream,
  type PDFWidgetAnnotation,
} from 'pdf-lib';
import {
  DMG_FIXTURES,
  DMG_PITAGORA,
  fieldsOf,
  GEAT,
  MOVILIFT,
  type ModuloAcro,
} from '../src/ordini/moduli.js';
import { compilaAcroform } from '../src/ordini/pdf-form.js';
import { apriModulo } from '../src/ordini/pdf-testo.js';
import type { Valori } from '../src/ordini/valori.js';
import { pdfFontPaths } from '../src/schede/pdf.js';

const fontDir = process.env.PDF_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);

/** A hair of tolerance: the numbers of the stream are rounded, the edge of a glyph is not a pixel. */
const TOLLERANZA = 0.3;

const CORTO = '13/11/2026';
const LUNGO = 'Via Giuseppe Pagliaro 77, 20900 Monza (MB) — jolly gypq, quadro e pulsantiere';
const NOTA = Array.from(
  { length: 30 },
  (_, i) => `Riga ${i + 1}: pulsantiera da quotare, gypq (jolly).`,
).join('\n');

type Campo = { key: string; kind: string; acro?: string; maxLength?: number };

const testuali = (modulo: ModuloAcro): Campo[] =>
  (fieldsOf(modulo) as Campo[]).filter(
    (f) => (f.kind === 'text' || f.kind === 'textarea') && f.acro !== undefined,
  );

function valori(modulo: ModuloAcro, lungo: boolean): Valori {
  const out: Valori = {};
  for (const field of testuali(modulo)) {
    const pieno = field.kind === 'textarea' ? NOTA : LUNGO;
    out[field.key] = (lungo ? pieno : CORTO).slice(0, field.maxLength ?? 600);
  }
  return out;
}

interface Aspetto {
  /** The rectangle that clips the text. */
  box: { x0: number; y0: number; x1: number; y1: number };
  size: number;
  /** Where each row starts (its baseline). */
  righe: Array<{ x: number; y: number }>;
}

/** The appearance of a filled text field, read back from its stream: the clip, the font size, the rows. */
function aspetto(widget: PDFWidgetAnnotation): Aspetto {
  const normal = widget.dict.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream);
  const bytes =
    normal instanceof PDFRawStream
      ? decodePDFRawStream(normal).decode()
      : (normal as unknown as { getUnencodedContents(): Uint8Array }).getUnencodedContents();
  const text = Buffer.from(bytes).toString('latin1');
  const num = '(-?[\\d.]+(?:e-?\\d+)?)';
  const clip = new RegExp(
    `${num} ${num} m\\s+${num} ${num} l\\s+${num} ${num} l\\s+${num} ${num} l\\s+h\\s+W\\s+n`,
  ).exec(text);
  assert.ok(clip, `a clip in the appearance: ${text.slice(0, 200)}`);
  const xs = [clip[1], clip[3], clip[5], clip[7]].map(Number);
  const ys = [clip[2], clip[4], clip[6], clip[8]].map(Number);
  const size = Number(new RegExp(`/\\S+ ${num} Tf`).exec(text)?.[1]);
  const righe = [...text.matchAll(new RegExp(`1 0 -?0 1 ${num} ${num} Tm`, 'g'))].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
  }));
  return {
    box: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) },
    size,
    righe,
  };
}

describe('the text of a fillable form stays inside its field', { skip: !fontsHere }, () => {
  const ink = fontsHere ? fontkit.create(readFileSync(pdfFontPaths(fontDir).regular)) : null;

  for (const modulo of [MOVILIFT, DMG_PITAGORA, DMG_FIXTURES, GEAT]) {
    for (const lungo of [false, true]) {
      it(`${modulo.id}: ${lungo ? 'long values' : 'a short value'}`, async () => {
        const { doc, font } = await apriModulo(modulo, fontDir);
        const form = doc.getForm();
        compilaAcroform(form, modulo, valori(modulo, lungo), font);
        const fuori: string[] = [];
        let controllati = 0;
        for (const field of testuali(modulo)) {
          const textField = form.getTextField(field.acro!);
          const scritto = textField.getText() ?? '';
          assert.ok(scritto, `${field.key}: something is written`);
          for (const widget of textField.acroField.getWidgets()) {
            const { box, size, righe } = aspetto(widget);
            const attese = scritto.split('\n');
            // The rows on the sheet are the rows we set: nothing was wrapped again behind our back.
            assert.equal(righe.length, attese.length, `${field.key}: rows`);
            assert.ok(size >= 5, `${field.key}: a readable size (${size})`);
            righe.forEach((riga, i) => {
              if (!attese[i]) return;
              const bbox = ink!.layout(attese[i]!).bbox;
              const k = size / ink!.unitsPerEm;
              const [sx, giu, dx, su] = [
                riga.x + bbox.minX * k,
                riga.y + bbox.minY * k,
                riga.x + bbox.maxX * k,
                riga.y + bbox.maxY * k,
              ];
              controllati += 1;
              if (
                giu < box.y0 - TOLLERANZA ||
                su > box.y1 + TOLLERANZA ||
                sx < box.x0 - TOLLERANZA ||
                dx > box.x1 + TOLLERANZA
              )
                fuori.push(
                  `${field.key} row ${i + 1}/${attese.length} at ${size} pt: ink ` +
                    `${sx.toFixed(1)}…${dx.toFixed(1)} × ${giu.toFixed(1)}…${su.toFixed(1)}, box ` +
                    `${box.x0.toFixed(1)}…${box.x1.toFixed(1)} × ${box.y0.toFixed(1)}…${box.y1.toFixed(1)}`,
                );
            });
          }
        }
        assert.ok(controllati > 40, `rows checked: ${controllati}`);
        assert.deepEqual(fuori, []);
      });
    }
  }

  it('wraps a long address in a field with room for two rows instead of shrinking it', async () => {
    const { doc, font } = await apriModulo(DMG_FIXTURES, fontDir);
    const form = doc.getForm();
    compilaAcroform(
      form,
      DMG_FIXTURES,
      { data: CORTO, indirizzo: 'Via Monza 77, 20900 Monza (MB)' },
      font,
    );
    // «Progetto / Indirizzo» is two rows high: the address takes both, readable.
    const indirizzo = form.getTextField('00-Indirizzo');
    assert.equal((indirizzo.getText() ?? '').split('\n').length, 2);
    assert.ok(aspetto(indirizzo.acroField.getWidgets()[0]!).size >= 7.5);
    // «Data» is one row high whatever the vendor's flag says: one row, at the size of its neighbours.
    const data = form.getTextField('00-Data');
    const { size, righe, box } = aspetto(data.acroField.getWidgets()[0]!);
    assert.equal(righe.length, 1);
    assert.ok(size >= 8, `the date at ${size} pt`);
    // Its baseline sits in the lower half of the box, with room under it for the tails of the letters.
    assert.ok(righe[0]!.y - box.y0 >= 1.5 && righe[0]!.y - box.y0 <= (box.y1 - box.y0) / 2);
  });
});
