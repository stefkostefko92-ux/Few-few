// Rilievi — the suppliers' official PDFs, ported from rilievi's tests/ordini.test.ts (commit 174a1e3aa): the files are
// exactly the versions the maps were measured on (SHA-256), every Montanari form field is mapped to a field of the right
// type, the filled PDFs are one page — Pelazza's original with our values drawn on it, Montanari's form filled and
// locked — and another version of a module makes no PDF.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PDFCheckBox, PDFDocument, PDFTextField } from 'pdf-lib';
import { fieldsOf, MONTANARI, PELAZZA } from '@/lib/rilievi/ordini/moduli';
import { assertModuli, moduloPdf } from '../rilievi/moduli-pdf';
import { renderModulo } from '../rilievi/modulo-pdf';
import { pdfFontPaths } from '../rilievi/pdf';

const fontDir = process.env.REPORT_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);

describe('the supplier forms', () => {
  it('are the exact official PDFs their maps were measured on', () => {
    assert.doesNotThrow(() => assertModuli());
    assert.throws(() => moduloPdf({ ...PELAZZA, id: 'pelazza-altra-versione', sha256: '0'.repeat(64) }), /another version of the module/);
  });

  it('map every Montanari field to the form field of the right type, and nothing is left out', async () => {
    const form = (await PDFDocument.load(moduloPdf(MONTANARI))).getForm();
    const mapped = new Set<string>();
    for (const field of fieldsOf(MONTANARI)) {
      if (!('acro' in field)) continue;
      const target = form.getField(field.acro);
      if (field.kind === 'check') assert.ok(target instanceof PDFCheckBox, field.acro);
      else assert.ok(target instanceof PDFTextField, field.acro);
      mapped.add(field.acro);
    }
    const unmapped = form.getFields().map((f) => f.getName()).filter((name) => !mapped.has(name));
    assert.deepEqual(unmapped, ['invia modulo '], 'only the send button stays as it is');
  });
});

describe('the supplier PDFs', { skip: !fontsHere && 'DejaVu fonts are not installed here' }, () => {
  it('are the official form, one A4 page, with the values on it', async () => {
    const pelazza = await renderModulo(PELAZZA, { ordine: true, cliente: 'Ascensori Rossi — Бобов дол', note: 'Riga uno\nRiga due' }, fontDir);
    const doc = await PDFDocument.load(pelazza);
    assert.equal(doc.getPageCount(), 1);
    assert.ok(pelazza.length > moduloPdf(PELAZZA).length, 'the values are drawn on the original');
  });

  it('fill and lock the Montanari form: no fillable field is left in the PDF', async () => {
    const out = await renderModulo(MONTANARI, { ragioneSociale: 'Ascensori Rossi', mrl: true, informazioni: 'Testo. '.repeat(120) }, fontDir);
    const doc = await PDFDocument.load(out);
    assert.equal(doc.getPageCount(), 1);
    assert.equal(doc.getForm().getFields().length, 0);
  });
});
