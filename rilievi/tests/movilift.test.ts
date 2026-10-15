import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import fontkit from '@pdf-lib/fontkit';
import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFRadioGroup,
  PDFRef,
  PDFTextField,
  type PDFForm,
} from 'pdf-lib';
import { translatorFor } from '../src/i18n.js';
import { discrepanzeDi, prefillCollegati } from '../src/ordini/collegati.js';
import { fieldsOf, moduloPdf, MOVILIFT, PELAZZA } from '../src/ordini/moduli.js';
import { renderModulo } from '../src/ordini/pdf.js';
import { compilaAcroform } from '../src/ordini/pdf-form.js';
import { opzioneDi } from '../src/ordini/opzioni.js';
import { prefillValori } from '../src/ordini/prefill.js';
import { marcheOf } from '../src/ordini/registry.js';
import { riepilogoModuli } from '../src/ordini/riepilogo.js';
import { parseModulo, storedValori } from '../src/ordini/valori.js';
import { fieldByKey } from '../src/schede/fields.js';
import { pdfFontPaths } from '../src/schede/pdf.js';
import { parseScheda } from '../src/schede/validation.js';

const t = translatorFor('it');
const fontDir = process.env.PDF_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);

const blankForm = async (): Promise<PDFForm> =>
  (await PDFDocument.load(moduloPdf(MOVILIFT))).getForm();

const radio = (key: string) => {
  const field = fieldsOf(MOVILIFT).find((f) => f.key === key);
  assert.ok(field?.kind === 'radio', key);
  return field;
};

describe('the MoviLift order form', () => {
  it('maps every field of the official PDF but its two printed labels, each of its own kind', async () => {
    const form = await blankForm();
    const fields = fieldsOf(MOVILIFT);
    assert.equal(fields.length, 128);
    const kinds = {
      text: PDFTextField,
      textarea: PDFTextField,
      check: PDFCheckBox,
      radio: PDFRadioGroup,
      select: PDFDropdown,
    };
    const mapped = new Set<string>();
    for (const field of fields) {
      assert.ok('acro' in field, field.key);
      assert.ok(form.getField(field.acro) instanceof kinds[field.kind], field.key);
      mapped.add(field.acro);
    }
    const left = form
      .getFields()
      .map((f) => f.getName())
      .filter((name) => !mapped.has(name));
    // "SCHEDA" and "PLC" next to the Controllo buttons are fields that only hold their own label.
    assert.deepEqual(left.sort(), ['Testo78', 'Testo79']);
  });

  it('knows which button of a radio group is which option, as they stand on the page', async () => {
    const form = await blankForm();
    const rect = (key: string, valore: string) => {
      const field = radio(key);
      const option = field.opzioni.find((o) => o.valore === valore);
      assert.ok(option, `${key}.${valore}`);
      const widget = form.getRadioGroup(field.acro).acroField.getWidgets()[option.widget];
      assert.ok(widget, `${key}.${valore}`);
      return widget.getRectangle();
    };
    // The author numbered side B out of page order (1, 2, 0 from the top): the map follows the page.
    for (const side of ['alimentazioneA', 'alimentazioneB']) {
      const top = rect(side, 'inMarcia').y;
      const middle = rect(side, 'conLimiti').y;
      const bottom = rect(side, 'senzaLimiti').y;
      assert.ok(top > middle && middle > bottom, side);
    }
    assert.ok(rect('locMacc', 'alto').x < rect('locMacc', 'basso').x);
    assert.ok(rect('controllo', 'plc').x < rect('controllo', 'scheda').x);
  });

  it('offers in its lists exactly the options of the PDF, "nothing chosen" being its own', async () => {
    const form = await blankForm();
    for (const field of fieldsOf(MOVILIFT)) {
      if (field.kind !== 'select') continue;
      const dropdown = form.getDropdown(field.acro);
      assert.deepEqual([...dropdown.getOptions()].sort(), [...field.opzioni, field.vuoto].sort());
      assert.deepEqual(dropdown.getSelected(), [field.vuoto]);
    }
  });

  it('opens under the question of the panel order only for its own make', () => {
    assert.deepEqual(marcheOf('quadroOrdine'), ['PELAZZA', 'MOVILIFT', 'MASTECH']);
    assert.deepEqual(fieldByKey('quadroOrdine')?.when?.values, marcheOf('quadroOrdine'));
    // The argano sheet and the 2SG sheet are for every make: their questions have no condition.
    for (const question of ['arganoPreventivo', 'sospensioni'] as const) {
      assert.deepEqual(marcheOf(question), [], question);
      assert.equal(fieldByKey(question)?.when, undefined, question);
    }
  });
});

