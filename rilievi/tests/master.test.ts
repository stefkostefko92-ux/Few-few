// The master console without a database (the owner, 10 November 2026 — "Espandi le funzioni di master"):
// the code typed from a sheet, the days of a notice in Rome time, the weeks of the activity chart, the
// state of a notice and of a contract, and the lights of the system health.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { statoDi } from '../src/master/comunicazioni.js';
import { leggiForm } from '../src/master/comunicazioni-form.js';
import { statoContratto } from '../src/master/contratti.js';
import { perSettimana, SETTIMANE } from '../src/master/panoramica.js';
import { byteLeggibili, durata, esitoCoda, esitoSpazio } from '../src/master/sistema.js';
import { inizioSettimana, mezzanotteRoma } from '../src/master/tempo.js';
import { leggiCodice } from '../src/master/verifica.js';
import { STORIA, VERSIONE } from '../src/legale/versioni.js';

describe('the code typed from a sheet', () => {
  it('reads a Rif. however it is copied', () => {
    for (const raw of [
      'A1B2-C3D4-E5F6',
      'a1b2c3d4e5f6',
      ' Rif. A1B2 C3D4 E5F6 ',
      'rif a1b2–c3d4–e5f6',
    ]) {
      assert.deepEqual(leggiCodice(raw), { tipo: 'rif', valore: 'A1B2-C3D4-E5F6' }, raw);
    }
  });

  it('reads a fingerprint of 64 characters in groups of four', () => {
    const hex = 'ab'.repeat(32);
    const spaced = (hex.toUpperCase().match(/.{4}/g) ?? []).join(' ');
    assert.deepEqual(leggiCodice(spaced), { tipo: 'hash', valore: hex });
  });

  it('refuses anything else', () => {
    for (const raw of ['', 'A1B2-C3D4', 'G1B2-C3D4-E5F6', 'x'.repeat(300), 42, null]) {
      assert.equal(leggiCodice(raw), null, String(raw));
    }
  });
});

describe('the days of a notice', () => {
  it('start at midnight in Rome, in winter and in summer', () => {
    assert.equal(mezzanotteRoma('2026-01-15').toISOString(), '2026-01-14T23:00:00.000Z');
    assert.equal(mezzanotteRoma('2026-07-15').toISOString(), '2026-07-14T22:00:00.000Z');
    // The night of the clock change: midnight is before it.
    assert.equal(mezzanotteRoma('2026-03-29').toISOString(), '2026-03-28T23:00:00.000Z');
    assert.equal(mezzanotteRoma('2026-10-25').toISOString(), '2026-10-24T22:00:00.000Z');
    assert.equal(mezzanotteRoma('2026-10-24', 1).toISOString(), '2026-10-24T22:00:00.000Z');
  });

  const aziende = new Set(['a1', 'a2']);
  const base = {
    titolo: 'Manutenzione',
    testo: 'Il portale si ferma.',
    livello: 'AVVISO',
    inizio: '2026-11-12',
  };

  it('end after the last day, included', () => {
    const r = leggiForm({ ...base, destinatari: 'tutte', fine: '2026-11-12' }, aziende);
    assert.ok(r.ok);
    assert.equal(r.value.inizioAt.toISOString(), '2026-11-11T23:00:00.000Z');
    assert.equal(r.value.fineAt?.toISOString(), '2026-11-12T23:00:00.000Z');
    assert.deepEqual(r.value.aziendaIds, []);
    assert.equal(r.value.email, false);
  });

  it('go only to existing companies, at least one when chosen', () => {
    assert.deepEqual(leggiForm({ ...base, destinatari: 'scelte' }, aziende), {
      ok: false,
      errore: 'aziende',
    });
    assert.deepEqual(leggiForm({ ...base, destinatari: 'scelte', aziende: ['a1', 'x'] }, aziende), {
      ok: false,
      errore: 'aziende',
    });
    const r = leggiForm(
      { ...base, destinatari: 'scelte', aziende: ['a2', 'a2'], email: '1' },
      aziende,
    );
    assert.ok(r.ok);
    assert.deepEqual(r.value.aziendaIds, ['a2']);
    assert.equal(r.value.email, true);
  });

  it('refuse an end before the start, over a year, a title on two lines, an unknown level', () => {
    const no = (extra: Record<string, unknown>, errore: string) =>
      assert.deepEqual(leggiForm({ ...base, destinatari: 'tutte', ...extra }, aziende), {
        ok: false,
        errore,
      });
    no({ fine: '2026-11-11' }, 'date');
    no({ fine: '2027-12-01' }, 'date');
    no({ titolo: 'Due\nrighe' }, 'campi');
    no({ titolo: 'x' }, 'campi');
    no({ livello: 'ROSSO' }, 'campi');
    no({ inizio: '12/11/2026' }, 'campi');
    no({ inizio: '2026-02-31' }, 'date');
    no({ fine: '2026-11-31' }, 'date');
  });

  it('keep the empty lines of the text and drop control characters', () => {
    const r = leggiForm({ ...base, destinatari: 'tutte', testo: 'Uno\r\n\r\nDue\u0007' }, aziende);
    assert.ok(r.ok);
    assert.equal(r.value.testo, 'Uno\n\nDue');
  });

  it('are scheduled, running, over or stopped', () => {
    const now = new Date('2026-11-12T10:00:00Z');
    const c = (inizio: string, fine: string | null, ferma: string | null = null) => ({
      inizioAt: new Date(inizio),
      fineAt: fine ? new Date(fine) : null,
      fermataAt: ferma ? new Date(ferma) : null,
    });
    assert.equal(statoDi(c('2026-11-13T00:00:00Z', null), now), 'programmata');
    assert.equal(statoDi(c('2026-11-11T00:00:00Z', null), now), 'attiva');
    assert.equal(statoDi(c('2026-11-10T00:00:00Z', '2026-11-12T10:00:00Z'), now), 'conclusa');
    assert.equal(statoDi(c('2026-11-11T00:00:00Z', null, '2026-11-11T09:00:00Z'), now), 'fermata');
  });
});

