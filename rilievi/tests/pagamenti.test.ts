// The Premium payments through Revolut Business (#31 — terms 2026-11-12, art. 12): without network or database.
// The webhook is believed only with a valid signature (HMAC-SHA256 of "v1.<timestamp>.<raw body>", hex, in
// Revolut-Signature, more than one during a key rotation) and a fresh timestamp (5 minutes); the amount is
// whole cents, computed on the server from the plan — VAT only for a company in Bulgaria, reverse charge for
// the rest of the EU (art. 12.1).
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { firmaValida, TOLLERANZA_MS } from '../src/pagamenti/firma.js';
import { importoDi, partitaIvaDa } from '../src/pagamenti/importi.js';

const SEGRETO = 'wsk_test_0123456789abcdef';
const corpo = '{"event":"ORDER_COMPLETED","order_id":"6516e61c-d279-a454-a837-bc52ce55ed49"}';
const ora = Date.UTC(2026, 10, 12, 10);
const firma = (segreto: string, ts: string, raw = corpo) =>
  `v1=${createHmac('sha256', segreto).update(`v1.${ts}.${raw}`).digest('hex')}`;

describe('the webhook signature', () => {
  it('accepts the signature of the raw body with a fresh timestamp', () => {
    const ts = String(ora);
    assert.equal(firmaValida(corpo, ts, firma(SEGRETO, ts), [SEGRETO], ora), true);
    // During a rotation the header carries more signatures: one is enough.
    const due = `${firma('wsk_vecchio', ts)},${firma(SEGRETO, ts)}`;
    assert.equal(firmaValida(corpo, ts, due, [SEGRETO], ora), true);
    // And the old secret, while both are kept.
    assert.equal(
      firmaValida(corpo, ts, firma('wsk_vecchio', ts), ['wsk_vecchio', SEGRETO], ora),
      true,
    );
  });

  it('refuses another body, secret, old or future timestamp, broken headers', () => {
    const ts = String(ora);
    assert.equal(firmaValida(corpo + ' ', ts, firma(SEGRETO, ts), [SEGRETO], ora), false);
    assert.equal(firmaValida(corpo, ts, firma('wsk_altro', ts), [SEGRETO], ora), false);
    const vecchio = String(ora - TOLLERANZA_MS - 1);
    assert.equal(firmaValida(corpo, vecchio, firma(SEGRETO, vecchio), [SEGRETO], ora), false);
    const futuro = String(ora + TOLLERANZA_MS + 1);
    assert.equal(firmaValida(corpo, futuro, firma(SEGRETO, futuro), [SEGRETO], ora), false);
    for (const header of [
      undefined,
      '',
      'v1=',
      'v2=' + 'a'.repeat(64),
      'v1=' + 'z'.repeat(64),
      'v1=abc',
    ])
      assert.equal(firmaValida(corpo, ts, header, [SEGRETO], ora), false, String(header));
    assert.equal(firmaValida(corpo, undefined, firma(SEGRETO, ts), [SEGRETO], ora), false);
    assert.equal(firmaValida(corpo, 'abc', firma(SEGRETO, 'abc'), [SEGRETO], ora), false);
    assert.equal(firmaValida(corpo, ts, firma(SEGRETO, ts), [], ora), false);
  });
});

describe('the amount of a plan', () => {
  it('reads the VAT number and the country it belongs to', () => {
    assert.deepEqual(partitaIvaDa(' 01234567897 '), { numero: 'IT01234567897', paese: 'IT' });
    assert.deepEqual(partitaIvaDa('it 012 345 678 97'), { numero: 'IT01234567897', paese: 'IT' });
    assert.deepEqual(partitaIvaDa('BG208725180'), { numero: 'BG208725180', paese: 'BG' });
    assert.deepEqual(partitaIvaDa('DE123456789'), { numero: 'DE123456789', paese: 'DE' });
    for (const bad of ['', '123', 'IT123', 'XX', 'US123456789', 'IT0123456789A', 'a'.repeat(30)])
      assert.equal(partitaIvaDa(bad), null, bad);
  });

  it('charges the price as it is (reverse charge) in the EU, with 20 % VAT in Bulgaria', () => {
    assert.deepEqual(importoDi(29000, 'IT'), {
      imponibile: 29000,
      iva: 0,
      totale: 29000,
      regime: 'inversione',
    });
    assert.deepEqual(importoDi(29000, 'BG'), {
      imponibile: 29000,
      iva: 5800,
      totale: 34800,
      regime: 'iva-bg',
    });
    // Half a cent goes up.
    assert.equal(importoDi(2, 'BG').iva, 0);
    assert.equal(importoDi(3, 'BG').iva, 1);
    assert.equal(importoDi(12345, 'BG').iva, 2469);
  });
});
