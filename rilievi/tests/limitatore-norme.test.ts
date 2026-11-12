// The limits of the governor calculation by the standard in force when the lift was installed and by what
// else is changed with the governor — every replacement clause of our norm notes (../norme-ascensori; the
// owner, 7 November 2026: UNI 10411-1:2024, 18, then "check every norm file for the replacement"):
// - lifts before UNI EN 81-1:1999, UNI 10411-1:2024: the governor alone — the standard of the lift (18;
//   D.P.R. 1497/1963 — tests/limitatore-dpr.test.ts, no values for D.Lgt. 600/1945); with a new safety gear
//   (6.7) or the rated speed raised by more than 5 % (15.1, 15.13) — UNI EN 81-20:2020;
// - CE lifts, UNI 10411-11:2024 (18, 6.7, 15 f)): the standard of the lift;
// - the electric contact of a new governor — always UNI EN 81-20:2020, 5.6.2.2.1.6 a);
// and the short result in words, with the standard and the clause the limits come from.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { translatorFor } from '../src/i18n.js';
import {
  calcolaLimitatore,
  INTERVENTI,
  NORME_IMPIANTO,
  normaDeiLimiti,
  type DatiLimitatore,
} from '../src/limitatore/calcolo.js';
import { sintesiLimitatore } from '../src/limitatore/righe.js';

const t = translatorFor('it');
const vicino = (a: unknown, b: number) =>
  typeof a === 'number' && Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-12);
const r = (
  vn: number,
  tipo: DatiLimitatore['tipo'],
  norma: DatiLimitatore['norma'],
  intervento: DatiLimitatore['intervento'] = 'limitatore',
) => calcolaLimitatore({ vn, tipo, norma, intervento });
const PRIMA_CE = ['en81-1-1987', 'dpr-1497-1963', 'dlgt-600-1945'] as const;
const CE = ['en81-20-2020', 'en81-1-1999'] as const;

