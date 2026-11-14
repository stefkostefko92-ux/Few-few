// The money of a quote (the owner, 12 November 2026 — point C1): whole numbers only. Cents for money,
// thousandths for quantities, hundredths of a percent for discounts; half up (away from zero) once per step;
// VAT on the taxable total of each rate, as in the "riepilogo IVA" of an Italian invoice.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  centesimiDa,
  euro,
  imponibileRiga,
  isAliquota,
  millesimiDa,
  quantitaTesto,
  riepilogo,
  scontoDa,
  scontoTesto,
} from '../src/preventivi/importi.js';

describe('quote money', () => {
  it('reads Italian and plain amounts, never rounding silently', () => {
    assert.equal(centesimiDa('1.234,56'), 123456);
    assert.equal(centesimiDa('1234,56'), 123456);
    assert.equal(centesimiDa('1234.56'), 123456);
    assert.equal(centesimiDa('€ 12'), 1200);
    assert.equal(centesimiDa('0,5'), 50);
    assert.equal(centesimiDa('12,345'), null, 'three decimals for money is an error');
    assert.equal(centesimiDa('-5'), null);
    assert.equal(centesimiDa('1e3'), null);
    assert.equal(centesimiDa('abc'), null);
    assert.equal(centesimiDa(''), null);
    assert.equal(centesimiDa('99999999999'), null, 'over the cap');
    assert.equal(millesimiDa('1,5'), 1500);
    assert.equal(millesimiDa('2'), 2000);
    assert.equal(millesimiDa('0,125'), 125);
    assert.equal(millesimiDa('0,1255'), null);
    assert.equal(scontoDa('12,5'), 1250);
    assert.equal(scontoDa('100'), 10000);
    assert.equal(scontoDa('100,01'), null);
  });

  it('computes a line once per step, half up', () => {
    // 3 × 33,33 = 99,99
    assert.equal(imponibileRiga({ quantita: 3000, prezzo: 3333, sconto: 0, iva: 22 }), 9999);
    // 1,5 h × 45,55 = 68,325 → 68,33
    assert.equal(imponibileRiga({ quantita: 1500, prezzo: 4555, sconto: 0, iva: 22 }), 6833);
    // 10 % off 68,33 = 6,833 → 6,83 off → 61,50
    assert.equal(imponibileRiga({ quantita: 1500, prezzo: 4555, sconto: 1000, iva: 22 }), 6150);
    assert.equal(imponibileRiga({ quantita: 1000, prezzo: 5000, sconto: 10000, iva: 22 }), 0);
    // Big numbers stay exact (BigInt inside).
    assert.equal(
      imponibileRiga({ quantita: 100_000_000, prezzo: 1_000_000_000, sconto: 0, iva: 22 }),
      100_000_000_000_000,
    );
  });

  it('sums the VAT by rate on the taxable total of the rate', () => {
    const r = riepilogo([
      { quantita: 1000, prezzo: 1001, sconto: 0, iva: 22 },
      { quantita: 1000, prezzo: 1001, sconto: 0, iva: 22 },
      { quantita: 1000, prezzo: 50000, sconto: 0, iva: 10 },
      { quantita: 2000, prezzo: 999, sconto: 500, iva: 4 },
    ]);
    // 22 %: 20,02 → 4,4044 → 4,40 (line by line it would be 2 × 2,20 = 4,40 here; by rate is the rule)
    assert.deepEqual(r.aliquote, [
      { iva: 22, imponibile: 2002, imposta: 440 },
      { iva: 10, imponibile: 50000, imposta: 5000 },
      // 2 × 9,99 = 19,98; 5 % off = 0,999 → 1,00 → 18,98; 4 % = 0,7592 → 0,76
      { iva: 4, imponibile: 1898, imposta: 76 },
    ]);
    assert.equal(r.imponibile, 2002 + 50000 + 1898);
    assert.equal(r.imposta, 440 + 5000 + 76);
    assert.equal(r.totale, r.imponibile + r.imposta);
    assert.deepEqual(riepilogo([]), { aliquote: [], imponibile: 0, imposta: 0, totale: 0 });
  });

  it('rounds the VAT half up at the cent', () => {
    // 22 % of 0,25 = 0,055 → 0,06
    assert.equal(riepilogo([{ quantita: 1000, prezzo: 25, sconto: 0, iva: 22 }]).imposta, 6);
    // 22 % of 0,20 = 0,044 → 0,04
    assert.equal(riepilogo([{ quantita: 1000, prezzo: 20, sconto: 0, iva: 22 }]).imposta, 4);
  });

  it('writes money, quantities and discounts the Italian way', () => {
    assert.equal(euro(123456), '1.234,56');
    assert.equal(euro(5), '0,05');
    assert.equal(euro(100000000), '1.000.000,00');
    assert.equal(quantitaTesto(1500), '1,5');
    assert.equal(quantitaTesto(2000), '2');
    assert.equal(quantitaTesto(125), '0,125');
    assert.equal(scontoTesto(1250), '12,5');
    assert.equal(scontoTesto(1000), '10');
    assert.ok(isAliquota(22) && isAliquota(10) && isAliquota(4));
    assert.ok(!isAliquota(21) && !isAliquota('22'));
  });
});
