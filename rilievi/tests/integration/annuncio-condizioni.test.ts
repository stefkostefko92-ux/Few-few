// The notice of a new version of the terms (conditions art. 18.1; owner, 12 November 2026 — point A2): the
// MASTER announces the next version once from "Contratti"; every company gets a banner and every ADMIN an email.
// 2026-11-12, 2026-11-13 and 2026-11-14 were in force on their own day (the owner: only his test companies, nothing
// to announce — legale/versioni.ts, SENZA_PREAVVISO); 2026-12-14 comes in only announced. The dates are tested in
// tests/versioni.test.ts.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { STORIA, VERSIONE } from '../../src/legale/versioni.js';
import { Browser, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const HTML = { accept: 'text/html' };

describe('announcing the new terms', () => {
  it('offers the next version for the announcement, then announces it once', async () => {
    // 2026-12-14 (the owner, 14 November 2026 — the customers registry, quotes turned off, the notice in the
    // quote) comes in only announced: it is the next version, shown with what changes, and the console offers
    // the announcement until it is done — once.
    assert.equal(VERSIONE.CONDIZIONI, '2026-11-14');
    assert.equal(STORIA.CONDIZIONI.at(-1), '2026-12-14');
    const prossima = await new Browser().get('/condizioni/prossima');
    assert.equal(prossima.status, 200);
    assert.match(prossima.body, /2\.5 I preventivi, con il listino prezzi/);
    const { browser: admin } = await signedIn('ADMIN');
    assert.equal((await admin.get('/master/contratti')).status, 403);
    const { browser: master } = await signedIn('MASTER');
    const contratti = await master.get('/master/contratti', HTML);
    assert.equal(contratti.status, 200);
    assert.match(contratti.body, /Annuncia agli amministratori/);
    const annuncio = await master.submit('/master/contratti', '/master/contratti/annuncia', {});
    assert.equal(annuncio.status, 303);
    assert.equal(await prisma.annuncioTesto.count(), 1);
    assert.equal(await prisma.comunicazione.count(), 1);
    // Once: nothing more to announce, a second try writes nothing.
    assert.doesNotMatch(
      (await master.get('/master/contratti', HTML)).body,
      /Annuncia agli amministratori/,
    );
    await master.submit('/master/contratti', '/master/contratti/annuncia', {});
    assert.equal(await prisma.annuncioTesto.count(), 1);
  });

  it('shows the terms in force with the subscription clauses', async () => {
    const page = await new Browser().get('/condizioni');
    assert.equal(page.status, 200);
    assert.match(page.body, /12\.5 Sola lettura/);
    assert.match(page.body, /12\.9 Rimborsi/);
    assert.match(page.body, /Allegato B – Cambio di fornitore/);
  });
});
