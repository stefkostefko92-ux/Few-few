// The overspeed governor calculation against the owner's workbook "Limitatore_velocita_EN81-20-2020.xlsx",
// reduced on 7 November 2026 to what the owner asked for ("solo la velocità dell'impianto e il tipo di
// paracadute, da lì il risultato"): the 16 threshold cases of the sheet "Test" (copied as they are there)
// and the cells B5, B6, B9, B10 and B13 of 28 cases recalculated in the workbook itself
// (tests/limitatore-excel.json); the progressive formula of UNI EN 81-20:2020, 5.6.2.2.1.1 a) 4)
// (1,25·v + 0,25/v) on its own; the limits of the standard in force when the lift was installed (UNI
// 10411-1:2024, 18 — the owner, 8 November 2026: UNI EN 81-20:2020, UNI EN 81-1:1999/2008 and :1987, D.P.R.
// 1497/1963 art. 32 as the owner gave it, no values for D.Lgt. 600/1945); the short result in words; the form.
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
} from '../src/limitatore/calcolo.js';
import {
  datiSalvati,
  formDaDati,
  parseDatiLimitatore,
  prefillLimitatore,
} from '../src/limitatore/dati.js';
import { sintesiLimitatore } from '../src/limitatore/righe.js';

const t = translatorFor('it');
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
      const r = calcolaLimitatore({ vn: v, tipo: 'progressivo', norma: 'en81-20-2020' });
      assert.ok(vicino(r.sogliaMax, 1.25 * v + 0.25 / v), `Vn ${v}: ${r.sogliaMax}`);
    }
  });
});

