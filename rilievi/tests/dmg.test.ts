// DMG (owner, 2 November 2026): the controller order form Pitagora 4.0 under «Vuoi compilare la scheda
// per l'ordine quadro?» with «Marca quadro: DMG», and the fixtures order form (QF Fixtures) under «Vuoi
// compilare la scheda ordine bottoniere DMG?» in the section «Bottoniere». Both are the vendor's own
// fillable PDFs with JavaScript: a choice is a group of tick boxes with one name (by the name of the "on"
// state), hidden fields are shown by the script, and the action buttons and grey patches must never
// reach the printed sheet.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  AnnotationFlags,
  PDFButton,
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFTextField,
  type PDFForm,
} from 'pdf-lib';
import {
  DMG_FIXTURES,
  DMG_PITAGORA,
  fieldsOf,
  moduloPdf,
  type ModuloAcro,
} from '../src/ordini/moduli.js';
import { renderModulo } from '../src/ordini/pdf.js';
import { compilaAcroform } from '../src/ordini/pdf-form.js';
import {
  campiVisibili,
  pulisciFormulario,
  togliSenzaAspetto,
} from '../src/ordini/pdf-form-pulizia.js';
import { apriModulo } from '../src/ordini/pdf-testo.js';
import { marcheOf, SLOTS } from '../src/ordini/registry.js';
import { riepilogoModuli } from '../src/ordini/riepilogo.js';
import { fieldByKey } from '../src/schede/fields.js';
import { pdfFontPaths } from '../src/schede/pdf.js';
import { parseScheda } from '../src/schede/validation.js';

const fontDir = process.env.PDF_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);

const blank = async (modulo: ModuloAcro): Promise<PDFForm> =>
  (await PDFDocument.load(moduloPdf(modulo))).getForm();

const onStates = (form: PDFForm, name: string): string[] =>
  form
    .getField(name)
    .acroField.getWidgets()
    .map((w) => w.getOnValue()?.decodeText() ?? '');

describe('the two DMG maps', () => {
  for (const modulo of [DMG_PITAGORA, DMG_FIXTURES]) {
    it(`${modulo.id}: every field, state and option is in the PDF, of its own kind`, async () => {
      const form = await blank(modulo);
      for (const field of fieldsOf(modulo)) {
        if (!('acro' in field) || field.acro === undefined) {
          assert.equal(field.kind, 'radio', `${field.key}: only a choice may have no field`);
          continue;
        }
        const pdf = form.getField(field.acro);
        if (field.kind === 'text' || field.kind === 'textarea')
          assert.ok(pdf instanceof PDFTextField, field.key);
        else if (field.kind === 'select') {
          assert.ok(pdf instanceof PDFDropdown, field.key);
          assert.deepEqual([...field.opzioni, field.vuoto].sort(), [...pdf.getOptions()].sort());
        } else if (field.kind === 'check') {
          assert.ok(pdf instanceof PDFCheckBox, field.key);
          assert.equal(pdf.acroField.getWidgets().length, 1, field.key);
        } else {
          // A choice of the DMG forms: one group of tick boxes, each option by its "on" state.
          assert.ok(pdf instanceof PDFCheckBox, field.key);
          const states = onStates(form, field.acro);
          for (const option of field.opzioni)
            assert.ok(states.includes(option.stato!), `${field.key}: ${option.stato}`);
        }
      }
    });
  }

  it('show the pictures and the widths of the fixtures model chosen on the cover', async () => {
    const form = await blank(DMG_FIXTURES);
    const modello = fieldsOf(DMG_FIXTURES).find((f) => f.key === 'modello');
    assert.ok(modello?.kind === 'radio' && !('acro' in modello && modello.acro));
    assert.deepEqual(
      modello.opzioni.map((o) => o.label),
      ['Flat standard', 'Elise', 'Silverlight', 'Gilda TM', 'Luna', 'Cut', 'Greta'],
    );
    for (const option of modello.opzioni) {
      assert.ok(
        option.mostra?.some((name) => name.startsWith('00-Piastra-')),
        option.valore,
      );
      for (const name of option.mostra ?? []) assert.ok(form.getFieldMaybe(name), name);
    }
    const greta = modello.opzioni.find((o) => o.valore === 'greta')!;
    assert.deepEqual(greta.mostra, [
      '00-Piastra-Greta',
      '02-Dim.Greta',
      '02-Dim.Greta-IMG',
      '10-Dim.Greta',
      '10-Dim.Greta-IMG',
      '11-Dim.Greta',
      '11-Dim.Greta-IMG',
    ]);
  });
});

