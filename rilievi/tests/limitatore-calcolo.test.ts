// The overspeed governor calculation against the owner's workbook "Limitatore_velocita_EN81-20-2020.xlsx"
// (5 November 2026): the 27 cases of its own sheet "Test" (copied here as they are there), then 28 cases
// recalculated in the workbook itself (tests/limitatore-excel.json — every result cell B5–B27 of the
// sheet "Limitatore"), word for word for the texts; then the form: Italian decimals, every field optional
// like in the sheet, an empty form refused, forged choices.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { translatorFor } from '../src/i18n.js';
import {
  arrotonda,
  arrotondaSu,
  calcolaLimitatore,
  type DatiLimitatore,
  type RisultatoLimitatore,
  type TipoParacadute,
} from '../src/limitatore/calcolo.js';
import {
  datiSalvati,
  formDaDati,
  parseDatiLimitatore,
  prefillLimitatore,
} from '../src/limitatore/dati.js';

const t = translatorFor('it');
const VUOTI: DatiLimitatore = {
  vn: null,
  tipo: null,
  v1: null,
  vc: null,
  forzaParacadute: null,
  forzaLimitatore: null,
  mbl: null,
  d: null,
  dp: null,
};
const dati = (parte: Partial<Record<keyof DatiLimitatore, unknown>>) =>
  ({ ...VUOTI, ...parte }) as DatiLimitatore;

/** What the sheet shows for a result: a number, or its text (the dictionary holds the sheet's words). */
function mostrato(v: RisultatoLimitatore[keyof RisultatoLimitatore]): number | string | null {
  if (v === null || typeof v === 'number') return v;
  return t(`limitatore.esito.${v}`);
}

const vicino = (a: unknown, b: number) =>
  typeof a === 'number' && Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-12);

describe('the sheet "Test" of the workbook: 27 cases', () => {
  // Rows 5–20: Vn, type → min (empty = null), max (number or the sheet's text).
  const SOGLIE: Array<[string, unknown, unknown, number | null, number | string]> = [
    ['Progressivo, esempio', 1.6, 'progressivo', 1.84, 2.15625],
    ['Progressivo, Vn = 1 (limite)', 1, 'progressivo', 1.15, 1.5],
    ['Progressivo, Vn bassa', 0.5, 'progressivo', 0.575, 1.5],
    ['Progressivo, appena sopra 1', 1.01, 'progressivo', 1.1615, 1.5100247524752475],
    ['Progressivo, Vn = 2,5', 2.5, 'progressivo', 2.875, 3.225],
    ['Istantaneo, Vn = 0,63 (limite)', 0.63, 'istantaneo', 0.7245, 0.8],
    ['Rulli, Vn = 0,63 (limite)', 0.63, 'rulli', 0.7245, 1],
    ['Istantaneo, Vn = 0,64', 0.64, 'istantaneo', null, 'Non ammesso: Vn>0,63'],
    ['Rulli, Vn = 0,70', 0.7, 'rulli', null, 'Non ammesso: Vn>0,63'],
    ['Istantaneo, Vn = 1,6', 1.6, 'istantaneo', null, 'Non ammesso: Vn>0,63'],
    // The sheet takes any text as the type; here a misspelt one is just as invalid.
    ['Tipo scritto male', 1.6, 'Prograssivo', null, 'Tipo non valido'],
    ['Tipo vuoto', 1.6, null, null, 'Tipo non valido'],
    ['Vn zero', 0, 'progressivo', null, 'Vn non valida'],
    ['Vn negativa', -1, 'progressivo', null, 'Vn non valida'],
    // A number stored as text is not a number for ISNUMBER — nor here.
    ['Vn come testo', '1.6', 'progressivo', null, 'Vn non valida'],
    ['Vn vuota', null, 'progressivo', null, 'Vn non valida'],
  ];
  for (const [caso, vn, tipo, min, max] of SOGLIE) {
    it(caso, () => {
      const r = calcolaLimitatore(dati({ vn, tipo: tipo as TipoParacadute }));
      if (min === null) assert.equal(r.sogliaMin, null);
      else assert.ok(vicino(r.sogliaMin, min), `min ${r.sogliaMin} ≠ ${min}`);
      if (typeof max === 'number') assert.ok(vicino(r.sogliaMax, max), `max ${r.sogliaMax}`);
      else assert.equal(mostrato(r.sogliaMax), max);
    });
  }
  // Rows 23–28: V1 against Vn = 1,6 progressive.
  const V1: Array<[string, number | null, string]> = [
    ['Esattamente al minimo', 1.84, 'Entro i limiti'],
    ['Sotto il minimo', 1.83, 'Fuori limiti'],
    ['Appena sotto il massimo', 2.1562, 'Entro i limiti'],
    ['Appena sopra il massimo', 2.1563, 'Fuori limiti'],
    ['Valore 2,16 del testo originale', 2.16, 'Fuori limiti'],
    ['V1 vuota', null, 'Dato mancante'],
  ];
  for (const [caso, v1, atteso] of V1) {
    it(caso, () => {
      const r = calcolaLimitatore(dati({ vn: 1.6, tipo: 'progressivo', v1 }));
      assert.equal(mostrato(r.esitoV1), atteso);
    });
  }
  // Rows 31–35: the contact.
  const CONTATTO: Array<[string, number, number, number | null, string]> = [
    ['Vn > 1, Vc sotto V1', 1.6, 2.1, 1.9, 'Coerente con V1'],
    ['Vn > 1, Vc uguale a V1', 1.6, 2, 2, 'Fuori limiti'],
    ['Vn = 1, Vc uguale a V1', 1, 1.3, 1.3, 'Coerente con V1'],
    ['Vn ≤ 1, Vc sopra V1', 0.8, 1.2, 1.25, 'Fuori limiti'],
    ['Vc vuota', 1.6, 2.1, null, 'Dato mancante'],
  ];
  for (const [caso, vn, v1, vc, atteso] of CONTATTO) {
    it(caso, () => {
      const r = calcolaLimitatore(dati({ vn, v1, vc }));
      assert.equal(mostrato(r.esitoContatto), atteso);
    });
  }
  it('counts 27 cases, like the summary cell of the sheet', () => {
    assert.equal(SOGLIE.length + V1.length + CONTATTO.length, 27);
  });
});

