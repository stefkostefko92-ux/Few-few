// The widths of the fixtures model on the DMG sheet (QF Fixtures). Each model has a picture with the numbers
// of its widths ("90 160 200") that belongs next to its tick boxes. In the vendor's file the picture sits
// 3.4 pt under the bottom of the boxes on 14 of the 18 places; the four of section 2 (Flat standard,
// Silverlight, Luna, Cut) were left 20–24 pt lower, over the title of section 3, and no script moves them.
// On the sheet that leaves the portal every picture is in the row of its boxes (the owner, 13 November 2026:
// "Искам да бъде перфектен").
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { DMG_FIXTURES, fieldsOf, moduloPdf } from '../src/ordini/moduli.js';
import { compilaAcroform } from '../src/ordini/pdf-form.js';
import { campiVisibili, pulisciFormulario } from '../src/ordini/pdf-form-pulizia.js';
import { apriModulo } from '../src/ordini/pdf-testo.js';
import { pdfFontPaths } from '../src/schede/pdf.js';

const fontDir = process.env.PDF_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);

/** How far under the bottom of its tick boxes the picture of the widths sits, where the vendor put it right. */
const SOTTO = -3.4;

const modelli = (): string[] => {
  const modello = fieldsOf(DMG_FIXTURES).find((f) => f.key === 'modello');
  assert.ok(modello && modello.kind === 'radio');
  return modello.opzioni.map((o) => o.valore);
};

describe('the widths of the model on the DMG fixtures sheet', () => {
  it('finds four pictures out of place in the vendor file — the reason for the correction', async () => {
    const form = (await PDFDocument.load(moduloPdf(DMG_FIXTURES))).getForm();
    const fuori = form
      .getFields()
      .map((f) => f.getName())
      .filter((name) => name.endsWith('-IMG') && form.getFieldMaybe(name.slice(0, -4)))
      .filter((name) => {
        const img = form.getField(name).acroField.getWidgets()[0]!.getRectangle();
        const box = form.getField(name.slice(0, -4)).acroField.getWidgets().at(-1)!.getRectangle();
        return Math.abs(img.y - box.y - SOTTO) > 1;
      });
    assert.deepEqual(fuori.sort(), [
      '02-Dim.Cut-IMG',
      '02-Dim.Luna-IMG',
      '02-Dim.Piane-IMG',
      '02-Dim.Silverlight-IMG',
    ]);
    // The map names exactly those, and nothing else.
    assert.deepEqual((DMG_FIXTURES.pulizia?.sposta ?? []).map((s) => s.campo).sort(), fuori);
  });

  it('puts the picture of every model in the row of its boxes', { skip: !fontsHere }, async () => {
    for (const modello of modelli()) {
      const { doc, font } = await apriModulo(DMG_FIXTURES, fontDir);
      const form = doc.getForm();
      const valori = { modello };
      compilaAcroform(form, DMG_FIXTURES, valori, font);
      pulisciFormulario(form, DMG_FIXTURES, campiVisibili(DMG_FIXTURES, valori));
      const immagini = form
        .getFields()
        .map((f) => f.getName())
        .filter((name) => name.endsWith('-IMG') && form.getFieldMaybe(name.slice(0, -4)));
      // Elise has no widths; every other model shows its own, on both pages.
      if (modello !== 'elise') assert.ok(immagini.length >= 2, `${modello}: ${immagini}`);
      for (const name of immagini) {
        const img = form.getField(name).acroField.getWidgets()[0]!.getRectangle();
        for (const widget of form.getField(name.slice(0, -4)).acroField.getWidgets()) {
          const box = widget.getRectangle();
          assert.ok(
            Math.abs(img.y - box.y - SOTTO) <= 0.5,
            `${modello}: ${name} at ${img.y.toFixed(1)}, its boxes at ${box.y.toFixed(1)}`,
          );
          // The box is inside the picture, as wide as the row of numbers.
          assert.ok(box.x >= img.x && box.x + box.width <= img.x + img.width, `${name}: x`);
        }
      }
    }
  });
});
