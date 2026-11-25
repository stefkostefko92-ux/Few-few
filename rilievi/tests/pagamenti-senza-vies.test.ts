// The sale to a company whose VAT number is NOT valid in VIES (the owner, 12 November 2026: "Направи алтернативата
// за без VIES"; terms 2026-11-14, art. 12.10; art. 18 of Implementing Regulation (EU) No 282/2011; art. 59c of
// Directive 2006/112/EC). Acceptance criteria:
//  - a number valid in VIES: reverse charge, no VAT (as before); a Bulgarian number: Bulgarian VAT 20 % (as before);
//  - a number of another member state NOT valid in VIES: the plan is sold with Bulgarian VAT 20 % on top of the
//    price — its own regime ("iva-bg-ue"), so the accountant tells it from the domestic sale;
//  - only while these sales stay within 10 000 € (net of VAT) in the calendar year AND were within it the year
//    before; the sale that would cross the threshold is not made online;
//  - a refund of such a sale carries its VAT, like the domestic one.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { conIva, importoDi, REGIMI } from '../src/pagamenti/importi.js';
import { rimborsoDovuto } from '../src/pagamenti/rimborsi.js';
import { altreVendite, entroSoglia, quotaSoglia, SOGLIA_UE_CENT } from '../src/pagamenti/soglia.js';

describe('the sale without a VAT number valid in VIES', () => {
  it('adds Bulgarian VAT 20 % in a regime of its own', () => {
    assert.deepEqual(importoDi(29000, 'IT', true), {
      imponibile: 29000,
      iva: 5800,
      totale: 34800,
      regime: 'iva-bg-ue',
    });
    // Half a cent goes up, as for the domestic sale.
    assert.equal(importoDi(3, 'IT', true).iva, 1);
    assert.equal(importoDi(12345, 'DE', true).iva, 2469);
    // With a number valid in VIES nothing changes; a Bulgarian number is never "without VIES".
    assert.equal(importoDi(29000, 'IT').regime, 'inversione');
    assert.equal(importoDi(29000, 'IT', false).totale, 29000);
    assert.deepEqual(importoDi(29000, 'BG', true), importoDi(29000, 'BG'));
    assert.equal(importoDi(29000, 'BG', true).regime, 'iva-bg');
  });

  it('knows which regimes carry VAT', () => {
    assert.deepEqual([...REGIMI], ['iva-bg', 'inversione', 'iva-bg-ue']);
    assert.deepEqual(REGIMI.map(conIva), [true, false, true]);
    // A value the database should never hold is not treated as VAT-free by accident elsewhere: it has no VAT here.
    assert.equal(conIva('altro'), false);
  });

  it('stays within the threshold of 10 000 € of this year and of the year before', () => {
    assert.equal(SOGLIA_UE_CENT, 10_000_00);
    assert.equal(entroSoglia({ corrente: 0, precedente: 0 }, 29000), true);
    // Exactly at the threshold is still within; one cent more is not.
    assert.equal(entroSoglia({ corrente: 971_000, precedente: 0 }, 29000), true);
    assert.equal(entroSoglia({ corrente: 971_001, precedente: 0 }, 29000), false);
    // Over the threshold last year: this year no such sale online, from the first one.
    assert.equal(entroSoglia({ corrente: 0, precedente: 1_000_001 }, 100), false);
    assert.equal(entroSoglia({ corrente: 0, precedente: 1_000_000 }, 100), true);
    assert.equal(quotaSoglia({ corrente: 800_000, precedente: 0 }), 80);
    assert.equal(quotaSoglia({ corrente: 1, precedente: 0 }), 0);
  });

  it('gives back the VAT too when such a sale is refunded', () => {
    const inizio = new Date('2026-12-01T23:00:00Z');
    const fine = new Date('2027-12-01T23:00:00Z');
    const p = { inizio, fine, imponibileCent: 29000, creditoCent: 0, regimeIva: 'iva-bg-ue' };
    // Not started yet: the whole price with its VAT.
    assert.equal(rimborsoDovuto(p, new Date('2026-11-20T10:00:00Z')), 34800);
    assert.equal(
      rimborsoDovuto({ ...p, regimeIva: 'inversione' }, new Date('2026-11-20T10:00:00Z')),
      29000,
    );
  });
});

describe('the sales outside the portal, written by the owner for the threshold', () => {
  const cfg = {
    altreVenditeUeCent: 300_000,
    altreVenditeUePrecCent: 120_000,
    altreVenditeUeAnno: 2026,
  };

  it('count for the year they were written for', () => {
    assert.deepEqual(altreVendite(cfg, 2026), { altre: 300_000, altrePrecedente: 120_000 });
    // A row from before the year was kept: the figure is of the current year.
    assert.deepEqual(altreVendite({ ...cfg, altreVenditeUeAnno: null }, 2026), {
      altre: 300_000,
      altrePrecedente: 120_000,
    });
    assert.deepEqual(altreVendite(null, 2026), { altre: 0, altrePrecedente: 0 });
  });

  it('become "last year" by themselves on 1 January, and are forgotten a year later', () => {
    // Nobody has written the new figures yet: this year starts from zero, last year keeps what was sold.
    assert.deepEqual(altreVendite(cfg, 2027), { altre: 0, altrePrecedente: 300_000 });
    assert.deepEqual(altreVendite(cfg, 2028), { altre: 0, altrePrecedente: 0 });
  });
});
