// The governor of a lift tested under D.P.R. 1497/1963 when only the governor is replaced (UNI 10411-1:2024,
// 18: the limits of the rules in force when the lift was installed), with the values of the ANACAM
// "Quaderno normativo" (2017) the owner gave on 9 November 2026 (../norme-ascensori/
// anacam-quaderno-dpr1497-en8120-parte1.md): art. 32.2 — V up to 0,60 m/s: V1 below 0,85 m/s; above,
// at most +40 % up to 1,50 m/s, +33 % up to 2,50 m/s, +25 % beyond, no lower limit (:258–:262); art. 32.3 —
// above 0,85 m/s only progressive safety gear, above 0,50 m/s for a category A bed lift (:238); V is the
// operating speed (art. 3, :245).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { translatorFor } from '../src/i18n.js';
import {
  calcolaLimitatore,
  TIPI_PARACADUTE,
  type DatiLimitatore,
} from '../src/limitatore/calcolo.js';
import { sintesiLimitatore } from '../src/limitatore/righe.js';

const t = translatorFor('it');
const vicino = (a: unknown, b: number) =>
  typeof a === 'number' && Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-12);
const dpr = (
  vn: number,
  tipo: DatiLimitatore['tipo'] = 'progressivo',
  intervento: DatiLimitatore['intervento'] = 'limitatore',
): DatiLimitatore => ({ vn, tipo, norma: 'dpr-1497-1963', intervento });
const r = (vn: number, tipo?: DatiLimitatore['tipo']) => calcolaLimitatore(dpr(vn, tipo));
const sintesi = (d: DatiLimitatore) => sintesiLimitatore(d, calcolaLimitatore(d), t);

describe('D.P.R. 1497/1963, art. 32.2: the trip speed by the operating speed', () => {
  it('up to 0,60 m/s: below 0,85 m/s, excluded', () => {
    for (const vn of [0.05, 0.3, 0.6]) {
      const x = r(vn);
      assert.equal(x.sogliaMax, 0.85, `${vn}`);
      assert.equal(x.maxIncluso, false);
      assert.equal(x.aumento, null);
      assert.equal(x.max2, 0.84);
    }
  });

  it('above 0,60 m/s: at most +40 %, +33 % above 1,50 m/s, +25 % above 2,50 m/s, included', () => {
    for (const [vn, aumento, max, max2] of [
      [0.61, 40, 0.854, 0.85],
      [0.82, 40, 1.148, 1.14],
      [1, 40, 1.4, 1.4],
      [1.5, 40, 2.1, 2.1],
      [1.51, 33, 2.0083, 2],
      [2, 33, 2.66, 2.66],
      [2.5, 33, 3.325, 3.32],
      [2.51, 25, 3.1375, 3.13],
      [4, 25, 5, 5],
    ] as const) {
      const x = r(vn);
      assert.ok(vicino(x.sogliaMax, max), `${vn}: ${x.sogliaMax}`);
      assert.equal(x.maxIncluso, true);
      assert.equal(x.aumento, aumento, `${vn}`);
      assert.equal(x.max2, max2, `${vn}`);
    }
  });

  it('gives no lower limit', () => {
    for (const vn of [0.3, 0.82, 2, 4]) {
      assert.equal(r(vn).sogliaMin, null);
      assert.equal(r(vn).min2, null);
    }
  });
});

