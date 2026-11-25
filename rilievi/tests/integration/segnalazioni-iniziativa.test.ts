// A moderation case opened by the provider itself (terms 2026-11-14, art. 25.6; art. 17 of Regulation (EU)
// 2022/2065): the statement of reasons is owed to the company also when the measure does not come from a report,
// and when an account is suspended because of its content. Acceptance criteria:
//  - only MASTER opens it, with where the content is and why; a text too short opens nothing;
//  - the case has no reporter: nobody is written to but the administrators of the company, who read that the
//    decision comes from a check of our own initiative.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { makeAzienda, outbox, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const HTML = { accept: 'text/html' };

async function attendiPosta(test: (m: { to: string; subject: string; text: string }) => boolean) {
  for (let i = 0; i < 40 && !outbox.some(test); i += 1) await new Promise((r) => setTimeout(r, 50));
  return outbox.find(test);
}

describe('a moderation case of our own initiative', () => {
  it('is opened by MASTER without a reporter, and gives the company the reasons', async () => {
    // Terms 2026-11-14, art. 25.6 (art. 17 DSA): the reasons are owed also when the measure does not come from a
    // report — and when an account is suspended because of its content.
    const azienda = await makeAzienda('Iniziativa Srl');
    const admin = await signedIn('ADMIN', azienda.id);
    const { browser } = await signedIn('MASTER');
    const elenco = await browser.get('/master/segnalazioni', HTML);
    assert.match(elenco.body, /Verifica di nostra iniziativa/);
    const prima = await prisma.segnalazione.count();
    const breve = await browser.submit('/master/segnalazioni', '/master/segnalazioni/iniziativa', {
      dove: 'Scheda n. 7 di Iniziativa Srl, foto 2',
      motivo: 'breve',
    });
    assert.equal(breve.status, 303);
    assert.equal(await prisma.segnalazione.count(), prima);
    outbox.length = 0;
    const via = await browser.submit('/master/segnalazioni', '/master/segnalazioni/iniziativa', {
      dove: 'Scheda n. 7 di Iniziativa Srl, foto 2',
      motivo: 'La foto mostra un documento di identità leggibile.',
    });
    assert.equal(via.status, 303);
    const s = await prisma.segnalazione.findFirstOrThrow({ where: { iniziativa: true } });
    assert.equal(via.location, `/master/segnalazioni/${s.id}`);
    assert.deepEqual([s.stato, s.nome, s.email, s.minori], ['IN_ESAME', null, null, false]);
    const scheda = `/master/segnalazioni/${s.id}`;
    assert.match(
      (await browser.get(scheda, HTML)).body,
      /Nessun segnalante: verifica di nostra iniziativa/,
    );
    const decisa = await browser.submit(scheda, `${scheda}/decisione`, {
      esito: 'LIMITATO',
      motivazione: "Il documento di identità non serve al rilievo dell'impianto.",
      azienda: azienda.id,
      misura:
        "Sospensione dell'account che ha caricato la foto, per 30 giorni; foto non più visibile.",
      fatti: 'Nella foto si legge un documento di identità completo.',
      fondamento: 'Art. 4.4 delle Condizioni generali di servizio; art. 5 GDPR.',
    });
    assert.equal(decisa.status, 303, decisa.body.slice(0, 400));
    const allAzienda = await attendiPosta(
      (m) => m.to === admin.user.email && /i motivi/.test(m.subject),
    );
    assert.ok(allAzienda);
    assert.match(allAzienda.text, /una verifica di nostra iniziativa/);
    assert.match(allAzienda.text, /Sospensione dell'account/);
    // Nobody reported: nobody else is written to.
    assert.ok(outbox.every((m) => m.to === admin.user.email));
  });

  it('is not for the administrators of a company', async () => {
    const { browser } = await signedIn('ADMIN');
    const no = await browser.submit('/account', '/master/segnalazioni/iniziativa', {
      dove: 'Scheda n. 1, foto 1',
      motivo: 'Un motivo abbastanza lungo da passare il controllo.',
    });
    assert.equal(no.status, 403);
    assert.equal(await prisma.segnalazione.count({ where: { iniziativa: true } }), 1);
  });
});
