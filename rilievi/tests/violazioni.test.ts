// The register of personal-data breaches (GDPR art. 33(5); owner, 12 November 2026 — point A6): every
// breach is written down, also the ones not notified, with what happened, whom it touches, the risk, the
// measures and who was told when. The form is checked on the server; times are typed in Rome time.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { leggiViolazione, scadenza72h } from '../src/master/violazioni-form.js';
import { inputRoma, momentoRoma } from '../src/master/tempo.js';

const base = {
  rilevataAt: '2026-11-12T09:30',
  eventoAt: '',
  titolo: 'Email con PDF a destinatario sbagliato',
  rilevazione: 'Segnalazione del cliente',
  natura: 'Riservatezza: un foglio di intervento inviato a un indirizzo errato.',
  ruolo: 'RESPONSABILE',
  categorieDati: 'Nome del cliente firmatario, indirizzo dell’impianto, firma tracciata',
  interessati: '1 persona',
  aziende: 'Ascensori Esempio S.r.l.',
  conseguenze: 'Basse',
  misure: 'Richiesta di cancellazione al destinatario',
  rischio: 'IMPROBABILE',
  titolariAvvisatiAt: '2026-11-12T11:00',
  autoritaNotificataAt: '',
  autoritaProtocollo: '',
  interessatiAvvisatiAt: '',
  motivazione: 'Rischio improbabile: nessuna notifica all’autorità.',
  lezioni: '',
  chiusaAt: '',
};

describe('the breach register form', () => {
  it('reads Rome time both ways, across summer time', () => {
    assert.equal(momentoRoma('2026-11-12T09:30')?.toISOString(), '2026-11-12T08:30:00.000Z');
    assert.equal(momentoRoma('2026-07-01T09:30')?.toISOString(), '2026-07-01T07:30:00.000Z');
    assert.equal(momentoRoma('2026-02-30T09:30'), null);
    assert.equal(momentoRoma('domani'), null);
    assert.equal(inputRoma(new Date('2026-11-12T08:30:00Z')), '2026-11-12T09:30');
  });

  it('accepts a complete entry and keeps empty optional fields as null', () => {
    const esito = leggiViolazione(base);
    assert.ok(esito.ok);
    assert.equal(esito.dati.rilevataAt.toISOString(), '2026-11-12T08:30:00.000Z');
    assert.equal(esito.dati.eventoAt, null);
    assert.equal(esito.dati.autoritaProtocollo, null);
    assert.equal(esito.dati.ruolo, 'RESPONSABILE');
  });

  it('names every wrong field: missing text, unknown choice, impossible time, closed before found', () => {
    const esito = leggiViolazione({
      ...base,
      titolo: '  ',
      rischio: 'ALTO',
      rilevataAt: '2026-13-01T10:00',
      chiusaAt: '2026-11-01T10:00',
    });
    assert.equal(esito.ok, false);
    if (esito.ok) return;
    assert.deepEqual(Object.keys(esito.errori).sort(), ['rilevataAt', 'rischio', 'titolo']);
    const chiusa = leggiViolazione({ ...base, chiusaAt: '2026-11-11T10:00' });
    assert.equal(chiusa.ok, false);
    if (!chiusa.ok) assert.deepEqual(Object.keys(chiusa.errori), ['chiusaAt']);
  });

  it('tells the 72 hours of art. 33(1) from the moment of discovery', () => {
    assert.equal(
      scadenza72h(new Date('2026-11-12T08:30:00Z')).toISOString(),
      '2026-11-15T08:30:00.000Z',
    );
  });
});