type Caso = { dati: DatiLimitatore; excel: Record<string, number | string | null> };
const EXCEL = JSON.parse(
  readFileSync(join(import.meta.dirname, 'limitatore-excel.json'), 'utf8'),
) as {
  testDelFoglio: string;
  casi: Record<string, Caso>;
};

describe('every result cell, as recalculated in the workbook', () => {
  it('the workbook passed its own sheet "Test" in that recalculation', () => {
    assert.equal(EXCEL.testDelFoglio, 'OK');
  });
  for (const [nome, caso] of Object.entries(EXCEL.casi)) {
    it(nome, () => {
      const r = calcolaLimitatore(caso.dati);
      for (const [chiave, atteso] of Object.entries(caso.excel)) {
        const campo = chiave.split(' ')[1] as keyof RisultatoLimitatore;
        const valore = mostrato(r[campo]);
        if (typeof atteso === 'number')
          assert.ok(vicino(valore, atteso), `${chiave}: ${valore} ≠ ${atteso}`);
        else assert.equal(valore, atteso, chiave);
      }
    });
  }
});

describe('the rounding of the sheet', () => {
  it('ROUND and ROUNDUP like the spreadsheet, on 15 significant digits', () => {
    assert.equal(arrotonda(1.005, 2), 1.01);
    assert.equal(arrotonda(2.16 - 0.01, 2), 2.15);
    assert.equal(arrotondaSu(1.6 * 1.15, 2), 1.84);
    assert.equal(arrotondaSu(0.3 * 1.15, 2), 0.35);
    assert.equal(arrotondaSu(2.15625, 2), 2.16);
  });
});

describe('the form', () => {
  it('reads Italian decimals and keeps every empty field as missing', () => {
    const { dati: d, errori } = parseDatiLimitatore({
      vn: '1,6',
      tipo: 'progressivo',
      v1: '2.1',
      d: '',
    });
    assert.deepEqual(errori, {});
    assert.deepEqual(d, { ...VUOTI, vn: 1.6, tipo: 'progressivo', v1: 2.1 });
    assert.deepEqual(formDaDati(d!), { vn: '1,6', tipo: 'progressivo', v1: '2,1' });
  });

  it('refuses an empty form, words, negative numbers, out-of-range values and a forged type', () => {
    assert.deepEqual(parseDatiLimitatore({ tipo: '' }).errori, { _: 'vuoto' });
    assert.deepEqual(parseDatiLimitatore({ vn: 'uno' }).errori, { vn: 'decimal' });
    assert.deepEqual(parseDatiLimitatore({ vn: '-1' }).errori, { vn: 'decimal' });
    assert.deepEqual(parseDatiLimitatore({ vn: '25' }).errori, { vn: 'range' });
    assert.deepEqual(parseDatiLimitatore({ vn: '1', tipo: 'paracadute' }).errori, {
      tipo: 'option',
    });
    assert.deepEqual(parseDatiLimitatore({ vn: ['1', '2'] }).errori, { vn: 'decimal' });
  });

  it('reads the stored JSON with distrust', () => {
    assert.deepEqual(datiSalvati({ ...VUOTI, vn: 1 }), { ...VUOTI, vn: 1 });
    assert.equal(datiSalvati({ ...VUOTI }), null);
    assert.equal(datiSalvati({ ...VUOTI, vn: '1.6' }), null);
    assert.equal(datiSalvati({ ...VUOTI, vn: 1, extra: true }), null);
    assert.equal(datiSalvati(null), null);
  });

  it('proposes Vn from the lift machine module and d from the governor section of the scheda', () => {
    assert.deepEqual(prefillLimitatore({ velocita: '1,6 m/s' }, { toString: () => '6.5' }), {
      vn: '1,6',
      d: '6,5',
    });
    assert.deepEqual(prefillLimitatore(null, null), {});
    assert.deepEqual(prefillLimitatore({ velocita: 'veloce' }, { toString: () => '0' }), {});
  });
});
