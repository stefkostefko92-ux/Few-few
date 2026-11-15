// The companies that existed when 4.1 went in stay active without a new signature (the owner, 12 November 2026:
// the signature needs a code by email and the mail of the portal is down): the migration marks them with the
// last version of the terms, 2026-11-14, a day before it comes into force. Acceptance criteria:
//  - a company whose accepted version is the one in force OR a later one of the history is not asked to accept;
//  - a company on an older version is asked, as before;
//  - "Richiedi la firma" waits for the day the company's version comes into force (a signature asked before
//    would be for the previous text, and asked again a day later); from that day it works as before.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { STORIA, VERSIONE } from '../../src/legale/versioni.js';
import { makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const HTML = { accept: 'text/html' };
const ULTIMA = STORIA.CONDIZIONI.at(-1)!;

describe('the companies marked with the last version of the terms', () => {
  it('use the portal without being asked, before and after the version comes into force', async () => {
    const a = await makeAzienda('Esistente Srl');
    await prisma.azienda.update({ where: { id: a.id }, data: { condizioniVersione: ULTIMA } });
    for (const ruolo of ['ADMIN', 'TECNICO'] as const) {
      const { browser } = await signedIn(ruolo, a.id);
      const pagina = await browser.get('/schede', HTML);
      assert.equal(pagina.status, 200, `${ruolo}: ${pagina.location ?? ''}`);
    }
    // An older version is not an acceptance of the terms in force.
    const vecchia = await makeAzienda('Vecchia Srl');
    await prisma.azienda.update({
      where: { id: vecchia.id },
      data: { condizioniVersione: STORIA.CONDIZIONI[0]! },
    });
    const { browser } = await signedIn('ADMIN', vecchia.id);
    const chiusa = await browser.get('/schede', HTML);
    assert.equal(chiusa.status, 303);
    assert.match(chiusa.location ?? '', /^\/condizioni\/accetta/);
  });

  it('are asked for the real signature only once their version is in force', async () => {
    const a = await makeAzienda('Da Firmare Srl');
    await prisma.azienda.update({ where: { id: a.id }, data: { condizioniVersione: ULTIMA } });
    const { browser: master } = await signedIn('MASTER');
    const contratti = await master.get('/master/contratti', HTML);
    assert.equal(contratti.status, 200);
    assert.ok(contratti.body.includes(`action="/master/contratti/${a.id}/richiedi"`));
    const esito = await master.submit(
      '/master/contratti',
      `/master/contratti/${a.id}/richiedi`,
      {},
    );
    assert.equal(esito.status, 303);
    const dopo = await prisma.azienda.findUniqueOrThrow({ where: { id: a.id } });
    const pagina = await master.get('/master/contratti', HTML);
    if (VERSIONE.CONDIZIONI !== ULTIMA) {
      // The day before: nothing changes and the console says from which day.
      assert.equal(dopo.condizioniVersione, ULTIMA);
      assert.match(pagina.body, /entra in vigore il \d{1,2} \w+ \d{4}/);
      assert.equal(await prisma.auditLog.count({ where: { action: 'CONDIZIONI_RICHIESTE' } }), 0);
      return;
    }
    assert.equal(dopo.condizioniVersione, null);
    const { browser: admin } = await signedIn('ADMIN', a.id);
    assert.match((await admin.get('/schede', HTML)).location ?? '', /^\/condizioni\/accetta/);
  });
});