describe('D.P.R. 1497/1963, art. 32.3: the kind of safety gear', () => {
  it('allows every instantaneous gear up to 0,85 m/s, only the progressive one above', () => {
    for (const tipo of ['istantaneo', 'rulli', 'ammortizzato'] as const) {
      const lenta = r(0.85, tipo);
      assert.ok(vicino(lenta.sogliaMax, 1.19), tipo);
      assert.equal(lenta.max2, 1.19);
      assert.equal(r(0.86, tipo).sogliaMax, 'nonAmmessoDpr', tipo);
      assert.equal(r(0.6, tipo).sogliaMax, 0.85, tipo);
    }
    assert.ok(vicino(r(0.86, 'progressivo').sogliaMax, 1.204));
  });

  it('refuses a type it does not know', () => {
    assert.equal(r(0.82, 'paracadute' as DatiLimitatore['tipo']).sogliaMax, 'tipoNonValido');
  });

  it('warns about the category A bed lift with an instantaneous gear above 0,50 m/s', () => {
    const avviso = /montalettighe di categoria A, sopra 0,50 m\/s/;
    assert.match(sintesi(dpr(0.51, 'istantaneo')).avviso ?? '', avviso);
    assert.match(sintesi(dpr(0.85, 'ammortizzato')).avviso ?? '', avviso);
    assert.equal(sintesi(dpr(0.5, 'rulli')).avviso, null);
    assert.equal(sintesi(dpr(0.82, 'progressivo')).avviso, null);
    assert.equal(sintesi(dpr(1, 'istantaneo')).avviso, null, 'not allowed at all: only why');
  });
});

describe('the result in words under D.P.R. 1497/1963', () => {
  it("the owner's case: 0,82 m/s, instantaneous roller gear, only the governor is new", () => {
    assert.deepEqual(sintesi(dpr(0.82, 'rulli')), {
      vn: '0,82 m/s',
      tipo: 'Istantaneo a rulli',
      norma: 'D.P.R. 1497/1963, art. 32',
      intervento: 'Solo il limitatore',
      applicata: 'D.P.R. 1497/1963, art. 32 — UNI 10411-1:2024, punto 18',
      v1: 'fino a 1,14 m/s',
      limite: 'fino a 1,148 m/s (140 % della velocità di esercizio, incluso)',
      contatto: 'Al più tardi a V1',
      avviso:
        'Se è un montalettighe di categoria A, sopra 0,50 m/s il D.P.R. 1497/1963 vuole il paracadute progressivo.',
      motivo: null,
    });
  });

  it('says "below 0,85 m/s" up to 0,60 m/s and the percentage above', () => {
    const lenta = sintesi(dpr(0.5));
    assert.equal(lenta.v1, 'fino a 0,84 m/s');
    assert.equal(lenta.limite, 'sotto 0,85 m/s (escluso)');
    const veloce = sintesi(dpr(2));
    assert.equal(veloce.v1, 'fino a 2,66 m/s');
    assert.equal(veloce.limite, 'fino a 2,66 m/s (133 % della velocità di esercizio, incluso)');
    assert.equal(veloce.contatto, 'Prima di V1');
    assert.equal(
      sintesi(dpr(3)).limite,
      'fino a 3,75 m/s (125 % della velocità di esercizio, incluso)',
    );
  });

  it('says only why when the instantaneous gear is above 0,85 m/s', () => {
    const s = sintesi(dpr(1, 'istantaneo'));
    assert.equal(s.v1, null);
    assert.equal(s.contatto, null);
    assert.match(
      s.motivo ?? '',
      /D\.P\.R\. 1497\/1963 il paracadute istantaneo è ammesso solo fino a 0,85 m\/s/,
    );
  });

  it('a new safety gear or a speed raised over 5 %: UNI EN 81-20:2020, not the D.P.R.', () => {
    for (const intervento of ['paracadute', 'velocita'] as const) {
      const s = sintesi(dpr(0.82, 'rulli', intervento));
      assert.match(s.motivo ?? '', /fino a 0,63 m\/s/);
      assert.equal(s.avviso, null);
      assert.equal(sintesi(dpr(0.82, 'progressivo', intervento)).v1, 'da 0,95 a 1,49 m/s');
    }
  });

  it('knows every type of the form', () => {
    for (const tipo of TIPI_PARACADUTE) assert.notEqual(r(0.7, tipo).sogliaMax, 'tipoNonValido');
  });
});
