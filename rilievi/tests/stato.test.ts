// The status page /stato (terms 2026-11-12, art. 2.4): the state of the Service now, the interruptions under
// way, the planned maintenance and the recovery objectives. Notices are written by the MASTER (times in Rome);
// the overall state comes from the live checks and the notices — an interruption under way is said even when
// the checks are green.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseAvviso } from '../src/stato/avvisi.js';
import { classifica, statoGenerale } from '../src/stato/servizio.js';

const ora = new Date('2026-12-01T10:00:00Z');
const ore = (h: number) => new Date(ora.getTime() + h * 3_600_000);
const avviso = (tipo: 'INTERRUZIONE' | 'MANUTENZIONE', inizio: Date, fine: Date | null) => ({
  id: `${tipo}-${inizio.getTime()}`,
  tipo,
  titolo: 'x',
  testo: 'y',
  inizio,
  fine,
});

describe('the status page', () => {
  it('sorts the notices: under way, planned, past (90 days)', () => {
    const c = classifica(
      [
        avviso('INTERRUZIONE', ore(-2), null),
        avviso('INTERRUZIONE', ore(-30), ore(-28)),
        avviso('MANUTENZIONE', ore(24), ore(26)),
        avviso('MANUTENZIONE', ore(-1), ore(1)),
        avviso('INTERRUZIONE', ore(-24 * 100), ore(-24 * 100 + 1)),
      ],
      ora,
    );
    assert.deepEqual(
      c.inCorso.map((a) => a.tipo),
      ['INTERRUZIONE', 'MANUTENZIONE'],
    );
    assert.equal(c.programmate.length, 1);
    assert.equal(c.storico.length, 1, 'older than 90 days is not shown');
  });

  it('says the overall state from the checks and the notices', () => {
    const verdi = [
      { chiave: 'portale', esito: 'ok' as const, critico: true },
      { chiave: 'dati', esito: 'ok' as const, critico: true },
    ];
    assert.equal(statoGenerale(verdi, []), 'ok');
    assert.equal(
      statoGenerale([...verdi, { chiave: 'foto', esito: 'attenzione' as const }], []),
      'parziale',
    );
    assert.equal(
      statoGenerale([...verdi, { chiave: 'dati', esito: 'errore' as const, critico: true }], []),
      'interruzione',
    );
    // The emails not going out: the rest works — partial, not an interruption.
    assert.equal(
      statoGenerale([...verdi, { chiave: 'email', esito: 'errore' as const }], []),
      'parziale',
    );
    assert.equal(statoGenerale(verdi, [avviso('INTERRUZIONE', ore(-1), null)]), 'interruzione');
    assert.equal(statoGenerale(verdi, [avviso('MANUTENZIONE', ore(-1), ore(1))]), 'manutenzione');
  });

  it('reads the MASTER form: times in Rome, an end after the start, maintenance with an end', () => {
    const ok = parseAvviso({
      tipo: 'MANUTENZIONE',
      titolo: ' Aggiornamento del database ',
      testo: 'Il portale non è raggiungibile.',
      inizio: '2026-12-05T22:00',
      fine: '2026-12-05T23:30',
    });
    assert.ok(ok.ok);
    assert.equal(ok.data.titolo, 'Aggiornamento del database');
    assert.equal(ok.data.inizio.toISOString(), '2026-12-05T21:00:00.000Z');
    assert.equal(ok.data.fine?.toISOString(), '2026-12-05T22:30:00.000Z');
    const aperta = parseAvviso({
      tipo: 'INTERRUZIONE',
      titolo: 'a',
      testo: 'b',
      inizio: '2026-12-05T10:00',
      fine: '',
    });
    assert.ok(aperta.ok && aperta.data.fine === null);
    const e = parseAvviso({
      tipo: 'MANUTENZIONE',
      titolo: '',
      testo: 'b',
      inizio: '2026-12-05T10:00',
      fine: '',
    });
    assert.ok(!e.ok);
    assert.deepEqual(Object.keys(e.errors).sort(), ['fine', 'titolo']);
    const rov = parseAvviso({
      tipo: 'INTERRUZIONE',
      titolo: 'a',
      testo: 'b',
      inizio: '2026-12-05T10:00',
      fine: '2026-12-05T09:00',
    });
    assert.ok(!rov.ok && rov.errors.fine === 'ordine');
    assert.ok(!parseAvviso({ tipo: 'ALTRO', titolo: 'a', testo: 'b', inizio: 'x' }).ok);
  });
});
