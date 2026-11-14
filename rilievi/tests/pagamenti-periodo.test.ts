// When a bought plan starts and what it gives (#31 — terms 2026-11-12, art. 12.3 and 12.4), without a database:
// during the trial or another plan it waits for their end (the level changes then, the trial keeps its features
// until then); an expired company starts at once; a higher level starts at once and the paid, unused days of the
// plan running now become days of the new one at the same value — counted from the start of the day (Rome), so
// the offer does not change while the person reads it. One bought plan in the queue at a time: the same or a
// lower level waits; a higher one replaces it (its value becomes days of the new one). The limit of people of a
// bought plan holds from the purchase. A period given by hand (no Revolut payments behind it) is not converted.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scadenzaDopoMesi, statoAbbonamento } from '../src/abbonamenti/regole.js';
import { mezzanotteRoma } from '../src/master/tempo.js';
import { periodoDi, type Segmento } from '../src/pagamenti/periodo.js';

const now = new Date(Date.UTC(2026, 10, 12, 10)); // 12/11/2026, 11:00 in Rome
const piano = (livello: number, mesi: number, prezzoCent: number) => ({
  livello,
  mesi,
  prezzoCent,
});
const base = {
  abbonamentoFino: null as Date | null,
  abbonamentoProva: false,
  abbonamentoLivello: null as number | null,
  abbonamentoCambioAt: null as Date | null,
  abbonamentoCambioLivello: null as number | null,
};
const seg = (id: string, dal: string, al: string, valoreCent: number): Segmento => ({
  id,
  inizio: mezzanotteRoma(dal),
  fine: mezzanotteRoma(al),
  valoreCent,
});

describe('the period of a bought plan', () => {
  it('waits for the end of the trial', () => {
    const fino = mezzanotteRoma('2026-12-02');
    const p = periodoDi(
      { ...base, abbonamentoFino: fino, abbonamentoProva: true },
      [],
      piano(1, 12, 29000),
      now,
    );
    assert.ok(p.ok);
    assert.equal(p.modo, 'coda');
    assert.equal(p.inizio.toISOString(), fino.toISOString());
    assert.equal(p.fine.toISOString(), mezzanotteRoma('2027-12-02').toISOString());
    assert.equal(p.credito, null);
  });

  it('starts at once for an expired company, covering the whole last day', () => {
    const p = periodoDi(
      { ...base, abbonamentoFino: mezzanotteRoma('2026-11-01'), abbonamentoLivello: 1 },
      [],
      piano(2, 12, 49000),
      now,
    );
    assert.ok(p.ok);
    assert.equal(p.modo, 'subito');
    assert.equal(p.inizio.toISOString(), now.toISOString());
    assert.equal(p.fine.toISOString(), scadenzaDopoMesi(null, 12, now).toISOString());
  });

  it('queues the same or a lower level after the plan running now', () => {
    const fino = mezzanotteRoma('2027-03-01');
    for (const livello of [2, 1]) {
      const p = periodoDi(
        { ...base, abbonamentoFino: fino, abbonamentoLivello: 2 },
        [],
        piano(livello, 1, 5000),
        now,
      );
      assert.ok(p.ok);
      assert.equal(p.modo, 'coda');
      assert.equal(p.inizio.toISOString(), fino.toISOString());
      assert.equal(p.fine.toISOString(), mezzanotteRoma('2027-04-01').toISOString());
    }
  });

  it('refuses the same or a lower level while a plan waits, and a company without an end', () => {
    const coda = {
      ...base,
      abbonamentoFino: mezzanotteRoma('2027-12-02'),
      abbonamentoProva: true,
      abbonamentoCambioAt: mezzanotteRoma('2026-12-02'),
      abbonamentoCambioLivello: 2,
    };
    for (const livello of [1, 2])
      assert.deepEqual(periodoDi(coda, [], piano(livello, 12, 49000), now), {
        ok: false,
        errore: 'inCoda',
      });
    assert.deepEqual(periodoDi(base, [], piano(1, 12, 29000), now), {
      ok: false,
      errore: 'senzaScadenza',
    });
  });

  it('replaces the plan that waits with a higher one: its whole value becomes days of the new plan', () => {
    // In the trial, level 1 for 12 months (290 €) bought to start at its end; now level 2 for 12 months (490 €).
    const inCoda = seg('p1', '2026-12-02', '2027-12-02', 29000);
    const azienda = {
      ...base,
      abbonamentoFino: inCoda.fine,
      abbonamentoProva: true,
      abbonamentoCambioAt: inCoda.inizio,
      abbonamentoCambioLivello: 1,
    };
    const p = periodoDi(azienda, [inCoda], piano(2, 12, 49000), now);
    assert.ok(p.ok);
    // Still at the end of the trial; 290 € at 490 € for 365 days are 216 days more.
    assert.equal(p.modo, 'coda');
    assert.equal(p.inizio.toISOString(), inCoda.inizio.toISOString());
    assert.deepEqual(p.credito, { giorni: 365, valoreCent: 29000, giorniExtra: 216, da: ['p1'] });
    assert.equal(p.fine.toISOString(), mezzanotteRoma('2027-12-02', 216).toISOString());
    // Without the payment behind the plan that waits (given by hand): not online.
    assert.deepEqual(periodoDi(azienda, [], piano(2, 12, 49000), now), {
      ok: false,
      errore: 'manuale',
    });
  });

  it('turns the paid days left into days of a higher level, at the same value', () => {
    // Level 1 for 12 months from 13/10/2026 at 290 €; on 12/11/2026 the company buys level 2 for 12 months at 490 €.
    const p1 = seg('p1', '2026-10-13', '2027-10-13', 29000);
    const azienda = { ...base, abbonamentoFino: p1.fine, abbonamentoLivello: 1 };
    const p = periodoDi(azienda, [p1], piano(2, 12, 49000), now);
    assert.ok(p.ok);
    assert.equal(p.modo, 'superiore');
    assert.equal(p.inizio.toISOString(), now.toISOString());
    // From the start of today (Rome): 334,96 of 365 days left → 26.613 cents; at 490 € for 366 days, 198 days.
    assert.deepEqual(p.credito, { giorni: 334, valoreCent: 26613, giorniExtra: 198, da: ['p1'] });
    assert.equal(p.fine.toISOString(), mezzanotteRoma('2027-11-13', 198).toISOString());
    // The same offer for the whole day: the credit does not change with the hour.
    const sera = periodoDi(
      azienda,
      [p1],
      piano(2, 12, 49000),
      new Date(Date.UTC(2026, 10, 12, 21, 30)),
    );
    assert.ok(sera.ok);
    assert.deepEqual(sera.credito, p.credito);
    assert.equal(sera.fine.toISOString(), p.fine.toISOString());
  });

  it('adds up a chain of renewals and skips a plan already converted', () => {
    const a = seg('a', '2026-10-13', '2027-10-13', 29000);
    const b = seg('b', '2027-10-13', '2028-10-13', 29000);
    // An older plan that ends later than now but is not in the chain (already turned into credit).
    const vecchio = seg('v', '2026-09-01', '2026-12-01', 9000);
    // The renewal waits (same level): a higher level starts now over both.
    const p = periodoDi(
      {
        ...base,
        abbonamentoFino: b.fine,
        abbonamentoLivello: 1,
        abbonamentoCambioAt: a.fine,
        abbonamentoCambioLivello: 1,
      },
      [vecchio, b, a],
      piano(3, 1, 9900),
      now,
    );
    assert.ok(p.ok);
    assert.equal(p.modo, 'superiore');
    assert.equal(p.credito?.valoreCent, 26613 + 29000);
    assert.deepEqual(p.credito?.da, ['b', 'a']);
  });

  it('does not convert a period given by hand', () => {
    const fino = mezzanotteRoma('2027-03-01');
    const azienda = { ...base, abbonamentoFino: fino, abbonamentoLivello: 1 };
    assert.deepEqual(periodoDi(azienda, [], piano(2, 12, 49000), now), {
      ok: false,
      errore: 'manuale',
    });
    // Paid by Revolut, but after days given by hand that have not passed yet.
    const dopo = seg('d', '2026-12-01', '2027-03-01', 9000);
    assert.deepEqual(periodoDi(azienda, [dopo], piano(2, 12, 49000), now), {
      ok: false,
      errore: 'manuale',
    });
  });
});

