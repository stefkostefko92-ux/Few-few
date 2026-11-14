// The exact edges of the rules about money and time (the audit of 12 November 2026: these changes to the code
// survived every test — a tolerance of 60 minutes instead of 5, a discount applied the other way round, a month
// counted from an odd day). Each value is written here as a number, not rebuilt from the constant it guards.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { scadenzaDopoMesi, statoAbbonamento } from '../src/abbonamenti/regole.js';
import { mezzanotteRoma } from '../src/master/tempo.js';
import { firmaValida, TOLLERANZA_MS } from '../src/pagamenti/firma.js';
import { imponibileRiga } from '../src/preventivi/importi.js';

describe('the signature of a Revolut notice', () => {
  const SEGRETO = 'wsk_confini';
  const corpo = '{"event":"ORDER_COMPLETED","order_id":"o-1"}';
  const firma = (ts: string) =>
    'v1=' + createHmac('sha256', SEGRETO).update(`v1.${ts}.${corpo}`).digest('hex');
  const ora = Date.UTC(2026, 10, 12, 10);

  it('is accepted for five minutes, not for six', () => {
    assert.equal(TOLLERANZA_MS, 300_000);
    const quattro = String(ora - 4 * 60_000);
    assert.equal(firmaValida(corpo, quattro, firma(quattro), [SEGRETO], ora), true);
    const sei = String(ora - 6 * 60_000);
    assert.equal(firmaValida(corpo, sei, firma(sei), [SEGRETO], ora), false);
    const avanti = String(ora + 6 * 60_000);
    assert.equal(firmaValida(corpo, avanti, firma(avanti), [SEGRETO], ora), false);
  });
});

describe('the amount of a quote line', () => {
  it('rounds the discount, not what is left: one cent at 50 % is nothing', () => {
    // 1 cent less half a cent of discount rounded up (1) is 0; rounding the remaining half would give 1.
    assert.equal(imponibileRiga({ quantita: 1000, prezzo: 1, sconto: 5000, iva: 22 }), 0);
    assert.equal(imponibileRiga({ quantita: 1000, prezzo: 3, sconto: 5000, iva: 22 }), 1);
    assert.equal(imponibileRiga({ quantita: 1000, prezzo: 10000, sconto: 3333, iva: 22 }), 6667);
  });
});

describe('the end of a period', () => {
  it('covers the whole last day also across the change of the clocks and at the end of a month', () => {
    // Started on 28 March 2027 (the night the clocks change): until midnight after 28 April, in summer time.
    assert.equal(
      scadenzaDopoMesi(null, 1, new Date('2027-03-28T10:00:00Z')).toISOString(),
      '2027-04-28T22:00:00.000Z',
    );
    // 31 January plus a month is the last day of February (28 in 2027): until midnight after it.
    assert.equal(
      scadenzaDopoMesi(null, 1, new Date('2027-01-31T10:00:00Z')).toISOString(),
      mezzanotteRoma('2027-03-01').toISOString(),
    );
    assert.equal(mezzanotteRoma('2027-03-01').toISOString(), '2027-02-28T23:00:00.000Z');
    // Renewed from an end already ahead: a month from that end, to the minute.
    const fine = mezzanotteRoma('2027-02-01');
    assert.equal(
      scadenzaDopoMesi(fine, 1, new Date('2027-01-10T10:00:00Z')).toISOString(),
      mezzanotteRoma('2027-03-01').toISOString(),
    );
  });

  it('makes the company read-only from that instant on', () => {
    const fino = mezzanotteRoma('2027-03-01');
    const a = {
      abbonamentoFino: fino,
      abbonamentoProva: false,
      abbonamentoLivello: 1,
      abbonamentoCambioAt: null,
      abbonamentoCambioLivello: null,
    };
    assert.equal(statoAbbonamento(a, new Date(fino.getTime() - 1)).solaLettura, false);
    assert.equal(statoAbbonamento(a, fino).solaLettura, true);
  });
});
