// The notice of a new version of the terms (conditions art. 18.1; owner, 12 November 2026 — point A2): the
// MASTER announces the next version once from "Contratti"; every company gets a banner and every ADMIN an email.
// Since 2026-11-12 is in force on its own day (the owner: only his test companies, nothing to announce —
// legale/versioni.ts, SENZA_PREAVVISO) there is no next version now: nothing to announce, and the page of the
// next version goes back to the terms. The dates of a future announcement are tested in tests/versioni.test.ts.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { VERSIONE } from '../../src/legale/versioni.js';
import { Browser, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const HTML = { accept: 'text/html' };

describe('announcing the new terms', () => {
  it('has nothing to announce while 2026-11-12 is the last version', async () => {
    assert.equal(VERSIONE.CONDIZIONI, '2026-11-12');
    const page = await new Browser().get('/condizioni/prossima');
    assert.equal(page.status, 303);
    assert.equal(page.location, '/condizioni');
    const { browser: master } = await signedIn('MASTER');
    const contratti = await master.get('/master/contratti', HTML);
    assert.equal(contratti.status, 200);
    assert.doesNotMatch(contratti.body, /Annuncia agli amministratori/);
    const tentativo = await master.submit('/account', '/master/contratti/annuncia', {});
    assert.equal(tentativo.status, 303);
    assert.equal(await prisma.annuncioTesto.count(), 0);
    assert.equal(await prisma.comunicazione.count(), 0);
    const { browser: admin } = await signedIn('ADMIN');
    assert.equal((await admin.get('/master/contratti')).status, 403);
  });

  it('shows the terms in force with the subscription clauses', async () => {
    const page = await new Browser().get('/condizioni');
    assert.equal(page.status, 200);
    assert.match(page.body, /12\.5 Sola lettura/);
    assert.match(page.body, /12\.9 Rimborsi/);
    assert.match(page.body, /Allegato B – Cambio di fornitore/);
  });
});
