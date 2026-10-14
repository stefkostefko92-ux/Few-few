// Rilievi — the suppliers' official PDFs, ported from rilievi's tests/ordini.test.ts and movilift.test.ts (commit
// ae6329cb6): the files are exactly the versions the maps were measured on (SHA-256), every MoviLift form field is mapped
// to a field of the right type, its radio buttons are the options as they stand on the page and its lists offer exactly
// the PDF's options; the filled PDFs are one page — Pelazza's original with our values drawn on it, the argano sheet on
// the converted Word document, 2SG's upside-down scan turned upright, MoviLift's form filled and locked with no dangling
// buttons — and another version of a module makes no PDF.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import fontkit from '@pdf-lib/fontkit';
import { PDFCheckBox, PDFDict, PDFDocument, PDFDropdown, PDFName, PDFRadioGroup, PDFRef, PDFTextField, type PDFForm, type PDFPage } from 'pdf-lib';
import { ARGANI, fieldsOf, MOVILIFT, PELAZZA, SG } from '@/lib/rilievi/ordini/moduli';
import { assertModuli, moduloPdf } from '../rilievi/moduli-pdf';
import { renderModulo } from '../rilievi/modulo-pdf';
import { compilaAcroform } from '../rilievi/pdf-form';
import { pdfFontPaths } from '../rilievi/pdf';

const fontDir = process.env.REPORT_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);
const A4 = { width: 595.32, height: 841.92 };

/** The distinct objects of a page resource dictionary (Font, XObject): what is drawn on the page. */
function resources(page: PDFPage, kind: 'Font' | 'XObject'): string[] {
  const dict = page.node.Resources()?.lookupMaybe(PDFName.of(kind), PDFDict);
  return dict ? [...new Set(dict.values().map(String))] : [];
}

const blankForm = async (): Promise<PDFForm> => (await PDFDocument.load(moduloPdf(MOVILIFT))).getForm();

const radio = (key: string) => {
  const field = fieldsOf(MOVILIFT).find((f) => f.key === key);
  assert.ok(field?.kind === 'radio', key);
  return field;
};

describe('the supplier forms', () => {
  it('are the exact official PDFs their maps were measured on', () => {
    assert.doesNotThrow(() => assertModuli());
    assert.throws(() => moduloPdf({ ...PELAZZA, id: 'pelazza-altra-versione', sha256: '0'.repeat(64) }), /another version of the module/);
  });

  it('map every field of the MoviLift PDF but its two printed labels, each of its own kind', async () => {
    const form = await blankForm();
    const kinds = { text: PDFTextField, textarea: PDFTextField, check: PDFCheckBox, radio: PDFRadioGroup, select: PDFDropdown };
    const mapped = new Set<string>();
    for (const field of fieldsOf(MOVILIFT)) {
      assert.ok('acro' in field, field.key);
      assert.ok(form.getField(field.acro) instanceof kinds[field.kind], field.key);
      mapped.add(field.acro);
    }
    const left = form.getFields().map((f) => f.getName()).filter((name) => !mapped.has(name));
    // «SCHEDA» and «PLC» next to the Controllo buttons are fields that only hold their own label
    assert.deepEqual(left.sort(), ['Testo78', 'Testo79']);
  });

  it('know which button of a radio group is which option, as they stand on the page', async () => {
    const form = await blankForm();
    const rect = (key: string, valore: string) => {
      const field = radio(key);
      const option = field.opzioni.find((o) => o.valore === valore);
      assert.ok(option, `${key}.${valore}`);
      const widget = form.getRadioGroup(field.acro).acroField.getWidgets()[option.widget];
      assert.ok(widget, `${key}.${valore}`);
      return widget.getRectangle();
    };
    // the author numbered side B out of page order (1, 2, 0 from the top): the map follows the page
    for (const side of ['alimentazioneA', 'alimentazioneB']) {
      const top = rect(side, 'inMarcia').y, middle = rect(side, 'conLimiti').y, bottom = rect(side, 'senzaLimiti').y;
      assert.ok(top > middle && middle > bottom, side);
    }
    assert.ok(rect('locMacc', 'alto').x < rect('locMacc', 'basso').x);
    assert.ok(rect('controllo', 'plc').x < rect('controllo', 'scheda').x);
  });

  it('offer in their lists exactly the options of the PDF, "nothing chosen" being its own', async () => {
    const form = await blankForm();
    for (const field of fieldsOf(MOVILIFT)) {
      if (field.kind !== 'select') continue;
      const dropdown = form.getDropdown(field.acro);
      assert.deepEqual([...dropdown.getOptions()].sort(), [...field.opzioni, field.vuoto].sort());
      assert.deepEqual(dropdown.getSelected(), [field.vuoto]);
    }
  });
});