describe('prefilling the MoviLift order', () => {
  const ctx = {
    values: {
      data: '2026-10-12',
      numeroImpianto: '104552',
      indirizzo: 'Via Verdi 14, Milano',
      portataKg: '630',
      capienzaPersone: '8',
      fermate: '6',
      tipoImpianto: ['ELETTRICO', 'GEARLESS'],
      tipoPorte: ['AUTOMATICHE'],
      operatoreMarca: 'Selcom',
      operatoreTensione: '24 V DC',
      doppioAccesso: 'si',
      ubicazioneMacchina: ['BASSO'],
      // Hidden with automatic doors: says nothing.
      pattinoRetrattile: 'si',
    },
    azienda: 'Ascensori Rossi Srl',
    utente: 'Mario Bianchi',
    ruolo: 'Tecnico',
    email: 'mario@example.it',
    etichetta: (campo: string, valore: string) => t(`scheda.option.${campo}.${valore}`),
  };

  it('opens with the answers of the blank form, the survey and the linked data', () => {
    assert.deepEqual(prefillValori(MOVILIFT, ctx), {
      // The blank form.
      controllo: 'scheda',
      fornitura: 'soloQuadro',
      alimentazioneA: 'conLimiti',
      pianoB1: '-',
      interpianiStandard: true,
      armadio: 'standard',
      anta: 'sx',
      uscita: 'poloPiano',
      comune: 'neg',
      combinatore: 'predisposizione',
      // The survey and the person writing.
      riferimento: 'N° 104552 — Via Verdi 14, Milano',
      ragioneSociale: 'Ascensori Rossi Srl',
      email: 'mario@example.it',
      tipologia: 'Elettrico, MRL',
      tipoPorte: 'Automatiche',
      marcaOpA: 'SELCOM',
      voltA: '24Vcc',
      // The plant data, over the blank form ("Operatore Unico", "Loc. Macc. in ALTO").
      fermate: '6',
      portata: '630',
      capienza: '8',
      nImpianto: '104552',
      ingressi: 'doppio',
      locMacc: 'basso',
    });
  });

  it('takes nothing from a hidden field of the survey', () => {
    const manual = {
      ...ctx,
      values: { ...ctx.values, tipoPorte: ['MANUALI'], ubicazioneMacchina: [] },
    };
    const valori = prefillValori(MOVILIFT, manual);
    assert.equal(valori.marcaOpA, undefined, 'no door operator with manual doors');
    assert.equal(valori.voltA, undefined);
    assert.equal(valori.ingressi, 'doppio', 'the double entrance is asked with manual doors too');
    assert.equal(valori.locMacc, 'alto');
    assert.equal(valori.elettrPattino, true, 'the retractable skate is asked with manual doors');
  });

  it('picks a list option by its word, or by its numbers when only one option has them', () => {
    const volt = ['24Vcc', '48Vcc', '96Vca', '125Vca', '220mono', '220tri'];
    assert.equal(opzioneDi(['2SG', 'SELCOM'], ' Selcom '), 'SELCOM');
    assert.equal(opzioneDi(volt, '24 V DC'), '24Vcc');
    assert.equal(opzioneDi(volt, '220 tri'), '220tri');
    assert.equal(opzioneDi(volt, '220 V'), null, 'mono or three-phase: not for us to guess');
    assert.equal(opzioneDi(volt, '230 V'), null);
    assert.equal(opzioneDi(volt, ''), null);
  });
});

describe('the MoviLift order among the linked data', () => {
  const movilift = { quadroMarca: 'MOVILIFT', quadroOrdine: 'si', 'om-_': '1' };

  it('takes the entrances and the machine room from the sheet, a radio only from one answer', () => {
    const values = {
      ...movilift,
      tipoPorte: ['AUTOMATICHE'],
      doppioAccesso: 'no',
      ubicazioneMacchina: ['ALTO', 'BASSO'],
    };
    assert.deepEqual(prefillCollegati('om', values), { ingressi: 'unico' });
  });

  it('carries the plant data of the Pelazza order over when the panel becomes a MoviLift', () => {
    const pelazza = {
      quadroMarca: 'PELAZZA',
      quadroOrdine: 'si',
      'oq-nFermate': '7',
      'oq-velocita': '1,6',
      'oq-corsa': '21',
      'oq-motVca': '400',
    };
    assert.deepEqual(prefillCollegati('om', pelazza), {
      fermate: '7',
      velocita: '1,6',
      corsa: '21',
      tensFune: '400',
    });
  });

  it('compares it with the sheet, never with what is left of a Pelazza order', () => {
    const values = {
      ...movilift,
      fermate: '5',
      'om-fermate': '6',
      'oq-nFermate': '9',
      tipoPorte: ['AUTOMATICHE'],
      doppioAccesso: 'si',
      'om-ingressi': 'unico',
    };
    assert.deepEqual(discrepanzeDi(values, t), [
      {
        key: 'fermate',
        voci: [
          { luogo: 'scheda', valore: '5' },
          { luogo: 'om', valore: '6' },
        ],
      },
      {
        key: 'ingressi',
        voci: [
          { luogo: 'scheda', valore: '2' },
          { luogo: 'om', valore: 'Operatore Unico' },
        ],
      },
    ]);
    // A selected double entrance is still a double entrance.
    const agree = { ...values, 'om-fermate': '5', 'om-ingressi': 'doppioSelezionato' };
    assert.deepEqual(discrepanzeDi(agree, t), []);
  });
});

