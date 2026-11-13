// The notice of a new version of the terms (conditions art. 18.1; owner, 12 November 2026 — point A2): the
// MASTER announces the next version once from "Contratti"; every company gets a banner and every ADMIN an email.
// 2026-11-12, 2026-11-13 and 2026-11-14 are in force on their own day (the owner: only his test companies, nothing to
// announce — legale/versioni.ts, SENZA_PREAVVISO): once the last one is in force there is no next version —
// nothing to announce, and the page of the next version goes back to the terms. Until midnight (Rome) of its day
// the last version is "the next one", shown with its date. The dates are tested in tests/versioni.test.ts.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { STORIA, VERSIONE } from '../../src/legale/versioni.js';
import { Browser, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const HTML = { accept: 'text/html' };

describe('announcing the new terms', () => {
  it('has nothing to announce once the last version is in force', async () => {
    const ultima = STORIA.CONDIZIONI.at(-1)!;
    assert.equal(ultima, '2026-11-14');
    const page = await new Browser().get('/condizioni/prossima');
    if (VERSIONE.CONDIZIONI !== ultima) {
      // The evening before: the last version is still "the next one", with what changes — and comes in by itself.
      assert.equal(VERSIONE.CONDIZIONI, '2026-11-13');
      assert.equal(page.status, 200);
      assert.match(page.body, /12\.10 Partita IVA e IVA/);
      return;
    }
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
