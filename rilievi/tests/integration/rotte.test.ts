// Every POST route of the portal, read from the router itself and tried four ways (the audit of 12 November
// 2026: about 120 routes keep their guards by hand and nothing checked that the next one does):
// - without a session nothing is written (the sign-in page, or a refusal);
// - with a session but without the CSRF token: refused;
// - what belongs to the owner of the portal (the console, the companies, the access requests) refuses the ADMIN
//   of a company, also with a valid token;
// - the ADMIN of a company whose subscription has ended is refused everywhere, except the routes listed here
//   one by one with their reason (terms 2026-11-12, art. 12.5 and 4.1; Data Act) — a new route that writes must
//   be refused too, or be added to that list on purpose.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { concreto, rottePost } from './rotte.js';

const h = await import('./harness.js');
const { Browser, makeAzienda, prisma, signedIn, startApp, stopApp } = h;
const { createServer } = await import('../../src/server.js');

before(startApp);
after(stopApp);

/** Signing out ends the session the walk is using: tried in its own test (auth.test.ts). */
const rotte = rottePost(createServer()).filter((r) => r !== '/esci');

/** A signed-in browser with its token, renewed before the limit of writes per account (60 a minute). */
function sessioni(role: 'MASTER' | 'ADMIN', aziendaId?: string) {
  let usate = 0;
  let corrente: { browser: InstanceType<typeof Browser>; csrf: string } | null = null;
  return async () => {
    if (!corrente || usate % 40 === 0) {
      const { browser } = await signedIn(role, aziendaId);
      corrente = { browser, csrf: await browser.csrf('/account') };
    }
    usate += 1;
    return corrente;
  };
}

/** Not refused without a token, each for its reason. */
const SENZA_TOKEN: Record<string, number> = {
  // Its own signature (HMAC of the raw body), no session at all.
  '/webhook/revolut': 401,
  // The scheda is looked up before the body is read (nothing reaches the disk for a scheda not in scope);
  // the token is checked right after the multipart body (allegati.test.ts).
  '/schede/:id/allegati': 404,
};

/** What an expired company may still reach — everything else answers 403. */
const ANCHE_SCADUTA = new Set([
  '/webhook/revolut',
  // The person's own account and notices: not data of the company.
  '/novita/lette',
  '/comunicazioni/:id/chiudi',
  '/condizioni/accetta',
  '/condizioni/firma',
  '/condizioni/firma/nuovo-codice',
  '/account/esterno/:fornitore/collega',
  '/account/esterno/:fornitore/scollega',
  '/account/password',
  '/account/profilo',
  '/account/colori',
  '/account/colori/ripristina',
  '/account/2fa/avvia',
  '/account/2fa/conferma',
  '/account/2fa/codici',
  '/account/2fa/disattiva',
  // Deleting data stays (art. 12.5 c, A.9). The trash: restoring a real scheda is refused in its handler
  // (sola-lettura-diritti.test.ts) — here the scheda does not exist.
  '/schede/:id/elimina',
  '/schede/:id/allegati/:aid/elimina',
  '/cestino/:id/ripristina',
  '/cestino/:id/elimina',
  '/calcolo-argano/:id/elimina',
  '/calcolo-limitatore/:id/elimina',
  '/cartelli/:id/elimina',
  '/buoni/:id/elimina',
  // Taking access away stays (art. 4.1).
  '/impostazioni/api/:id/revoca',
  '/impostazioni/accesso/disattiva',
  // Managing people stays, to switch off who is no longer authorised (art. 4.1); a new invite and switching
  // someone on again are refused in the service (abbonamenti.test.ts, sola-lettura-diritti.test.ts).
  '/utenti/invita',
  '/utenti/inviti/:id/revoca',
  '/utenti/:id/account',
  '/utenti/:id/stato',
  '/utenti/:id/reimposta',
  '/utenti/:id/due-fattori',
  '/utenti/:id/aziende/:azienda/ruolo',
  '/utenti/:id/aziende',
  '/utenti/:id/aziende/:azienda/rimuovi',
  // The export and the change of provider (Data Act), and paying to open the company again.
  '/impostazioni/esportazione/scarica',
  '/impostazioni/esportazione/esito',
  '/impostazioni/esportazione/cambio',
  '/impostazioni/esportazione/proroga',
  '/impostazioni/esportazione/annulla',
  '/impostazioni/abbonamento/paga',
]);

const DEL_PORTALE = /^\/(master\/|aziende(\/|$)|richieste\/)/;

describe('every POST route', () => {
  it('is found by the walk, and the lists name only routes that exist', () => {
    assert.ok(rotte.length > 100, `only ${rotte.length} routes found`);
    for (const r of [...ANCHE_SCADUTA, ...Object.keys(SENZA_TOKEN)])
      assert.ok(rotte.includes(r), `${r} is listed but is not a route any more`);
    assert.ok(rotte.filter((r) => DEL_PORTALE.test(r)).length > 25);
  });

  it('writes nothing without a session', async () => {
    for (const r of rotte) {
      // A browser (and a network) of its own each time: the limit per network would answer first.
      const reply = await new Browser().post(concreto(r), {});
      assert.ok([302, 303, 401, 403].includes(reply.status), `${r}: ${reply.status}`);
      if (reply.status === 302 || reply.status === 303)
        assert.match(reply.location, /^\/accesso(\?|$)/, `${r} → ${reply.location}`);
    }
  });

  it('is refused without the CSRF token, also for the owner of the portal', async () => {
    const master = sessioni('MASTER');
    for (const r of rotte) {
      const { browser } = await master();
      const reply = await browser.post(concreto(r), {});
      assert.equal(reply.status, SENZA_TOKEN[r] ?? 403, r);
    }
  });

  it('keeps the console, the companies and the requests for the owner of the portal', async () => {
    const admin = sessioni('ADMIN');
    for (const r of rotte.filter((x) => DEL_PORTALE.test(x))) {
      const { browser, csrf } = await admin();
      const reply = await browser.post(concreto(r), { _csrf: csrf });
      assert.equal(reply.status, 403, r);
    }
  });

  it('refuses a company whose subscription has ended, except what the terms leave it', async () => {
    const scaduta = await makeAzienda('Scaduta Rotte Srl');
    await prisma.azienda.update({
      where: { id: scaduta.id },
      data: { abbonamentoFino: new Date(Date.now() - 1000), abbonamentoLivello: 1 },
    });
    const admin = sessioni('ADMIN', scaduta.id);
    let rifiutate = 0;
    for (const r of rotte.filter((x) => !ANCHE_SCADUTA.has(x))) {
      const { browser, csrf } = await admin();
      const reply = await browser.post(concreto(r), { _csrf: csrf, azienda: scaduta.id });
      assert.equal(reply.status, 403, r);
      if (/Abbonamento scaduto/.test(reply.body)) rifiutate += 1;
    }
    // The routes that write the company's data say why.
    assert.ok(rifiutate >= 40, `only ${rifiutate} routes named the subscription`);
    assert.equal(await prisma.scheda.count({ where: { aziendaId: scaduta.id } }), 0);
  });
});
