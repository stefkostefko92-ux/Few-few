import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PDFCheckBox, PDFDocument, PDFTextField } from 'pdf-lib';
import { translatorFor } from '../src/i18n.js';
import { assertModuli, fieldsOf, moduloPdf, MONTANARI, PELAZZA } from '../src/ordini/moduli.js';
import { renderModulo } from '../src/ordini/pdf.js';
import { prefillValori, rifImpianto } from '../src/ordini/prefill.js';
import { parseModulo, storedValori } from '../src/ordini/valori.js';
import { pdfFontPaths } from '../src/schede/pdf.js';
import { parseScheda } from '../src/schede/validation.js';

const t = translatorFor('it');
const fontDir = process.env.PDF_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);
const A4 = { width: 595.32, height: 841.92 };

describe('the supplier forms', () => {
  it('are the exact official PDFs their maps were measured on', () => {
    assert.doesNotThrow(() => assertModuli());
    assert.equal(fieldsOf(PELAZZA).length, 152);
    assert.equal(fieldsOf(MONTANARI).length, 75);
  });

  it('place every Pelazza box and line on the page, boxes at the size of the printed squares', () => {
    for (const field of fieldsOf(PELAZZA)) {
      if ('box' in field) {
        const [x0, y0, x1, y1] = field.box;
        assert.ok(x1 - x0 > 7 && x1 - x0 < 13, `${field.key} width ${x1 - x0}`);
        assert.ok(y1 - y0 > 6 && y1 - y0 < 12, `${field.key} height ${y1 - y0}`);
        assert.ok(x0 > 0 && x1 < A4.width && y0 > 0 && y1 < A4.height, field.key);
      } else if ('line' in field) {
        const [x0, x1, y] = field.line;
        assert.ok(x0 < x1 && x0 > 0 && x1 < A4.width && y > 0 && y < A4.height, field.key);
      }
    }
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
    const unmapped = form
      .getFields()
      .map((f) => f.getName())
      .filter((name) => !mapped.has(name));
    assert.deepEqual(unmapped, ['invia modulo '], 'only the send button stays as it is');
  });
});

describe('the values of a supplier form', () => {
  it('take a tick only as "si", and clean and bound the text', () => {
    const { dati, errors } = parseModulo(PELAZZA, 'oq', {
      'oq-ordine': 'si',
      'oq-offerta': '',
      'oq-cliente': '  Ascensori   Rossi  ',
      'oq-nFermate': '6',
      'oq-quantita': '1234567',
      'oq-porteManuali': 'on',
      'oq-nonEsiste': 'x',
    });
    assert.deepEqual(dati.valori, { ordine: true, cliente: 'Ascensori Rossi', nFermate: '6' });
    assert.equal(dati.modulo, PELAZZA.id);
    assert.equal(errors['oq-quantita'], 'tooLong');
    assert.equal(errors['oq-porteManuali'], 'invalid');
  });

  it('read back only the keys of the form, of the right kind', () => {
    const valori = storedValori(PELAZZA, {
      modulo: PELAZZA.id,
      valori: { ordine: true, cliente: 'Rossi', nFermate: true, altro: 'x', offerta: 'si' },
    });
    assert.deepEqual(valori, { ordine: true, cliente: 'Rossi' });
    assert.equal(storedValori(PELAZZA, null), null);
    assert.equal(storedValori(PELAZZA, ['x']), null);
  });
});

