// When a bought plan starts and what it gives (#31 — terms 2026-11-12, art. 12.3 and 12.4), without a database:
// during the trial or another plan it waits for their end (the level changes then, the trial keeps its
// unlimited people until then); an expired company starts at once; a higher level starts at once and the
// paid, unused days of the plan running now become days of the new one at the same value. One bought plan in
// the queue at a time; a period given by hand (no Revolut payments behind it) is not converted online.
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

  it('refuses a second plan while one waits, and a company without an end', () => {
    const coda = {
      ...base,
      abbonamentoFino: mezzanotteRoma('2027-12-02'),
      abbonamentoProva: true,
      abbonamentoCambioAt: mezzanotteRoma('2026-12-02'),
      abbonamentoCambioLivello: 1,
    };
    assert.deepEqual(periodoDi(coda, [], piano(2, 12, 49000), now), {
      ok: false,
      errore: 'inCoda',
    });
    assert.deepEqual(periodoDi(base, [], piano(1, 12, 29000), now), {
      ok: false,
      errore: 'senzaScadenza',
    });
  });

  it('turns the paid days left into days of a higher level, at the same value', () => {
    // Level 1 for 12 months from 13/10/2026 at 290 €; on 12/11/2026 the company buys level 2 for 12 months at 490 €.
    const p1: Segmento = {
      inizio: mezzanotteRoma('2026-10-13'),
      fine: mezzanotteRoma('2027-10-13'),
      valoreCent: 29000,
    };
    const p = periodoDi(
      { ...base, abbonamentoFino: p1.fine, abbonamentoLivello: 1 },
      [p1],
      piano(2, 12, 49000),
      now,
    );
    assert.ok(p.ok);
    assert.equal(p.modo, 'superiore');
    assert.equal(p.inizio.toISOString(), now.toISOString());
    // 334,5 of 365 days left → 26.576 cents; at 490 € for 365,54 days they are 198 days.
    assert.deepEqual(p.credito, { giorni: 334, valoreCent: 26576, giorniExtra: 198 });
    assert.equal(p.fine.toISOString(), mezzanotteRoma('2027-11-13', 198).toISOString());
  });

  it('adds up a chain of renewals and skips a plan already converted', () => {
    const a: Segmento = {
      inizio: mezzanotteRoma('2026-10-13'),
      fine: mezzanotteRoma('2027-10-13'),
      valoreCent: 29000,
    };
    const b: Segmento = { inizio: a.fine, fine: mezzanotteRoma('2028-10-13'), valoreCent: 29000 };
    // An older plan that ends later than now but is not in the chain (already turned into credit).
    const vecchio: Segmento = {
      inizio: mezzanotteRoma('2026-09-01'),
      fine: mezzanotteRoma('2026-12-01'),
      valoreCent: 9000,
    };
    const p = periodoDi(
      { ...base, abbonamentoFino: b.fine, abbonamentoLivello: 1 },
      [vecchio, b, a],
      piano(3, 1, 9900),
      now,
    );
    assert.ok(p.ok);
    assert.equal(p.credito?.valoreCent, 26576 + 29000);
  });

  it('does not convert a period given by hand', () => {
    const fino = mezzanotteRoma('2027-03-01');
    assert.deepEqual(
      periodoDi(
        { ...base, abbonamentoFino: fino, abbonamentoLivello: 1 },
        [],
        piano(2, 12, 49000),
        now,
      ),
      { ok: false, errore: 'manuale' },
    );
    // Paid by Revolut, but after days given by hand that have not passed yet.
    const dopo: Segmento = { inizio: mezzanotteRoma('2026-12-01'), fine: fino, valoreCent: 9000 };
    assert.deepEqual(
      periodoDi(
        { ...base, abbonamentoFino: fino, abbonamentoLivello: 1 },
        [dopo],
        piano(2, 12, 49000),
        now,
      ),
      { ok: false, errore: 'manuale' },
    );
  });
});

describe('the state with a plan in the queue', () => {
  it('keeps the trial until the plan starts, then the level of the plan', () => {
    const a = {
      ...base,
      abbonamentoFino: mezzanotteRoma('2027-12-02'),
      abbonamentoProva: true,
      abbonamentoCambioAt: mezzanotteRoma('2026-12-02'),
      abbonamentoCambioLivello: 1,
    };
    const ora = statoAbbonamento(a, now);
    assert.equal(ora.tipo, 'prova');
    assert.equal(ora.maxPersone, null);
    assert.equal(ora.fino?.toISOString(), mezzanotteRoma('2026-12-02').toISOString());
    assert.deepEqual(ora.poi, { dal: a.abbonamentoCambioAt, livello: 1, fino: a.abbonamentoFino });
    const dopo = statoAbbonamento(a, mezzanotteRoma('2026-12-02'));
    assert.equal(dopo.tipo, 'attivo');
    assert.equal(dopo.livello, 1);
    assert.equal(dopo.maxPersone, 10);
    assert.equal(dopo.fino?.toISOString(), a.abbonamentoFino.toISOString());
    assert.equal(dopo.poi, null);
  });
});
