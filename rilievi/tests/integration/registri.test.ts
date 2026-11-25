// The GDPR registers in the MASTER console (owner, 12 November 2026 — point A6): the record of processing
// (art. 30(1) and (2)) with the client companies read live from the database, and the register of personal
// data breaches (art. 33(5)): written and corrected by the MASTER only, never deleted, every change logged.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const HTML = { accept: 'text/html' };
const violazione = {
  rilevataAt: '2026-11-12T09:30',
  eventoAt: '',
  titolo: 'PDF inviato a un indirizzo sbagliato',
  rilevazione: 'Segnalazione di un cliente',
  natura: 'Riservatezza',
  ruolo: 'RESPONSABILE',
  categorieDati: 'Nome e firma tracciata',
  interessati: '1 persona',
  aziende: 'Registri Ascensori',
  conseguenze: 'Basse',
  misure: 'Richiesta di cancellazione',
  rischio: 'IMPROBABILE',
  titolariAvvisatiAt: '2026-11-12T11:00',
  autoritaNotificataAt: '',
  autoritaProtocollo: '',
  interessatiAvvisatiAt: '',
  motivazione: 'Rischio improbabile',
  lezioni: '',
  chiusaAt: '',
};

describe('the GDPR registers', () => {
  it('show the record of processing with the client companies, to the MASTER only', async () => {
    await makeAzienda('Registri Ascensori');
    const { browser: master } = await signedIn('MASTER');
    const page = await master.get('/master/registri', HTML);
    assert.equal(page.status, 200);
    assert.match(page.body, /Registro delle categorie di attività svolte come responsabile/);
    assert.match(page.body, /Registri Ascensori/);
    assert.match(page.body, /netcup GmbH/);
    assert.doesNotMatch(page.body, /\{auditGiorni\}|\{anni\}/, 'the periods come from the code');
    const { browser: admin } = await signedIn('ADMIN');
    assert.equal((await admin.get('/master/registri')).status, 403);
    assert.equal((await admin.get('/master/violazioni')).status, 403);
  });

  it('write a breach, refuse a wrong one, correct it, never delete it and log each step', async () => {
    const { browser: master } = await signedIn('MASTER');
    const sbagliata = await master.submit('/master/violazioni/nuova', '/master/violazioni', {
      ...violazione,
      titolo: '',
    });
    assert.equal(sbagliata.status, 422);
    assert.match(sbagliata.body, /Controlla i campi segnati/);
    assert.match(
      sbagliata.body,
      /value="Segnalazione di un cliente"|Segnalazione di un cliente<\/textarea>/,
    );

    const creata = await master.submit(
      '/master/violazioni/nuova',
      '/master/violazioni',
      violazione,
    );
    assert.equal(creata.status, 303);
    const id = creata.location.split('/').pop()!;
    const riga = await prisma.violazione.findUniqueOrThrow({ where: { id } });
    assert.equal(riga.rilevataAt.toISOString(), '2026-11-12T08:30:00.000Z');
    assert.equal(riga.autoritaNotificataAt, null);

    const corretta = await master.submit(`/master/violazioni/${id}`, `/master/violazioni/${id}`, {
      ...violazione,
      chiusaAt: '2026-11-13T10:00',
      lezioni: 'Doppio controllo del destinatario',
    });
    assert.equal(corretta.status, 303);
    assert.ok((await prisma.violazione.findUniqueOrThrow({ where: { id } })).chiusaAt);
    const elenco = await master.get('/master/violazioni', HTML);
    assert.match(elenco.body, /PDF inviato a un indirizzo sbagliato/);
    assert.match(elenco.body, /Chiusa il/);
    assert.deepEqual(
      (
        await prisma.auditLog.findMany({
          where: { targetType: 'violazione', targetId: id },
          orderBy: { at: 'asc' },
        })
      ).map((r) => r.action),
      ['VIOLAZIONE_CREATE', 'VIOLAZIONE_UPDATE'],
    );
    assert.equal((await master.get('/master/violazioni/nessuna')).status, 404);
  });
});
