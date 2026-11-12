// The status page /stato (terms 2027-01-12, art. 2.4): public, not indexed, the parts of the Service now and
// the notices of the MASTER — an interruption under way, a planned maintenance, the last 90 days — and the
// recovery objectives. Only the MASTER writes the notices.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

describe('the status page', () => {
  it('is public and not indexed; robots lets it be read', async () => {
    const page = await new Browser().get('/stato');
    assert.equal(page.status, 200);
    assert.match(page.body, /<meta name="robots" content="noindex, nofollow">/);
    assert.match(page.body, /<h1>Stato del servizio<\/h1>/);
    assert.match(page.body, /Il servizio funziona regolarmente\.|una parte ha un problema/);
    assert.match(page.body, /ultime 24 ore/);
    assert.match((await new Browser().get('/robots.txt')).body, /Allow: \/stato\$/);
  });

  it('shows the notices of the MASTER; nobody else writes them', async () => {
    const { browser: master } = await signedIn('MASTER');
    const fra = (h: number) => {
      const d = new Date(Date.now() + h * 3_600_000);
      return new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Rome',
        dateStyle: 'short',
        timeStyle: 'short',
      })
        .format(d)
        .replace(' ', 'T');
    };
    const crea = (form: Record<string, string>) =>
      master.submit('/master/stato', '/master/stato', form);
    assert.equal(
      (
        await crea({
          tipo: 'MANUTENZIONE',
          titolo: 'Aggiornamento',
          testo: 'Il portale si ferma.',
          inizio: fra(48),
          fine: fra(49),
        })
      ).status,
      303,
    );
    assert.equal(
      (
        await crea({
          tipo: 'INTERRUZIONE',
          titolo: 'Email in ritardo',
          testo: 'Le email partono in ritardo.',
          inizio: fra(-1),
          fine: '',
        })
      ).status,
      303,
    );
    assert.equal(
      (await crea({ tipo: 'MANUTENZIONE', titolo: 'x', testo: 'y', inizio: fra(5), fine: '' }))
        .status,
      422,
    );
    const page = await new Browser().get('/stato');
    assert.match(page.body, /Il servizio ha un problema/);
    assert.match(page.body, /Email in ritardo/);
    assert.match(page.body, /Aggiornamento/);
    assert.equal(await prisma.auditLog.count({ where: { action: 'STATO_AVVISO' } }), 2);

    // Closed: in the history, the state is back.
    const aperto = await prisma.avvisoStato.findFirstOrThrow({
      where: { titolo: 'Email in ritardo' },
    });
    const chiudi = await master.submit(`/master/stato/${aperto.id}`, `/master/stato/${aperto.id}`, {
      tipo: 'INTERRUZIONE',
      titolo: 'Email in ritardo',
      testo: 'Risolto.',
      inizio: fra(-1),
      fine: fra(0),
    });
    assert.equal(chiudi.status, 303);
    assert.doesNotMatch((await new Browser().get('/stato')).body, /Il servizio ha un problema/);

    const { browser: admin } = await signedIn('ADMIN');
    assert.equal((await admin.get('/master/stato')).status, 403);
  });
});