describe('saving the MoviLift order', () => {
  it('keeps only the options of its radio groups and lists', () => {
    const ok = parseModulo(MOVILIFT, 'om', {
      'om-controllo': 'plc',
      'om-voltA': '48Vcc',
      'om-pianoA1': 'S1',
      'om-interpianiStandard': 'si',
    });
    assert.deepEqual(ok.errors, {});
    assert.deepEqual(ok.dati, {
      modulo: MOVILIFT.id,
      valori: { controllo: 'plc', voltA: '48Vcc', pianoA1: 'S1', interpianiStandard: true },
    });
    const forged = parseModulo(MOVILIFT, 'om', {
      'om-controllo': 'constructor',
      'om-voltA': '380V',
      'om-pianoA1': 'ABC',
    });
    assert.deepEqual(forged.errors, {
      'om-controllo': 'option',
      'om-voltA': 'option',
      'om-pianoA1': 'tooLong',
    });
  });

  it('reads back only its own JSON, never the Pelazza order stored in the same column', () => {
    assert.equal(storedValori(MOVILIFT, { modulo: PELAZZA.id, valori: { note: 'x' } }), null);
    const json = {
      modulo: MOVILIFT.id,
      valori: { controllo: 'plc', voltA: '999', note: 'ok', interpianiStandard: true },
    };
    assert.deepEqual(storedValori(MOVILIFT, json), {
      controllo: 'plc',
      note: 'ok',
      interpianiStandard: true,
    });
  });

  it('is the order of the sheet for a MoviLift panel, and the Pelazza one for a Pelazza panel', () => {
    const both = {
      data: '2026-10-12',
      matricola: '33871',
      quadroOrdine: 'si',
      'oq-_': '1',
      'oq-nFermate': '6',
      'om-_': '1',
      'om-fermate': '6',
      'om-controllo': 'plc',
    };
    const movilift = parseScheda({ ...both, quadroMarca: 'MOVILIFT' });
    assert.ok(movilift.ok);
    assert.deepEqual(movilift.data.ordineQuadro, {
      modulo: MOVILIFT.id,
      valori: { fermate: '6', controllo: 'plc' },
    });
    const pelazza = parseScheda({ ...both, quadroMarca: 'PELAZZA' });
    assert.ok(pelazza.ok);
    assert.deepEqual(pelazza.data.ordineQuadro, { modulo: PELAZZA.id, valori: { nFermate: '6' } });
  });

  it('comes into the sheet print with its choices as the paper words them', () => {
    const scheda = {
      riepilogoOrdini: true,
      quadroMarca: 'MOVILIFT' as const,
      quadroModello: null,
      quadroOrdine: true,
      ordineQuadro: {
        modulo: MOVILIFT.id,
        // "-" is the blank form's own text on side B: not written by anyone, not printed.
        valori: {
          controllo: 'scheda',
          fornitura: 'soloQuadro',
          fermate: '6',
          marcaOpA: 'SELCOM',
          pianoB1: '-',
        },
      },
      arganoPreventivo: null,
      preventivoArgano: null,
      sospensioni: null,
      ordineSospensioni: null,
    };
    assert.deepEqual(riepilogoModuli(scheda), [
      {
        nome: 'Modulo ordine quadro (Scelta v2.6) · MoviLift',
        gruppi: [
          {
            titolo: 'Impianto',
            spunte: ['Solo Quadro'],
            testi: [
              { label: 'Fermate', value: '6' },
              { label: 'Controllo', value: 'SCHEDA' },
            ],
          },
          { titolo: 'Varie', spunte: [], testi: [{ label: 'Marca Op (lato A)', value: 'SELCOM' }] },
        ],
      },
    ]);
    assert.deepEqual(riepilogoModuli({ ...scheda, quadroMarca: 'PELAZZA' }), []);
  });
});

