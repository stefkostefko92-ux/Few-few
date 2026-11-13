// The overspeed governor calculation against the owner's workbook "Limitatore_velocita_EN81-20-2020.xlsx",
// reduced on 7 November 2026 to what the owner asked for ("solo la velocità dell'impianto e il tipo di
// paracadute, da lì il risultato"): the 16 threshold cases of the sheet "Test" (copied as they are there)
// and the cells B5, B6, B9, B10 and B13 of 28 cases recalculated in the workbook itself
// (tests/limitatore-excel.json); the progressive formula of UNI EN 81-20:2020, 5.6.2.2.1.1 a) 4)
// (1,25·v + 0,25/v) on its own; the form. The limits by the standard of the lift and by what else is changed,
// and the result in words — tests/limitatore-norme.test.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  arrotonda,
  arrotondaSu,
  calcolaLimitatore,
  type DatiLimitatore,
  type RisultatoLimitatore,
} from '../src/limitatore/calcolo.js';
import {
  datiSalvati,
  formDaDati,
  parseDatiLimitatore,
  prefillLimitatore,
} from '../src/limitatore/dati.js';

// The sheet takes any cell content; the calculation guards the same way (a number stored as text, a
// misspelt or missing type), so the cases go in as they are.
const dati = (vn: unknown, tipo: unknown) => ({ vn, tipo }) as DatiLimitatore;

/** The words of the sheet for the results that are not numbers. */
const FOGLIO: Record<string, string> = {
  'Vn non valida': 'vnNonValida',
  'Non ammesso: Vn>0,63': 'nonAmmesso',
  'Tipo non valido': 'tipoNonValido',
  'Prima di V1': 'prima',
  'Al più tardi a V1': 'alPiuTardi',
};

const vicino = (a: unknown, b: number) =>
  typeof a === 'number' && Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-12);

describe('the sheet "Test" of the workbook: the 16 threshold cases', () => {
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
    ['Tipo scritto male', 1.6, 'Prograssivo', null, 'Tipo non valido'],
    ['Tipo vuoto', 1.6, null, null, 'Tipo non valido'],
    ['Vn zero', 0, 'progressivo', null, 'Vn non valida'],
    ['Vn negativa', -1, 'progressivo', null, 'Vn non valida'],
    ['Vn come testo', '1.6', 'progressivo', null, 'Vn non valida'],
    ['Vn vuota', null, 'progressivo', null, 'Vn non valida'],
  ];
  for (const [caso, vn, tipo, min, max] of SOGLIE) {
    it(caso, () => {
      const r = calcolaLimitatore(dati(vn, tipo));
      if (min === null) assert.equal(r.sogliaMin, null);
      else assert.ok(vicino(r.sogliaMin, min), `min ${r.sogliaMin} ≠ ${min}`);
      if (typeof max === 'number') assert.ok(vicino(r.sogliaMax, max), `max ${r.sogliaMax}`);
      else assert.equal(r.sogliaMax, FOGLIO[max]);
    });
  }
});

type Caso = { dati: { vn: unknown; tipo: unknown }; excel: Record<string, number | string | null> };
const EXCEL = JSON.parse(
  readFileSync(join(import.meta.dirname, 'limitatore-excel.json'), 'utf8'),
) as {
  testDelFoglio: string;
  casi: Record<string, Caso>;
};
/** The cells of the sheet the calculation still gives. */
const CELLE = ['B5', 'B6', 'B9', 'B10', 'B13'];

describe('the cells B5, B6, B9, B10 and B13, as recalculated in the workbook', () => {
  it('the workbook passed its own sheet "Test" in that recalculation', () => {
    assert.equal(EXCEL.testDelFoglio, 'OK');
  });
  for (const [nome, caso] of Object.entries(EXCEL.casi)) {
    it(nome, () => {
      const r = calcolaLimitatore(dati(caso.dati.vn, caso.dati.tipo));
      for (const [chiave, atteso] of Object.entries(caso.excel)) {
        const [cella, campo] = chiave.replace('Limitatore!', '').split(' ') as [
          string,
          keyof RisultatoLimitatore,
        ];
        if (!CELLE.includes(cella)) continue;
        const valore = r[campo];
        if (typeof atteso === 'number')
          assert.ok(vicino(valore, atteso), `${chiave}: ${valore} ≠ ${atteso}`);
        else if (atteso === null) assert.equal(valore, null, chiave);
        else assert.equal(valore, FOGLIO[atteso], chiave);
      }
    });
  }
});