describe('the state with a plan in the queue', () => {
  const inCoda = {
    ...base,
    abbonamentoFino: mezzanotteRoma('2027-12-02'),
    abbonamentoProva: true,
    abbonamentoCambioAt: mezzanotteRoma('2026-12-02'),
    abbonamentoCambioLivello: 1,
  };

  it('keeps the trial until the plan starts, then the level of the plan', () => {
    const ora = statoAbbonamento(inCoda, now);
    assert.equal(ora.tipo, 'prova');
    assert.equal(ora.fino?.toISOString(), mezzanotteRoma('2026-12-02').toISOString());
    assert.deepEqual(ora.poi, {
      dal: inCoda.abbonamentoCambioAt,
      livello: 1,
      fino: inCoda.abbonamentoFino,
    });
    const dopo = statoAbbonamento(inCoda, mezzanotteRoma('2026-12-02'));
    assert.equal(dopo.tipo, 'attivo');
    assert.equal(dopo.livello, 1);
    assert.equal(dopo.maxPersone, 10);
    assert.equal(dopo.fino?.toISOString(), inCoda.abbonamentoFino.toISOString());
    assert.equal(dopo.poi, null);
  });

  it('holds the limit of people of the bought plan from the purchase', () => {
    // The trial alone has no limit; with level 1 bought, 10 from now on — not 60 people for the price of 10.
    assert.equal(
      statoAbbonamento(
        { ...inCoda, abbonamentoCambioAt: null, abbonamentoCambioLivello: null },
        now,
      ).maxPersone,
      null,
    );
    assert.equal(statoAbbonamento(inCoda, now).maxPersone, 10);
    assert.equal(
      statoAbbonamento({ ...inCoda, abbonamentoCambioLivello: 3 }, now).maxPersone,
      null,
    );
    // A paid plan running with another one waiting: the lower of the two.
    const q = (ora: number, poi: number) =>
      statoAbbonamento(
        {
          ...inCoda,
          abbonamentoProva: false,
          abbonamentoLivello: ora,
          abbonamentoCambioLivello: poi,
        },
        now,
      ).maxPersone;
    assert.equal(q(3, 1), 10);
    assert.equal(q(1, 2), 10);
    assert.equal(q(2, 3), 25);
  });

  it('is read-only exactly from the end, not a millisecond before', () => {
    const fine = mezzanotteRoma('2026-12-02');
    const a = { ...base, abbonamentoFino: fine, abbonamentoLivello: 1 };
    assert.equal(statoAbbonamento(a, fine).solaLettura, true);
    assert.equal(statoAbbonamento(a, new Date(fine.getTime() - 1)).solaLettura, false);
  });
});