describe('the activity chart', () => {
  it('has twelve weeks up to this one, Monday first, empty weeks with zeros', () => {
    const now = new Date('2026-11-12T10:00:00Z'); // a Thursday
    assert.equal(inizioSettimana(now).toISOString(), '2026-11-09T00:00:00.000Z');
    const settimane = perSettimana(
      [
        { settimana: new Date('2026-11-09T00:00:00Z'), action: 'SCHEDA_CREATE', n: 3 },
        { settimana: new Date('2026-11-09T00:00:00Z'), action: 'SCHEDA_UPDATE', n: 2 },
        { settimana: new Date('2026-11-09T00:00:00Z'), action: 'VERBALE_CONFIRM', n: 1 },
        { settimana: new Date('2026-08-24T00:00:00Z'), action: 'ARGANO_CALCOLO', n: 4 },
        // Older than the chart, and an action that is not work: left out.
        { settimana: new Date('2026-08-17T00:00:00Z'), action: 'SCHEDA_CREATE', n: 9 },
        { settimana: new Date('2026-11-09T00:00:00Z'), action: 'LOGIN', n: 50 },
      ],
      now,
    );
    assert.equal(settimane.length, SETTIMANE);
    assert.equal(settimane[0]!.da.toISOString(), '2026-08-24T00:00:00.000Z');
    assert.deepEqual(settimane[0]!.valori, { schede: 0, assistenza: 0, calcoli: 4 });
    assert.deepEqual(settimane.at(-1)!.valori, { schede: 5, assistenza: 1, calcoli: 0 });
    assert.equal(settimane.at(-1)!.totale, 6);
    assert.equal(
      settimane.slice(1, -1).reduce((n, s) => n + s.totale, 0),
      0,
    );
  });
});

describe('the state of a contract', () => {
  it('is signed only with a row in the register for the version in force', () => {
    assert.equal(statoContratto(VERSIONE.CONDIZIONI, VERSIONE.CONDIZIONI), 'firmate');
    assert.equal(statoContratto(VERSIONE.CONDIZIONI, null), 'esistente');
    assert.equal(statoContratto(VERSIONE.CONDIZIONI, '2000-01-01'), 'esistente');
    assert.equal(statoContratto(null, null), 'attesa');
    assert.equal(statoContratto('2000-01-01', '2000-01-01'), 'attesa');
    // A later version than the one in force, accepted in advance (the companies marked by the migration).
    const ultima = STORIA.CONDIZIONI.at(-1)!;
    assert.equal(statoContratto(ultima, null), 'esistente');
    assert.equal(statoContratto(ultima, ultima), 'firmate');
  });
});

describe('the lights of the system', () => {
  it('turn on the queue of the photos by its oldest file and its failures', () => {
    assert.equal(esitoCoda(null, 0), 'ok');
    assert.equal(esitoCoda(5 * 60_000, 0), 'ok');
    assert.equal(esitoCoda(null, 2), 'attenzione');
    assert.equal(esitoCoda(20 * 60_000, 0), 'attenzione');
    assert.equal(esitoCoda(2 * 3_600_000, 0), 'errore');
  });

  it('turn on the free space against the minimum for uploads', () => {
    const mb = 1024 * 1024;
    assert.equal(esitoSpazio(1000 * mb, 2048), 'errore');
    assert.equal(esitoSpazio(4000 * mb, 2048), 'attenzione');
    assert.equal(esitoSpazio(10_000 * mb, 2048), 'ok');
  });

  it('write bytes and durations for people', () => {
    assert.equal(byteLeggibili(512), '1 KB');
    assert.equal(byteLeggibili(14 * 1024 * 1024), '14 MB');
    assert.equal(byteLeggibili(27.8 * 1024 ** 3), '27,8 GB');
    assert.equal(durata(8 * 60_000), '8 min');
    assert.equal(durata(5 * 3_600_000 + 12 * 60_000), '5 h 12 min');
    assert.equal(durata(3 * 86_400_000 + 4 * 3_600_000), '3 g 4 h');
  });
});
