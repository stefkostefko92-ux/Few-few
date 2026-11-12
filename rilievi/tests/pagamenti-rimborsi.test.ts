// The refund due when a paid plan ends early (#31 — terms 2026-11-12, art. 12.9), without a database: the part of
// what was paid for the WHOLE days not used, in proportion to the length of the plan; a plan not started yet — all
// of it; an expired one — nothing. The value of a plan is what was paid plus the credit converted from earlier
// payments (art. 12.4), so an upgrade does not lower what is due; Bulgarian VAT is given back with its base.
// The amount MASTER writes is read as euro: "20,50", "1.290,5", "30".
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mezzanotteRoma } from '../src/master/tempo.js';
import { importoDa, rimborsoDovuto } from '../src/pagamenti/rimborsi.js';

const piano = {
  inizio: mezzanotteRoma('2026-11-01'),
  fine: mezzanotteRoma('2027-11-01'),
  imponibileCent: 36500,
  creditoCent: 0,
  regimeIva: 'inversione',
};

describe('the refund due for the days not used', () => {
  it('counts whole days only, in proportion to the plan', () => {
    // 365 days at 365 €: one euro a day. Stopped at noon of the 11th day: 354 whole days are left.
    const al = new Date(mezzanotteRoma('2026-11-11').getTime() + 12 * 3600 * 1000);
    assert.equal(rimborsoDovuto(piano, al), 35400);
    // At midnight exactly: 355.
    assert.equal(rimborsoDovuto(piano, mezzanotteRoma('2026-11-11')), 35500);
  });

  it('gives back everything for a plan not started and nothing for an expired one', () => {
    assert.equal(rimborsoDovuto(piano, mezzanotteRoma('2026-10-15')), 36500);
    assert.equal(rimborsoDovuto(piano, piano.fine), 0);
    assert.equal(rimborsoDovuto(piano, mezzanotteRoma('2028-01-01')), 0);
    assert.equal(rimborsoDovuto({ ...piano, inizio: null, fine: null }, new Date()), 0);
  });

  it('includes the credit converted from earlier payments and the Bulgarian VAT', () => {
    const conCredito = { ...piano, creditoCent: 36500 };
    assert.equal(rimborsoDovuto(conCredito, mezzanotteRoma('2026-10-15')), 73000);
    // 20 % on the base given back.
    assert.equal(
      rimborsoDovuto({ ...piano, regimeIva: 'iva-bg' }, mezzanotteRoma('2026-11-11')),
      35500 + 7100,
    );
  });
});

describe('the amount MASTER writes', () => {
  it('reads euro the Italian way and refuses anything else', () => {
    assert.equal(importoDa('20,50'), 2050);
    assert.equal(importoDa('1.290,5'), 129050);
    assert.equal(importoDa(' 30 € '), 3000);
    assert.equal(importoDa('0'), 0);
    assert.equal(importoDa('12.5'), 1250);
    for (const no of ['', '-5', '1,234', 'abc', '1e3', '12345678', undefined, 5])
      assert.equal(importoDa(no), null, String(no));
  });
});