describe('prefilling from the survey', () => {
  const ctx = {
    values: {
      data: '2026-10-12',
      numeroImpianto: '104552',
      matricola: '',
      indirizzo: 'Via Verdi 14, Milano',
      fermate: '6',
      doppioAccesso: 'si',
      tipoPorte: ['AUTOMATICHE'],
      ubicazioneMacchina: ['ALTO'],
      portataKg: '630',
      funiNumero: '4',
      funiDiametroMm: '10,5',
    },
    azienda: 'Ascensori Rossi Srl',
    utente: 'Mario Bianchi',
    ruolo: 'Tecnico',
    email: 'mario@example.it',
    etichetta: (campo: string, valore: string) => t(`scheda.option.${campo}.${valore}`),
  };

  it('fills the Pelazza order with the date, the lift, the stops, the entrances and the doors', () => {
    assert.equal(rifImpianto(ctx.values), 'N° 104552 — Via Verdi 14, Milano');
    assert.deepEqual(prefillValori(PELAZZA, ctx), {
      data: '12/10/2026',
      cliente: 'Ascensori Rossi Srl',
      rifImpianto: 'N° 104552 — Via Verdi 14, Milano',
      porteAutomatiche: true,
      nFermate: '6',
      nAccessi: '2',
    });
  });

  it('fills the Montanari request with the company, the person, the load and the ropes', () => {
    const valori = prefillValori(MONTANARI, ctx);
    assert.equal(valori.ragioneSociale, 'Ascensori Rossi Srl');
    assert.equal(valori.nomeCognome, 'Mario Bianchi');
    assert.equal(valori.ruolo, 'Tecnico');
    assert.equal(valori.email, 'mario@example.it');
    assert.equal(valori.portata, '630');
    assert.equal(valori.fermate, '6');
    assert.equal(valori.macchinaAlto, true);
    assert.equal(valori.macchinaBasso, undefined);
    assert.equal(valori.funiN, '4');
    assert.equal(valori.funiDiam, '10,5');
    assert.ok(String(valori.riferimentoImpianto).length <= 37, 'cut to the width of the field');
  });
});

describe('the questions that open the supplier forms', () => {
  const minimal = { data: '2026-10-12', matricola: '33871' };

  it('read the Pelazza order only for a Pelazza panel and only with "si"', () => {
    const order = { 'oq-ordine': 'si', 'oq-nFermate': '6', 'oq-_': '1' };
    const yes = parseScheda({ ...minimal, quadroMarca: 'PELAZZA', quadroOrdine: 'si', ...order });
    assert.ok(yes.ok);
    assert.deepEqual(yes.ok && yes.data.ordineQuadro?.valori, { ordine: true, nFermate: '6' });
    const other = parseScheda({ ...minimal, quadroMarca: 'DMG', quadroOrdine: 'si', ...order });
    assert.ok(other.ok);
    assert.equal(other.ok && other.data.quadroOrdine, null, 'the question is not asked for DMG');
    assert.equal(other.ok && other.data.ordineQuadro, null);
    const no = parseScheda({ ...minimal, quadroMarca: 'PELAZZA', quadroOrdine: 'no', ...order });
    assert.equal(no.ok && no.data.ordineQuadro, null);
  });

  it('keep the other make only with "Altro", and report errors in a form under its own name', () => {
    const altro = parseScheda({ ...minimal, arganoMarca: 'ALTRO', arganoMarcaAltro: 'Sassi' });
    assert.equal(altro.ok && altro.data.arganoMarcaAltro, 'Sassi');
    const montanari = parseScheda({
      ...minimal,
      arganoMarca: 'MONTANARI',
      arganoMarcaAltro: 'Sassi',
      arganoPreventivo: 'si',
      'pa-cap': 'x'.repeat(40),
    });
    assert.equal(montanari.ok, false);
    assert.equal(!montanari.ok && montanari.errors['pa-cap'], 'tooLong');
    const valid = parseScheda({ ...minimal, arganoMarca: 'MONTANARI', arganoMarcaAltro: 'Sassi' });
    assert.equal(valid.ok && valid.data.arganoMarcaAltro, null);
  });
});

describe('the supplier PDFs', { skip: !fontsHere && 'DejaVu fonts are not installed here' }, () => {
  it('are the official form, one A4 page, with the values on it', async () => {
    const pelazza = await renderModulo(
      PELAZZA,
      { ordine: true, cliente: 'Ascensori Rossi — Бобов дол', note: 'Riga uno\nRiga due' },
      fontDir,
    );
    const doc = await PDFDocument.load(pelazza);
    assert.equal(doc.getPageCount(), 1);
    assert.ok(pelazza.length > moduloPdf(PELAZZA).length, 'the values are drawn on the original');
  });

  it('fill and lock the Montanari form: no fillable field is left in the PDF', async () => {
    const out = await renderModulo(
      MONTANARI,
      { ragioneSociale: 'Ascensori Rossi', mrl: true, informazioni: 'Testo. '.repeat(120) },
      fontDir,
    );
    const doc = await PDFDocument.load(out);
    assert.equal(doc.getPageCount(), 1);
    assert.equal(doc.getForm().getFields().length, 0);
  });
});