describe('only the governor is new: the standard in force when the lift was installed', () => {
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

describe('what else is changed with the governor', () => {
  it('takes UNI EN 81-20:2020 before CE with a new safety gear or a higher speed, else the lift standard', () => {
    for (const norma of NORME_IMPIANTO)
      for (const intervento of INTERVENTI) {
        const atteso =
          (PRIMA_CE as readonly string[]).includes(norma) && intervento !== 'limitatore'
            ? 'en81-20-2020'
            : norma;
        assert.equal(normaDeiLimiti({ norma, intervento }), atteso, `${norma} ${intervento}`);
      }
  });

  it('a new safety gear or a speed raised over 5 % before CE: the limits of UNI EN 81-20:2020', () => {
    for (const norma of PRIMA_CE)
      for (const intervento of ['paracadute', 'velocita'] as const) {
        const x = r(1, 'progressivo', norma, intervento);
        assert.equal(x.sogliaMax, 1.5, `${norma} ${intervento}`);
        assert.equal(x.min2, 1.15);
        assert.equal(x.max2, 1.49);
        assert.equal(x.maxIncluso, false);
        assert.ok(vicino(r(1.6, 'progressivo', norma, intervento).sogliaMax, 2.15625));
        assert.equal(r(0.63, 'istantaneo', norma, intervento).sogliaMax, 0.8);
        assert.equal(r(0.64, 'istantaneo', norma, intervento).sogliaMax, 'nonAmmesso');
        assert.equal(r(0.8, 'ammortizzato', norma, intervento).sogliaMax, 'tipoNonPrevisto');
      }
  });

  it('a CE lift keeps the limits of its own standard whatever else is changed', () => {
    for (const intervento of INTERVENTI) {
      assert.equal(r(0.8, 'ammortizzato', 'en81-1-1999', intervento).sogliaMax, 1.5);
      assert.equal(r(0.8, 'ammortizzato', 'en81-20-2020', intervento).sogliaMax, 'tipoNonPrevisto');
    }
  });

  it('times the contact of a new governor by UNI EN 81-20:2020 under every standard', () => {
    for (const norma of NORME_IMPIANTO)
      for (const intervento of INTERVENTI) {
        assert.equal(r(1.6, 'progressivo', norma, intervento).momento, 'prima');
        assert.equal(r(1, 'progressivo', norma, intervento).momento, 'alPiuTardi');
        assert.equal(r(0.8, 'progressivo', norma, intervento).momento, 'alPiuTardi');
      }
  });

  it('covers both groups of lifts', () => {
    assert.deepEqual([...PRIMA_CE, ...CE].sort(), [...NORME_IMPIANTO].sort());
  });
});

describe('the result in words', () => {
  const sintesi = (d: DatiLimitatore) => sintesiLimitatore(d, calcolaLimitatore(d), t);

  it('gives the V1 to set, the limit, the contact and where the limits come from', () => {
    assert.deepEqual(
      sintesi({ vn: 1.6, tipo: 'progressivo', norma: 'en81-20-2020', intervento: 'limitatore' }),
      {
        vn: '1,6 m/s',
        tipo: 'Progressivo',
        norma: 'UNI EN 81-20:2020',
        intervento: 'Solo il limitatore',
        applicata: 'UNI EN 81-20:2020 — UNI 10411-11:2024, punto 18',
        v1: 'da 1,84 a 2,15 m/s',
        limite: 'da 1,84 m/s (incluso) a 2,15625 m/s (escluso)',
        contatto: 'Prima di V1',
        avviso: null,
        motivo: null,
      },
    );
    const lenta = sintesi({
      vn: 0.63,
      tipo: 'rulli',
      norma: 'en81-20-2020',
      intervento: 'limitatore',
    });
    assert.equal(lenta.v1, 'da 0,73 a 0,99 m/s');
    assert.equal(lenta.contatto, 'Al più tardi a V1');
    const vecchia = sintesi({
      vn: 0.8,
      tipo: 'ammortizzato',
      norma: 'en81-1-1987',
      intervento: 'limitatore',
    });
    assert.equal(vecchia.v1, 'da 0,92 a 1,49 m/s');
    assert.equal(vecchia.contatto, 'Al più tardi a V1');
    assert.equal(
      vecchia.applicata,
      'UNI EN 81-1:1987 (D.M. 587/1987) — UNI 10411-1:2024, punto 18',
    );
  });

  it('names UNI EN 81-20:2020 and the clause when the safety gear or the speed changes before CE', () => {
    const nuovo = sintesi({
      vn: 1,
      tipo: 'progressivo',
      norma: 'dpr-1497-1963',
      intervento: 'paracadute',
    });
    assert.equal(nuovo.v1, 'da 1,15 a 1,49 m/s');
    assert.equal(nuovo.norma, 'D.P.R. 1497/1963, art. 32');
    assert.equal(nuovo.intervento, 'Limitatore e paracadute');
    assert.equal(nuovo.applicata, 'UNI EN 81-20:2020 — UNI 10411-1:2024, punto 6.7');
    const veloce = sintesi({
      vn: 1.2,
      tipo: 'progressivo',
      norma: 'dlgt-600-1945',
      intervento: 'velocita',
    });
    assert.equal(veloce.v1, 'da 1,38 a 1,70 m/s');
    assert.equal(veloce.applicata, 'UNI EN 81-20:2020 — UNI 10411-1:2024, punti 15.1 e 15.13');
    assert.equal(
      sintesi({ vn: 1, tipo: 'rulli', norma: 'en81-1-1999', intervento: 'velocita' }).applicata,
      'UNI EN 81-1:1999 o 2008 — UNI 10411-11:2024, punto 15 f)',
    );
  });

  it('says only why, and by which standard, when there is no limit', () => {
    const veloce = sintesi({
      vn: 1,
      tipo: 'istantaneo',
      norma: 'en81-20-2020',
      intervento: 'limitatore',
    });
    assert.equal(veloce.v1, null);
    assert.equal(veloce.limite, null);
    assert.equal(veloce.contatto, null);
    assert.match(veloce.motivo ?? '', /solo con velocità nominale fino a 0,63 m\/s/);
    const vecchio = sintesi({
      vn: 0.5,
      tipo: 'progressivo',
      norma: 'dlgt-600-1945',
      intervento: 'limitatore',
    });
    assert.match(vecchio.motivo ?? '', /D\.Lgt\. 600\/1945 non sono nelle tabelle del portale/);
    assert.equal(vecchio.applicata, 'D.Lgt. 600/1945 — UNI 10411-1:2024, punto 18');
    // A new safety gear before CE: UNI EN 81-20:2020, so no buffered instantaneous gear.
    assert.match(
      sintesi({ vn: 0.8, tipo: 'ammortizzato', norma: 'en81-1-1987', intervento: 'paracadute' })
        .motivo ?? '',
      /La UNI EN 81-20:2020 non prevede/,
    );
  });
});