describe('the supplier PDFs', { skip: !fontsHere && 'DejaVu fonts are not installed here' }, () => {
  it('are the official Pelazza form, one A4 page, with the values on it', async () => {
    const pelazza = await renderModulo(PELAZZA, { ordine: true, cliente: 'Ascensori Rossi — Бобов дол', note: 'Riga uno\nRiga due' }, fontDir);
    const doc = await PDFDocument.load(pelazza, { updateMetadata: false });
    assert.equal(doc.getPageCount(), 1);
    assert.ok(pelazza.length > moduloPdf(PELAZZA).length, 'the values are drawn on the original');
    assert.equal(doc.getProducer(), 'LiftPilot Rilievi — Carbon Stealth VCC');
  });

  it('write the argano sheet on the converted Word document, one A4 page', async () => {
    const out = await renderModulo(ARGANI, { indirizzo: 'Via Verdi 14, Milano', taglia12: true, motoreInverter: true, giri: '1440' }, fontDir);
    const doc = await PDFDocument.load(out);
    assert.equal(doc.getPageCount(), 1);
    const blank = (await PDFDocument.load(moduloPdf(ARGANI))).getPage(0);
    assert.equal(resources(doc.getPage(0), 'Font').length, resources(blank, 'Font').length + 1, 'our font is added to the fonts of the Word sheet');
  });

  it('turn the upside-down 2SG scan upright, keep its size and write the notes on its lines', async () => {
    const out = await renderModulo(SG, { automatico: true, ordNo: '77', note: 'Operatore da sostituire. '.repeat(20) }, fontDir);
    const doc = await PDFDocument.load(out);
    assert.equal(doc.getPageCount(), 1);
    const page = doc.getPage(0);
    assert.equal(page.getRotation().angle, 0, 'upright on the page, not by a viewer rotation');
    assert.deepEqual(page.getSize(), A4);
    assert.equal(resources(page, 'XObject').length, 1, 'the scan, drawn turned on the new page');
    assert.equal(resources(page, 'Font').length, 1);
  });

  it('select one MoviLift button per radio group and clear what was removed from the blank form', async () => {
    const doc = await PDFDocument.load(moduloPdf(MOVILIFT));
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(readFileSync(pdfFontPaths(fontDir).regular), { subset: true });
    const form = doc.getForm();
    compilaAcroform(form, MOVILIFT, { locMacc: 'basso', marcaOpA: 'SELCOM', note: 'Nota' }, font);
    const state = (key: string) => {
      const group = form.getRadioGroup(radio(key).acro).acroField;
      const widgets = group.getWidgets();
      const off = PDFName.of('Off');
      return { on: widgets.map((w) => w.getAppearanceState() !== off), value: group.dict.get(PDFName.of('V')), onValues: widgets.map((w) => w.getOnValue()) };
    };
    const locMacc = state('locMacc');
    assert.deepEqual(locMacc.on, [false, true, false]);
    assert.equal(locMacc.value, locMacc.onValues[1]);
    // «Operatore Unico» and «Interpiani standard» are ticked on the blank form: removed here
    assert.deepEqual(state('ingressi').on, [false, false, false]);
    assert.equal(state('ingressi').value, PDFName.of('Off'));
    assert.equal(form.getCheckBox('Casella di controllo17').isChecked(), false);
    assert.equal(form.getTextField('Testo38').getText() ?? '', '', 'the «-» of side B is gone');
    assert.deepEqual(form.getDropdown('Casella combinata1').getSelected(), ['SELCOM']);
    assert.deepEqual(form.getDropdown('Casella combinata3').getSelected(), ['VOLT']);
    assert.equal(form.getTextField('Testo76').getText(), 'Nota');
  });

  it('print Fossa, Testata, Corsa and Dist. only in their row, not in the boxes of Piano Corto', async () => {
    // the author gave each of the four a second button among the boxes of «Piano Corto»
    const doc = await PDFDocument.load(moduloPdf(MOVILIFT));
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(readFileSync(pdfFontPaths(fontDir).regular), { subset: true });
    const form = doc.getForm();
    const own = fieldsOf(MOVILIFT).flatMap((f) => (f.kind === 'text' && 'widget' in f && f.widget !== undefined ? [{ key: f.key, acro: f.acro, widget: f.widget }] : []));
    assert.deepEqual(own.map((f) => f.key), ['fossa', 'testata', 'corsa', 'distLocMacchina']);
    const pianoCorto = form.getTextField('Testo59').acroField.getWidgets()[0]?.getRectangle().y ?? 0;
    for (const f of own) {
      const widgets = form.getTextField(f.acro).acroField.getWidgets();
      assert.equal(widgets.length, 2, f.key);
      assert.ok((widgets[f.widget]?.getRectangle().y ?? 0) > pianoCorto + 10, `${f.key}: its own row`);
    }
    const annots = () => doc.getPage(0).node.Annots()?.size() ?? 0;
    const before = annots();
    compilaAcroform(form, MOVILIFT, { fossa: '1,40', testata: '3,60', corsa: '15,2', distLocMacchina: '0' }, font);
    for (const f of own) assert.equal(form.getTextField(f.acro).acroField.getWidgets().length, 1, f.key);
    assert.equal(before - annots(), 4, 'the four stray buttons are off the page');
  });

  it('are the official MoviLift form, one A4 page, filled and locked, nothing pointing at a deleted button', async () => {
    const out = await renderModulo(MOVILIFT, { riferimento: 'N° 104552 — Бобов дол', controllo: 'plc', pianoA1: 'T', fermate: '6' }, fontDir);
    const doc = await PDFDocument.load(out);
    assert.equal(doc.getPageCount(), 1);
    assert.equal(doc.getForm().getFields().length, 0);
    const annots = doc.getPage(0).node.Annots()?.asArray() ?? [];
    assert.deepEqual(annots.filter((ref) => ref instanceof PDFRef && !doc.context.lookup(ref)), []);
    const { width, height } = doc.getPage(0).getSize();
    assert.ok(Math.abs(width - 595) < 2 && Math.abs(height - 842) < 2, `${width}×${height}`);
  });
});