describe('the MoviLift PDF', { skip: !fontsHere && 'DejaVu fonts are not installed here' }, () => {
  it('selects one button per radio group and clears what was removed from the blank form', async () => {
    const doc = await PDFDocument.load(moduloPdf(MOVILIFT));
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(readFileSync(pdfFontPaths(fontDir).regular), { subset: true });
    const form = doc.getForm();
    compilaAcroform(form, MOVILIFT, { locMacc: 'basso', marcaOpA: 'SELCOM', note: 'Nota' }, font);
    const state = (key: string) => {
      const group = form.getRadioGroup(radio(key).acro).acroField;
      const widgets = group.getWidgets();
      const off = PDFName.of('Off');
      return {
        on: widgets.map((w) => w.getAppearanceState() !== off),
        value: group.dict.get(PDFName.of('V')),
        onValues: widgets.map((w) => w.getOnValue()),
      };
    };
    const locMacc = state('locMacc');
    assert.deepEqual(locMacc.on, [false, true, false]);
    assert.equal(locMacc.value, locMacc.onValues[1]);
    // "Operatore Unico" and "Interpiani standard" are ticked on the blank form: removed here.
    assert.deepEqual(state('ingressi').on, [false, false, false]);
    assert.equal(state('ingressi').value, PDFName.of('Off'));
    assert.equal(form.getCheckBox('Casella di controllo17').isChecked(), false);
    assert.equal(form.getTextField('Testo38').getText() ?? '', '', 'the "-" of side B is gone');
    assert.deepEqual(form.getDropdown('Casella combinata1').getSelected(), ['SELCOM']);
    assert.deepEqual(form.getDropdown('Casella combinata3').getSelected(), ['VOLT']);
    assert.equal(form.getTextField('Testo76').getText(), 'Nota');
  });

  it('prints Fossa, Testata, Corsa and Dist. only in their row, not in the boxes of Piano Corto', async () => {
    // The author gave each of the four a second button among the boxes of "Piano Corto".
    const doc = await PDFDocument.load(moduloPdf(MOVILIFT));
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(readFileSync(pdfFontPaths(fontDir).regular), { subset: true });
    const form = doc.getForm();
    const own = fieldsOf(MOVILIFT).flatMap((f) =>
      f.kind === 'text' && 'widget' in f && f.widget !== undefined
        ? [{ key: f.key, acro: f.acro, widget: f.widget }]
        : [],
    );
    assert.deepEqual(
      own.map((f) => f.key),
      ['fossa', 'testata', 'corsa', 'distLocMacchina'],
    );
    const pianoCorto = form.getTextField('Testo59').acroField.getWidgets()[0]!.getRectangle().y;
    for (const f of own) {
      const widgets = form.getTextField(f.acro).acroField.getWidgets();
      assert.equal(widgets.length, 2, f.key);
      assert.ok(widgets[f.widget]!.getRectangle().y > pianoCorto + 10, `${f.key}: its own row`);
    }
    const annots = () => doc.getPage(0).node.Annots()?.size() ?? 0;
    const before = annots();
    const valori = { fossa: '1,40', testata: '3,60', corsa: '15,2', distLocMacchina: '0' };
    compilaAcroform(form, MOVILIFT, valori, font);
    for (const f of own) {
      assert.equal(form.getTextField(f.acro).acroField.getWidgets().length, 1, f.key);
    }
    assert.equal(before - annots(), 4, 'the four stray buttons are off the page');
  });

  it('is the official form, one A4 page, filled and locked', async () => {
    const out = await renderModulo(
      MOVILIFT,
      { riferimento: 'N° 104552 — Бобов дол', controllo: 'plc', pianoA1: 'T', fermate: '6' },
      fontDir,
    );
    const doc = await PDFDocument.load(out);
    assert.equal(doc.getPageCount(), 1);
    assert.equal(doc.getForm().getFields().length, 0);
    // Locking deletes the buttons of radio groups: nothing may still point at them.
    const annots = doc.getPage(0).node.Annots()?.asArray() ?? [];
    const dangling = annots.filter((ref) => ref instanceof PDFRef && !doc.context.lookup(ref));
    assert.deepEqual(dangling, []);
    const { width, height } = doc.getPage(0).getSize();
    assert.ok(Math.abs(width - 595) < 2 && Math.abs(height - 842) < 2, `${width}×${height}`);
  });
});
