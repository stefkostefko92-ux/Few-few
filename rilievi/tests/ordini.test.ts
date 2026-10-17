import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PDFDict, PDFDocument, PDFName, type PDFPage } from 'pdf-lib';
import { translatorFor } from '../src/i18n.js';
import {
  ARGANI,
  assertModuli,
  fieldsOf,
  moduloPdf,
  nomeModulo,
  PELAZZA,
  SG,
} from '../src/ordini/moduli.js';
import { renderModulo } from '../src/ordini/pdf.js';
import { prefillValori, rifImpianto } from '../src/ordini/prefill.js';
import { parseModulo, storedValori } from '../src/ordini/valori.js';
import { pdfFontPaths } from '../src/schede/pdf.js';
import { parseScheda } from '../src/schede/validation.js';

const t = translatorFor('it');
const fontDir = process.env.PDF_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);
const A4 = { width: 595.32, height: 841.92 };

/** The distinct objects of a page resource dictionary (Font, XObject): what is drawn on the page. */
function resources(page: PDFPage, kind: 'Font' | 'XObject'): string[] {
  const dict = page.node.Resources()?.lookupMaybe(PDFName.of(kind), PDFDict);
  return dict ? [...new Set(dict.values().map(String))] : [];
}

describe('the supplier forms', () => {
  it('are the exact official PDFs their maps were measured on', () => {
    assert.doesNotThrow(() => assertModuli());
    assert.equal(fieldsOf(PELAZZA).length, 152);
    assert.equal(fieldsOf(ARGANI).length, 36);
    assert.equal(fieldsOf(SG).length, 89);
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

  it('place every box and line of the argano sheet and of the 2SG sheet on the page', () => {
    for (const modulo of [ARGANI, SG]) {
      for (const field of fieldsOf(modulo)) {
        const where = `${modulo.id} ${field.key}`;
        if ('box' in field) {
          const [x0, y0, x1, y1] = field.box;
          assert.ok(x1 - x0 > 5 && x1 - x0 < 14 && y1 - y0 > 4 && y1 - y0 < 18, where);
          assert.ok(x0 > 0 && x1 < A4.width && y0 > 0 && y1 < A4.height, where);
        } else if ('line' in field) {
          const [x0, x1, y] = field.line;
          assert.ok(x1 - x0 >= 25 && x0 > 0 && x1 < A4.width && y > 0 && y < A4.height, where);
        } else if ('area' in field) {
          const [x0, top, x1, bottom] = field.area;
          assert.ok(x0 < x1 && top < bottom && x1 < A4.width && bottom < A4.height, where);
          // The written lines of a box with lines of its own (NOTE of 2SG) are inside it, top down.
          for (const [i, y] of (field.righe ?? []).entries()) {
            assert.ok(y > top && y < bottom && (i === 0 || y > field.righe![i - 1]!), where);
          }
        }
      }
    }
  });

  it('are named with the supplier, or by the title alone when the sheet has none', () => {
    assert.equal(nomeModulo(SG), 'Modulo ordine operatori e sospensioni · 2SG S.r.l.');
    assert.equal(nomeModulo(ARGANI), 'Modulo rilievi dati argani');
    assert.equal(SG.ruota, 180, 'the scanned 2SG sheet is upside down');
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

  it('fills the argano sheet with the address, the plate, the machine room and the ropes', () => {
    assert.deepEqual(
      prefillValori(ARGANI, { ...ctx, values: { ...ctx.values, marca: 'Schindler' } }),
      {
        indirizzo: 'Via Verdi 14, Milano',
        marca: 'Schindler',
        macchina: 'Alto',
        piani: '6',
        portata: '630',
        nImpianto: '104552',
        funiN: '4',
        funiDiametro: '10,5',
      },
    );
  });

  it('fills the 2SG sheet with the sender, the date, the reference and the doors', () => {
    const valori = prefillValori(SG, ctx);
    assert.deepEqual(valori, {
      mittente: 'Ascensori Rossi Srl',
      data: '12/10/2026',
      riferimento: 'N° 104552 — Via Verdi 14, Milano',
      automatico: true,
    });
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

  it('open the argano sheet for every machine, the 2SG sheet with the suspensions to change', () => {
    const argano = { 'pa-_': '1', 'pa-pesoCabina': '650', 'pa-taglia12': 'si' };
    const yes = parseScheda({ ...minimal, arganoPreventivo: 'si', ...argano });
    assert.ok(yes.ok);
    assert.deepEqual(yes.ok && yes.data.preventivoArgano, {
      modulo: ARGANI.id,
      valori: { pesoCabina: '650', taglia12: true },
    });
    const no = parseScheda({ ...minimal, arganoPreventivo: 'no', ...argano });
    assert.equal(no.ok && no.data.preventivoArgano, null);

    // The suspensions are asked with doors on an operator (automatic or semi-automatic).
    const sg = { 'sg-_': '1', 'sg-ordNo': '77', 'sg-sogliaH90': 'si', tipoPorte: 'AUTOMATICHE' };
    const sospensioni = parseScheda({
      ...minimal,
      sospensioni: 'si',
      sospensioniNumero: '6',
      ...sg,
    });
    assert.ok(sospensioni.ok);
    assert.equal(sospensioni.ok && sospensioni.data.sospensioniNumero, 6);
    assert.deepEqual(sospensioni.ok && sospensioni.data.ordineSospensioni, {
      modulo: SG.id,
      valori: { ordNo: '77', sogliaH90: true },
    });
    const none = parseScheda({ ...minimal, sospensioni: 'no', sospensioniNumero: '6', ...sg });
    assert.equal(none.ok && none.data.sospensioniNumero, null, 'the number goes with "si"');
    assert.equal(none.ok && none.data.ordineSospensioni, null);
    const manual = parseScheda({ ...minimal, ...sg, tipoPorte: 'MANUALI', sospensioni: 'si' });
    assert.equal(manual.ok && manual.data.ordineSospensioni, null, 'no 2SG with manual doors');
  });

  it('report the errors of a sheet under its own names', () => {
    const long = parseScheda({
      ...minimal,
      arganoPreventivo: 'si',
      'pa-_': '1',
      'pa-pesoCabina': 'x'.repeat(40),
    });
    assert.equal(long.ok, false);
    assert.equal(!long.ok && long.errors['pa-pesoCabina'], 'tooLong');
  });

  it('never read the old Montanari request as the argano sheet', () => {
    const montanari = {
      modulo: 'montanari-richiesta-preventivo-argani-ita',
      valori: { mrl: true },
    };
    assert.equal(storedValori(ARGANI, montanari), null);
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

  it('write the argano sheet on the converted Word document, one A4 page', async () => {
    const out = await renderModulo(
      ARGANI,
      { indirizzo: 'Via Verdi 14, Milano', taglia12: true, motoreInverter: true, giri: '1440' },
      fontDir,
    );
    const doc = await PDFDocument.load(out);
    assert.equal(doc.getPageCount(), 1);
    const blank = (await PDFDocument.load(moduloPdf(ARGANI))).getPage(0);
    assert.equal(
      resources(doc.getPage(0), 'Font').length,
      resources(blank, 'Font').length + 1,
      'our font is added to the fonts of the Word sheet',
    );
  });

  it('turn the upside-down 2SG scan upright, keep its size and write the notes on its lines', async () => {
    const out = await renderModulo(
      SG,
      { automatico: true, ordNo: '77', note: 'Operatore da sostituire. '.repeat(20) },
      fontDir,
    );
    const doc = await PDFDocument.load(out);
    assert.equal(doc.getPageCount(), 1);
    const page = doc.getPage(0);
    assert.equal(page.getRotation().angle, 0, 'upright on the page, not by a viewer rotation');
    assert.deepEqual(page.getSize(), A4);
    assert.equal(resources(page, 'XObject').length, 1, 'the scan, drawn turned on the new page');
    assert.equal(resources(page, 'Font').length, 1);
  });
});
