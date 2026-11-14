// Switching provider (Data Act, arts. 23–30; owner, 12 November 2026 — points A1/A4 of the enterprise
// review). The rules without a database:
// - the transition lasts 30 calendar days: the service goes on in full through the whole 30th day after
//   the request (Rome time) and ends at the midnight after it;
// - the customer may extend it once (art. 25(5)) by 30, 60 or 90 days, counted from the last day;
// - a request is "in corso" until its end, "concluso" after it; no request — "nessuno";
// - after the end the company keeps 90 days to download its data (art. 17.3, the deletion window).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GIORNI_TRANSIZIONE,
  PROROGHE,
  fineProroga,
  fineTransizione,
  isEsito,
  isProroga,
  statoCambio,
} from '../src/aziende/cambio-tempi.js';

describe('switching provider — the transition period', () => {
  it('lasts 30 days and ends at the Rome midnight after the 30th day', () => {
    assert.equal(GIORNI_TRANSIZIONE, 30);
    // Requested on 12 November 2026 at 15:00 in Rome (14:00 UTC): last day 12 December, end 13 December 00:00 CET.
    const fine = fineTransizione(new Date('2026-11-12T14:00:00Z'));
    assert.equal(fine.toISOString(), '2026-12-12T23:00:00.000Z');
    // Late in the evening in Rome is still the same day of the request.
    const sera = fineTransizione(new Date('2026-11-12T22:30:00Z'));
    assert.equal(sera.toISOString(), '2026-12-12T23:00:00.000Z');
    // Across the summer-time change the end is still midnight in Rome (CEST → +2).
    const estate = fineTransizione(new Date('2027-03-10T10:00:00Z'));
    assert.equal(estate.toISOString(), '2027-04-09T22:00:00.000Z');
  });

  it('is extended once by 30, 60 or 90 days from its last day', () => {
    assert.deepEqual([...PROROGHE], [30, 60, 90]);
    const fine = new Date('2026-12-12T23:00:00.000Z');
    assert.equal(fineProroga(fine, 30).toISOString(), '2027-01-11T23:00:00.000Z');
    assert.equal(fineProroga(fine, 90).toISOString(), '2027-03-12T23:00:00.000Z');
    assert.ok(isProroga(60));
    for (const wrong of [0, 15, 31, 120, '30', null]) assert.equal(isProroga(wrong), false);
  });

  it('knows the three outcomes the customer can choose', () => {
    for (const ok of ['ALTRO_FORNITORE', 'INFRASTRUTTURA_PROPRIA', 'CANCELLAZIONE']) {
      assert.ok(isEsito(ok));
    }
    for (const wrong of ['', 'altro', 'DELETE', 1, undefined]) assert.equal(isEsito(wrong), false);
  });

  it('tells whether a request is running, over or absent', () => {
    const now = new Date('2026-12-01T10:00:00Z');
    assert.equal(statoCambio({ cambioFineAt: null }, now), 'nessuno');
    assert.equal(statoCambio({ cambioFineAt: new Date('2026-12-12T23:00:00Z') }, now), 'in_corso');
    assert.equal(statoCambio({ cambioFineAt: new Date('2026-12-01T10:00:00Z') }, now), 'concluso');
  });
});