describe('the standard in force when the lift was installed', () => {
  const r = (vn: number, tipo: DatiLimitatore['tipo'], norma: DatiLimitatore['norma']) =>
    calcolaLimitatore({ vn, tipo, norma });

  it('gives the same limits for progressive, instantaneous and roller gear under every EN 81', () => {
    for (const norma of ['en81-20-2020', 'en81-1-1999', 'en81-1-1987'] as const) {
      assert.equal(r(0.63, 'istantaneo', norma).sogliaMax, 0.8, norma);
      assert.equal(r(0.63, 'rulli', norma).sogliaMax, 1, norma);
      assert.equal(r(0.64, 'istantaneo', norma).sogliaMax, 'nonAmmesso', norma);
      assert.equal(r(1, 'progressivo', norma).sogliaMax, 1.5, norma);
      assert.ok(vicino(r(1.6, 'progressivo', norma).sogliaMax, 2.15625), norma);
    }
  });

  it('allows the buffered instantaneous gear only under EN 81-1, up to 1 m/s, V1 below 1,5 m/s', () => {
    for (const norma of ['en81-1-1999', 'en81-1-1987'] as const) {
      const lenta = r(1, 'ammortizzato', norma);
      assert.equal(lenta.sogliaMax, 1.5);
      assert.equal(lenta.min2, 1.15);
      assert.equal(lenta.max2, 1.49);
      assert.equal(r(1.01, 'ammortizzato', norma).sogliaMax, 'nonAmmessoAmmortizzato');
    }
    assert.equal(r(0.8, 'ammortizzato', 'en81-20-2020').sogliaMax, 'tipoNonPrevisto');
  });

  it('times the contact by the edition: EN 81-1:1987 also caps it at 115 % of Vn for VVVF', () => {
    assert.equal(r(1.6, 'progressivo', 'en81-1-1987').momento, 'prima');
    const lenta = r(0.8, 'progressivo', 'en81-1-1987');
    assert.equal(lenta.momento, 'alPiuTardi1987');
    assert.ok(vicino(lenta.contatto115, 0.92));
    assert.equal(r(0.8, 'progressivo', 'en81-1-1999').momento, 'alPiuTardi');
    assert.equal(r(0.8, 'progressivo', 'en81-1-1999').contatto115, null);
  });

  it('D.P.R. 1497/1963, art. 32: from 0,6 to 1,5 m/s, V1 not above 140 % of Vn, no lower limit', () => {
    for (const [vn, max, max2] of [
      [0.6, 0.84, 0.84],
      [0.63, 0.882, 0.88],
      [1, 1.4, 1.4],
      [1.5, 2.1, 2.1],
    ] as const) {
      for (const tipo of ['progressivo', 'istantaneo', 'rulli', 'ammortizzato'] as const) {
        const x = r(vn, tipo, 'dpr-1497-1963');
        assert.ok(vicino(x.sogliaMax, max), `${vn} ${tipo}: ${x.sogliaMax}`);
        assert.equal(x.maxIncluso, true);
        assert.equal(x.max2, max2, `${vn} ${tipo}`);
        assert.equal(x.sogliaMin, null);
        assert.equal(x.min2, null);
        assert.equal(x.momento, null, 'no rule for the contact was given');
      }
    }
    assert.equal(r(0.59, 'progressivo', 'dpr-1497-1963').sogliaMax, 'fuoriCampoDpr');
    assert.equal(r(1.51, 'progressivo', 'dpr-1497-1963').sogliaMax, 'fuoriCampoDpr');
  });

  it('has no values for D.Lgt. 600/1945 and says so', () => {
    const vecchio = r(0.5, 'istantaneo', 'dlgt-600-1945');
    assert.equal(vecchio.sogliaMax, 'normaNonDisponibile');
    assert.equal(vecchio.sogliaMin, null);
    assert.equal(vecchio.max2, null);
  });

  it('never leaves an instantaneous gear without a possible V1', () => {
    // 0,63 · 1,15 = 0,7245 < 0,80: up to the speed where it is allowed there is always a window.
    for (let i = 1; i <= 63; i += 1) {
      const x = r(i / 100, 'istantaneo', 'en81-20-2020');
      assert.ok(x.min2 !== null && x.max2 !== null && x.min2 <= x.max2, `Vn ${i / 100}`);
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

describe('the result in words', () => {
  it('gives the V1 to set, the limit of the norm and the contact', () => {
    const d: DatiLimitatore = { vn: 1.6, tipo: 'progressivo', norma: 'en81-20-2020' };
    assert.deepEqual(sintesiLimitatore(d, calcolaLimitatore(d), t), {
      vn: '1,6 m/s',
      tipo: 'Progressivo',
      norma: 'UNI EN 81-20:2020',
      v1: 'da 1,84 a 2,15 m/s',
      limite: 'da 1,84 m/s (incluso) a 2,15625 m/s (escluso)',
      contatto: 'Prima di V1',
      motivo: null,
    });
    const lenta: DatiLimitatore = { vn: 0.63, tipo: 'rulli', norma: 'en81-20-2020' };
    const r = sintesiLimitatore(lenta, calcolaLimitatore(lenta), t);
    assert.equal(r.v1, 'da 0,73 a 0,99 m/s');
    assert.equal(r.contatto, 'Al più tardi a V1');
    const vvvf: DatiLimitatore = { vn: 0.8, tipo: 'ammortizzato', norma: 'en81-1-1987' };
    const s = sintesiLimitatore(vvvf, calcolaLimitatore(vvvf), t);
    assert.equal(s.v1, 'da 0,92 a 1,49 m/s');
    assert.equal(
      s.contatto,
      'Al più tardi a V1; con tensione variabile o VVVF al più tardi a 0,92 m/s (115 % di Vn)',
    );
  });

  it('gives only the upper limit under D.P.R. 1497/1963, included, and no contact', () => {
    const d: DatiLimitatore = { vn: 1, tipo: 'istantaneo', norma: 'dpr-1497-1963' };
    assert.deepEqual(sintesiLimitatore(d, calcolaLimitatore(d), t), {
      vn: '1 m/s',
      tipo: 'Istantaneo',
      norma: 'D.P.R. 1497/1963, art. 32',
      v1: 'fino a 1,40 m/s',
      limite: 'fino a 1,4 m/s (140 % di Vn, incluso)',
      contatto: null,
      motivo: null,
    });
  });

  it('says only why, when the type is not allowed at that speed', () => {
    const d: DatiLimitatore = { vn: 1, tipo: 'istantaneo', norma: 'en81-20-2020' };
    const s = sintesiLimitatore(d, calcolaLimitatore(d), t);
    assert.equal(s.v1, null);
    assert.equal(s.limite, null);
    assert.equal(s.contatto, null);
    assert.match(s.motivo ?? '', /solo con velocità nominale fino a 0,63 m\/s/);
    const vecchio: DatiLimitatore = { vn: 0.5, tipo: 'progressivo', norma: 'dlgt-600-1945' };
    assert.match(
      sintesiLimitatore(vecchio, calcolaLimitatore(vecchio), t).motivo ?? '',
      /D\.Lgt\. 600\/1945 non sono nelle nostre norme/,
    );
    const lenta: DatiLimitatore = { vn: 0.5, tipo: 'progressivo', norma: 'dpr-1497-1963' };
    assert.match(
      sintesiLimitatore(lenta, calcolaLimitatore(lenta), t).motivo ?? '',
      /art\. 32 fissa il limite solo per velocità nominali da 0,6 a 1,5 m\/s/,
    );
  });
});

describe('the form', () => {
  it('asks the speed, the type and the standard, reads Italian decimals', () => {
    const { dati: d, errori } = parseDatiLimitatore({
      vn: '1,6',
      tipo: 'progressivo',
      norma: 'en81-1-1987',
      v1: '9',
    });
    assert.deepEqual(errori, {});
    assert.deepEqual(d, { vn: 1.6, tipo: 'progressivo', norma: 'en81-1-1987' });
    assert.deepEqual(formDaDati(d!), { vn: '1,6', tipo: 'progressivo', norma: 'en81-1-1987' });
  });

  it('refuses a missing value, words, negative or zero speed, out of range and a forged type', () => {
    assert.deepEqual(parseDatiLimitatore({ tipo: '' }).errori, {
      vn: 'required',
      tipo: 'required',
      norma: 'required',
    });
    assert.deepEqual(parseDatiLimitatore({ vn: '1', tipo: 'rulli', norma: 'en81-80' }).errori, {
      norma: 'option',
    });
    assert.deepEqual(
      parseDatiLimitatore({ vn: 'uno', tipo: 'rulli', norma: 'en81-20-2020' }).errori,
      { vn: 'decimal' },
    );
    assert.deepEqual(
      parseDatiLimitatore({ vn: '-1', tipo: 'rulli', norma: 'en81-20-2020' }).errori,
      { vn: 'decimal' },
    );
    assert.deepEqual(
      parseDatiLimitatore({ vn: '0', tipo: 'rulli', norma: 'en81-20-2020' }).errori,
      { vn: 'range' },
    );
    assert.deepEqual(
      parseDatiLimitatore({ vn: '25', tipo: 'rulli', norma: 'en81-20-2020' }).errori,
      { vn: 'range' },
    );
    assert.deepEqual(
      parseDatiLimitatore({ vn: '1', tipo: 'paracadute', norma: 'en81-20-2020' }).errori,
      {
        tipo: 'option',
      },
    );
    assert.deepEqual(
      parseDatiLimitatore({ vn: ['1', '2'], tipo: 'rulli', norma: 'en81-20-2020' }).errori,
      {
        vn: 'decimal',
      },
    );
  });

  it('reads the stored JSON with distrust; an older record keeps its speed and type', () => {
    assert.deepEqual(datiSalvati({ vn: 1, tipo: 'rulli', norma: 'en81-1-1999' }), {
      vn: 1,
      tipo: 'rulli',
      norma: 'en81-1-1999',
    });
    // Saved before the standard was asked: it was always UNI EN 81-20:2020.
    assert.deepEqual(datiSalvati({ vn: 1.6, tipo: 'progressivo', v1: 2.1, mbl: null }), {
      vn: 1.6,
      tipo: 'progressivo',
      norma: 'en81-20-2020',
    });
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
