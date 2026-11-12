// The notice of a new version of the terms (conditions art. 18.1; owner, 12 November 2026 — point A2):
// the MASTER announces it once from "Contratti"; every company gets a banner until the version comes into
// force and every ADMIN an email; the announcement is kept for good and logged. The next version and what
// changes are readable at /condizioni/prossima (out of the index) before it applies.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { caricaAnnunci } from '../../src/legale/annunci.js';
import { impostaAnnunci, inVigoreDal, VERSIONE } from '../../src/legale/versioni.js';
import { Browser, outbox, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(async () => {
  impostaAnnunci([]);
  await stopApp();
});

const HTML = { accept: 'text/html' };

describe('announcing the new terms', () => {
  it('shows the next version and what changes, out of the index', async () => {
    const page = await new Browser().get('/condizioni/prossima');
    assert.equal(page.status, 200);
    assert.match(page.body, /<meta name="robots" content="noindex, nofollow">/);
    assert.match(page.body, /Allegato B – Cambio di fornitore/);
    assert.match(page.body, /B\.1<\/a> Oggetto \(nuovo\)/);
    assert.match(page.body, /entra in vigore solo 30 giorni dopo l&#39;annuncio/);
  });

  it('is sent once to every company, with a banner until the version applies and an email', async () => {
    const { browser: admin, user } = await signedIn('ADMIN');
    const { browser: master } = await signedIn('MASTER');
    // An announcement interrupted before its notice went out does not count, and is completed later.
    await prisma.annuncioTesto.create({
      data: { tipo: 'CONDIZIONI', versione: '2027-01-12', annunciatoAt: new Date('2026-11-01') },
    });
    await caricaAnnunci();
    assert.equal(inVigoreDal('CONDIZIONI', '2027-01-12'), null);
    const contratti = await master.get('/master/contratti', HTML);
    assert.match(contratti.body, /Annuncia agli amministratori/);
    const prima = outbox.length;
    const ok = await master.submit('/master/contratti', '/master/contratti/annuncia', {});
    assert.equal(ok.status, 303);
    const riga = await prisma.annuncioTesto.findUniqueOrThrow({
      where: { tipo_versione: { tipo: 'CONDIZIONI', versione: '2027-01-12' } },
    });
    assert.ok(riga.comunicazioneId);
    assert.ok(riga.annunciatoAt > new Date('2026-11-02'), 'counted from the notice actually sent');
    const comunicazione = await prisma.comunicazione.findUniqueOrThrow({
      where: { id: riga.comunicazioneId },
    });
    assert.equal(
      comunicazione.fineAt?.toISOString(),
      inVigoreDal('CONDIZIONI', '2027-01-12')?.toISOString(),
    );
    assert.deepEqual(comunicazione.aziendaIds, []);
    for (let i = 0; i < 250 && !outbox.slice(prima).some((m) => m.to === user.email); i += 1)
      await new Promise((r) => setTimeout(r, 20));
    assert.ok(
      outbox.slice(prima).some((m) => m.to === user.email),
      'the ADMIN gets the email',
    );
    const banner = await admin.get('/schede', HTML);
    assert.match(banner.body, /Nuove Condizioni di servizio dal 12\/01\/2027/);
    assert.equal(VERSIONE.CONDIZIONI, '2026-11-10', 'the current version stays until its day');
    const impostazioni = await admin.get('/impostazioni/condizioni', HTML);
    assert.match(impostazioni.body, /entrerà in vigore il 12\/01\/2027/);

    const ancora = await master.submit('/master/contratti', '/master/contratti/annuncia', {});
    assert.equal(ancora.status, 303);
    assert.equal(await prisma.comunicazione.count(), 1, 'only once');
    // The interrupted announcement above was written by hand, without its log line: nothing new now.
    assert.equal(await prisma.auditLog.count({ where: { action: 'CONDIZIONI_ANNUNCIATE' } }), 0);
    assert.equal((await admin.get('/master/contratti')).status, 403);
  });
});