describe('filling a DMG form', () => {
  it('ticks the box of the chosen state, and only that one, for a group of tick boxes', async () => {
    const form = await blank(DMG_FIXTURES);
    const { font } = await apriModulo(DMG_FIXTURES, fontDir);
    compilaAcroform(form, DMG_FIXTURES, { cMateriale: 'g320', modello: 'greta' }, font);
    const field = form.getField('03-Materiale');
    assert.equal(field.acroField.dict.get(PDFName.of('V'))?.toString(), '/G320');
    for (const widget of field.acroField.getWidgets()) {
      const state = widget.getAppearanceState()?.decodeText();
      assert.equal(state, widget.getOnValue()?.decodeText() === 'G320' ? 'G320' : 'Off');
    }
  });

  it('prints the chosen model, never the cover, the buttons, the patches or the script', async () => {
    const doc = await PDFDocument.load(moduloPdf(DMG_FIXTURES));
    const form = doc.getForm();
    const valori = { modello: 'greta', cLarghezzaGreta: 'l160', cMateriale: 'g320' } as const;
    pulisciFormulario(form, DMG_FIXTURES, campiVisibili(DMG_FIXTURES, valori));
    togliSenzaAspetto(form);
    const names = new Set(form.getFields().map((f) => f.getName()));
    for (const shown of ['00-Piastra-Greta', '02-Dim.Greta', '02-Dim.Greta-IMG', '03-Materiale'])
      assert.ok(names.has(shown), shown);
    for (const gone of ['00-Home', '00-Piastra-Luna', '02-Dim.Luna', '00-ICO-Invia', '00-RESET'])
      assert.ok(!names.has(gone), gone);
    assert.ok(![...names].some((n) => n.endsWith('-TOPPA')), 'a patch is left');
    for (const field of form.getFields()) {
      if (field instanceof PDFButton) assert.ok(names.has(field.getName()));
      for (const widget of field.acroField.getWidgets())
        assert.equal(widget.getFlags() & AnnotationFlags.Hidden, 0, field.getName());
    }
    assert.equal(doc.catalog.get(PDFName.of('OpenAction')), undefined);
    const jsNames = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
    assert.equal(jsNames?.get(PDFName.of('JavaScript')), undefined);
  });

  it('gives a whole, flat PDF of both forms', { skip: !fontsHere }, async () => {
    const outputs = [
      await renderModulo(
        DMG_PITAGORA,
        {
          azienda: 'Ascensori Rossi Srl',
          normativa: 'en8120',
          taglia: 'taglia21',
          nPiani: '6',
          pianoMrl: 'f6',
          anelloChiuso: 'si',
          encoder: 'enDat',
          neutroDtu: true,
          noteQuadro: 'Prova',
        },
        fontDir,
      ),
      await renderModulo(
        DMG_FIXTURES,
        { cliente: 'Ascensori Rossi Srl', modello: 'luna', fermate: '6', cMateriale: 'lino' },
        fontDir,
      ),
    ];
    // What nothing points to any more (the cover, the pictures of the other models) is not written.
    assert.ok(outputs[1]!.length < moduloPdf(DMG_FIXTURES).length * 0.75, `${outputs[1]!.length}`);
    for (const [i, bytes] of outputs.entries()) {
      const doc = await PDFDocument.load(bytes);
      assert.equal(doc.getPageCount(), i === 0 ? 4 : 2);
      assert.equal(doc.getForm().getFields().length, 0, 'flattened');
      // Every link of the pages points to something that is there.
      for (const page of doc.getPages()) {
        for (const ref of page.node.Annots()?.asArray() ?? [])
          assert.notEqual(doc.context.lookup(ref), undefined);
      }
    }
  });
});