describe('the progressive safety gear above 1 m/s', () => {
  it('stops V1 below 1,25·v + 0,25/v (UNI EN 81-20:2020, 5.6.2.2.1.1 a) 4))', () => {
    for (let i = 101; i <= 1000; i += 1) {
      const v = i / 100;
      const r = calcolaLimitatore({
        vn: v,
        tipo: 'progressivo',
        norma: 'en81-20-2020',
        intervento: 'limitatore',
      });
      assert.ok(vicino(r.sogliaMax, 1.25 * v + 0.25 / v), `Vn ${v}: ${r.sogliaMax}`);
    }
  });
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
  it('asks the speed, the type, the standard and what else is changed, reads Italian decimals', () => {
    const { dati: d, errori } = parseDatiLimitatore({
      vn: '1,6',
      tipo: 'progressivo',
      norma: 'en81-1-1987',
      intervento: 'paracadute',
      v1: '9',
    });
    assert.deepEqual(errori, {});
    assert.deepEqual(d, {
      vn: 1.6,
      tipo: 'progressivo',
      norma: 'en81-1-1987',
      intervento: 'paracadute',
    });
    assert.deepEqual(formDaDati(d!), {
      vn: '1,6',
      tipo: 'progressivo',
      norma: 'en81-1-1987',
      intervento: 'paracadute',
    });
  });

  it('refuses a missing value, words, negative or zero speed, out of range and a forged type', () => {
    assert.deepEqual(parseDatiLimitatore({ tipo: '' }).errori, {
      vn: 'required',
      tipo: 'required',
      norma: 'required',
      intervento: 'required',
    });
    const ok = { vn: '1', tipo: 'rulli', norma: 'en81-20-2020', intervento: 'limitatore' };
    assert.deepEqual(parseDatiLimitatore({ ...ok, norma: 'en81-80' }).errori, { norma: 'option' });
    assert.deepEqual(parseDatiLimitatore({ ...ok, intervento: 'quadro' }).errori, {
      intervento: 'option',
    });
    assert.deepEqual(
      parseDatiLimitatore({
        vn: 'uno',
        tipo: 'rulli',
        norma: 'en81-20-2020',
        intervento: 'limitatore',
      }).errori,
      { vn: 'decimal' },
    );
    assert.deepEqual(
      parseDatiLimitatore({
        vn: '-1',
        tipo: 'rulli',
        norma: 'en81-20-2020',
        intervento: 'limitatore',
      }).errori,
      { vn: 'decimal' },
    );
    assert.deepEqual(
      parseDatiLimitatore({
        vn: '0',
        tipo: 'rulli',
        norma: 'en81-20-2020',
        intervento: 'limitatore',
      }).errori,
      { vn: 'range' },
    );
    assert.deepEqual(
      parseDatiLimitatore({
        vn: '25',
        tipo: 'rulli',
        norma: 'en81-20-2020',
        intervento: 'limitatore',
      }).errori,
      { vn: 'range' },
    );
    assert.deepEqual(
      parseDatiLimitatore({
        vn: '1',
        tipo: 'paracadute',
        norma: 'en81-20-2020',
        intervento: 'limitatore',
      }).errori,
      {
        tipo: 'option',
      },
    );
    assert.deepEqual(
      parseDatiLimitatore({
        vn: ['1', '2'],
        tipo: 'rulli',
        norma: 'en81-20-2020',
        intervento: 'limitatore',
      }).errori,
      {
        vn: 'decimal',
      },
    );
  });

  it('reads the stored JSON with distrust; an older record keeps its speed and type', () => {
    assert.deepEqual(
      datiSalvati({ vn: 1, tipo: 'rulli', norma: 'en81-1-1999', intervento: 'velocita' }),
      { vn: 1, tipo: 'rulli', norma: 'en81-1-1999', intervento: 'velocita' },
    );
    // Saved before the standard was asked: it was always UNI EN 81-20:2020; before "what else is changed":
    // the governor alone (UNI 10411-1:2024, 18).
    assert.deepEqual(datiSalvati({ vn: 1.6, tipo: 'progressivo', v1: 2.1, mbl: null }), {
      vn: 1.6,
      tipo: 'progressivo',
      norma: 'en81-20-2020',
      intervento: 'limitatore',
    });
    assert.deepEqual(datiSalvati({ vn: 1, tipo: 'rulli', norma: 'dpr-1497-1963' }), {
      vn: 1,
      tipo: 'rulli',
      norma: 'dpr-1497-1963',
      intervento: 'limitatore',
    });
    assert.equal(datiSalvati({ vn: 1, tipo: 'rulli', intervento: 'quadro' }), null);
    assert.equal(datiSalvati({ vn: 1, tipo: 'rulli', norma: 'en81-80' }), null);
    assert.equal(datiSalvati({ vn: 1, tipo: null }), null);
    assert.equal(datiSalvati({ vn: '1.6', tipo: 'rulli' }), null);
    assert.equal(datiSalvati(null), null);
  });

  it('proposes the speed from the lift machine module of the scheda', () => {
    assert.deepEqual(prefillLimitatore({ velocita: '1,6 m/s' }), { vn: '1,6' });
    assert.deepEqual(prefillLimitatore(null), {});
    assert.deepEqual(prefillLimitatore({ velocita: 'veloce' }), {});
  });
});