describe('where the DMG forms open', () => {
  const minimal = { data: '2026-11-03', matricola: '33871' };

  it('opens Pitagora under the panel order for a DMG panel', () => {
    assert.ok(marcheOf('quadroOrdine').includes('DMG'));
    assert.ok(fieldByKey('quadroOrdine')?.when?.values.includes('DMG'));
    const slot = SLOTS.find((s) => s.modulo === DMG_PITAGORA);
    assert.deepEqual(
      [slot?.column, slot?.question, slot?.prefix],
      ['ordineQuadro', 'quadroOrdine', 'dp'],
    );
    const yes = parseScheda({
      ...minimal,
      quadroMarca: 'DMG',
      quadroOrdine: 'si',
      'dp-_': '1',
      'dp-nPiani': '6',
      'dp-taglia': 'taglia21',
    });
    assert.ok(yes.ok);
    assert.deepEqual(yes.ok && yes.data.ordineQuadro, {
      modulo: DMG_PITAGORA.id,
      valori: { nPiani: '6', taglia: 'taglia21' },
    });
  });

  it('asks for the fixtures order only with the panels to change, for every make', () => {
    assert.deepEqual(fieldByKey('bottoniereOrdine')?.when, {
      field: 'bottoniereSostituire',
      values: ['si'],
    });
    const body = { 'db-_': '1', 'db-modello': 'greta', 'db-cLarghezzaGreta': 'l160' };
    const yes = parseScheda({
      ...minimal,
      quadroMarca: 'PELAZZA',
      bottoniereSostituire: 'si',
      bottoniereOrdine: 'si',
      ...body,
    });
    assert.ok(yes.ok);
    assert.deepEqual(yes.ok && yes.data.ordineBottoniere, {
      modulo: DMG_FIXTURES.id,
      valori: { modello: 'greta', cLarghezzaGreta: 'l160' },
    });
    const no = parseScheda({
      ...minimal,
      bottoniereSostituire: 'no',
      bottoniereOrdine: 'si',
      ...body,
    });
    assert.ok(no.ok);
    assert.equal(no.ok && no.data.bottoniereOrdine, null, 'not asked');
    assert.equal(no.ok && no.data.ordineBottoniere, null);
  });

  it('lists the fixtures order among the orders of the saved sheet', () => {
    const scheda = {
      riepilogoOrdini: true,
      moduliStampati: ['ordineBottoniere'],
      quadroMarca: null,
      quadroModello: null,
      tipoImpianto: [],
      quadroOrdine: null,
      ordineQuadro: null,
      arganoPreventivo: null,
      preventivoArgano: null,
      sospensioni: null,
      operatoreModulo: null,
      ordineSospensioni: null,
      testataInterventi: [],
      fossaInterventi: [],
      ordineAmi: null,
      bottoniereOrdine: true,
      ordineBottoniere: { modulo: DMG_FIXTURES.id, valori: { modello: 'cut', fermate: '4' } },
    };
    assert.deepEqual(riepilogoModuli(scheda), [
      {
        nome: 'Quote form Fixtures (bottoniere, v1.3) · DMG',
        gruppi: [
          {
            titolo: 'Intestazione',
            spunte: [],
            testi: [{ label: 'Modello di pulsantiera', value: 'Cut' }],
          },
          {
            titolo: 'Cabina · 1 · N° fermate',
            spunte: [],
            testi: [{ label: 'N° fermate', value: '4' }],
          },
        ],
      },
    ]);
  });
});
