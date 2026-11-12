// The company's subscription (#31, #33 — terms 2026-11-12, art. 12): a new company starts a free month, counted
// again from the first acceptance of the terms (the conclusion of the contract); when the period ends the whole
// company is read-only — reading, printing, deleting data and managing (deactivating) people stay, new data and
// new people do not; export stays; not while the change of provider runs. Levels by people (10, 25, over 25):
// invites past the limit are refused (pending invites count). MASTER sets level and end by hand.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  Browser,
  makeAzienda,
  makeUser,
  outbox,
  prisma,
  signedIn,
  startApp,
  stopApp,
} from './harness.js';

const { avviaProva } = await import('../../src/abbonamenti/servizio.js');
const { avvisaScadenze } = await import('../../src/abbonamenti/scadenze.js');
const { mezzanotteRoma } = await import('../../src/master/tempo.js');

before(startApp);
after(stopApp);

const HTML = { accept: 'text/html' };
const GIORNO = 24 * 60 * 60 * 1000;

async function scaduta(nome: string) {
  const azienda = await makeAzienda(nome);
  await prisma.azienda.update({
    where: { id: azienda.id },
    data: { abbonamentoFino: new Date(Date.now() - 1000), abbonamentoLivello: 1 },
  });
  return azienda;
}

const invita = (b: Browser, aziendaId: string, email: string) =>
  b.submit('/utenti/invita', '/utenti/invita', {
    name: 'Persona Invitata',
    email,
    role: 'TECNICO',
    azienda: aziendaId,
  });

describe('the subscription of a company', () => {
  it('gives a new company the free month, counted again from the first acceptance', async () => {
    const { browser: master } = await signedIn('MASTER');
    const reply = await master.upload('/aziende/nuova', '/aziende', { name: 'Prova Nuova Srl' });
    assert.equal(reply.status, 303);
    const id = /\/aziende\/([a-z0-9]+)$/.exec(reply.location)![1]!;
    const nuova = await prisma.azienda.findUniqueOrThrow({ where: { id } });
    assert.equal(nuova.abbonamentoProva, true);
    const giorni = (nuova.abbonamentoFino!.getTime() - Date.now()) / GIORNO;
    assert.ok(giorni > 27 && giorni < 33, `about a month: ${giorni}`);
    // The contract is concluded later (the ADMIN accepts with the code): the month starts there.
    const firma = new Date(Date.now() + 5 * GIORNO);
    await prisma.$transaction((tx) => avviaProva(tx, id, firma));
    const dopo = await prisma.azienda.findUniqueOrThrow({ where: { id } });
    assert.ok(dopo.abbonamentoFino!.getTime() > nuova.abbonamentoFino!.getTime() + 4 * GIORNO);
    // A company without a trial (set by hand, or from before) is not touched.
    const vecchia = await makeAzienda('Prova Vecchia Srl');
    await prisma.$transaction((tx) => avviaProva(tx, vecchia.id, firma));
    assert.equal(
      (await prisma.azienda.findUniqueOrThrow({ where: { id: vecchia.id } })).abbonamentoFino,
      null,
    );
  });

  it('makes an expired company read-only, with its exceptions', async () => {
    const azienda = await scaduta('Scaduta Srl');
    const { browser: tecnico } = await signedIn('TECNICO', azienda.id);
    const lista = await tecnico.get('/schede', HTML);
    assert.equal(lista.status, 200);
    assert.match(lista.body, /L&#39;abbonamento di Scaduta Srl è scaduto/);
    const nuova = await tecnico.get('/schede/nuova', HTML);
    assert.equal(nuova.status, 403);
    assert.match(nuova.body, /Abbonamento scaduto/);
    const post = await tecnico.post('/schede', { indirizzo: 'Via Bloccata 1' });
    assert.equal(post.status, 403);

    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    assert.equal((await admin.get(`/impostazioni?azienda=${azienda.id}`, HTML)).status, 403);
    const pagina = await admin.get(`/impostazioni/abbonamento?azienda=${azienda.id}`, HTML);
    assert.equal(pagina.status, 200);
    assert.match(pagina.body, /Abbonamento scaduto il/);
    assert.equal(
      (await admin.get(`/impostazioni/esportazione?azienda=${azienda.id}`, HTML)).status,
      200,
    );
    // People can be managed (deactivated) but no one new comes in.
    assert.equal((await admin.get('/utenti', HTML)).status, 200);
    const invito = await invita(admin, azienda.id, `nuovo.${Date.now()}@rilievi.test`);
    assert.equal(invito.status, 403);
    assert.match(invito.body, /non si possono invitare nuove persone/);
    assert.equal(await prisma.invite.count({ where: { aziendaId: azienda.id } }), 0);

    // While the change of provider runs the service goes on in full (art. 12.7, 17.3).
    await prisma.azienda.update({
      where: { id: azienda.id },
      data: {
        cambioRichiestoAt: new Date(),
        cambioFineAt: new Date(Date.now() + 10 * GIORNO),
        cambioEsito: 'ALTRO_FORNITORE',
      },
    });
    assert.equal((await tecnico.get('/schede/nuova', HTML)).status, 200);
  });

  it('warns before the end of the trial, with the way to renew for the ADMIN only', async () => {
    const azienda = await makeAzienda('Quasi Finita Srl');
    await prisma.azienda.update({
      where: { id: azienda.id },
      data: { abbonamentoProva: true, abbonamentoFino: new Date(Date.now() + 3 * GIORNO) },
    });
    const { browser: tecnico } = await signedIn('TECNICO', azienda.id);
    const page = await tecnico.get('/schede', HTML);
    assert.match(page.body, /La prova gratuita di Quasi Finita Srl sta per finire/);
    assert.doesNotMatch(page.body, /href="\/impostazioni\/abbonamento/);
    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    assert.match(
      (await admin.get('/schede', HTML)).body,
      /href="\/impostazioni\/abbonamento\?azienda=/,
    );
    // Nothing is blocked during the trial.
    assert.equal((await tecnico.get('/schede/nuova', HTML)).status, 200);
  });

  it('refuses invites past the people of the level, pending invites included', async () => {
    const azienda = await makeAzienda('Dieci Persone Srl');
    await prisma.azienda.update({
      where: { id: azienda.id },
      data: { abbonamentoLivello: 1, abbonamentoFino: new Date(Date.now() + 100 * GIORNO) },
    });
    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    for (let i = 0; i < 8; i += 1) await makeUser('TECNICO', undefined, azienda.id);
    // 9 people: one more invite fills the tenth place, the next one is refused.
    assert.equal(
      (await invita(admin, azienda.id, `decimo.${Date.now()}@rilievi.test`)).status,
      200,
    );
    const troppi = await invita(admin, azienda.id, `undicesimo.${Date.now()}@rilievi.test`);
    assert.equal(troppi.status, 422);
    assert.match(troppi.body, /numero massimo di persone/);
    const pagina = await admin.get(`/impostazioni/abbonamento?azienda=${azienda.id}`, HTML);
    assert.match(pagina.body, /10 su 10/);
    // MASTER is not limited (support), and the next level opens the place.
    const { browser: master } = await signedIn('MASTER');
    assert.equal(
      (await invita(master, azienda.id, `master.${Date.now()}@rilievi.test`)).status,
      200,
    );
    await prisma.azienda.update({ where: { id: azienda.id }, data: { abbonamentoLivello: 2 } });
    assert.equal(
      (await invita(admin, azienda.id, `livello2.${Date.now()}@rilievi.test`)).status,
      200,
    );
  });

  it('lets MASTER set the level and the last day by hand', async () => {
    const azienda = await makeAzienda('Manuale Srl');
    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    const vietato = await admin.submit('/account', `/aziende/${azienda.id}/abbonamento`, {
      livello: '3',
      fino: '2030-01-01',
    });
    assert.equal(vietato.status, 403);
    const { browser: master } = await signedIn('MASTER');
    const pagina = `/aziende/${azienda.id}`;
    // The end MASTER has seen: a payment in between makes the form stale.
    const base = async () =>
      /name="base" value="([^"]*)"/.exec((await master.get(pagina, HTML)).body)?.[1] ?? 'none';
    const primo = await base();
    const ok = await master.submit(pagina, `/aziende/${azienda.id}/abbonamento`, {
      livello: '2',
      fino: '2027-12-31',
      base: primo,
    });
    assert.equal(ok.status, 303);
    let riga = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.equal(riga.abbonamentoLivello, 2);
    assert.equal(
      riga.abbonamentoFino?.toISOString(),
      mezzanotteRoma('2027-12-31', 1).toISOString(),
    );
    assert.equal(riga.abbonamentoProva, false);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'AZIENDA_ABBONAMENTO', aziendaId: azienda.id },
    });
    assert.deepEqual(audit.meta, { origine: 'manuale', livello: 2, ultimoGiorno: '2027-12-31' });
    assert.match((await master.get(pagina, HTML)).body, /value="2027-12-31"/);

    // The page seen before the change: nothing is overwritten.
    const vecchia = await master.submit(pagina, `/aziende/${azienda.id}/abbonamento`, {
      livello: '1',
      fino: '2026-12-31',
      base: primo,
    });
    assert.equal(vecchia.status, 303);
    assert.equal(
      (await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } })).abbonamentoLivello,
      2,
    );
    const male = await master.submit(pagina, `/aziende/${azienda.id}/abbonamento`, {
      livello: '9',
      fino: '2027-02-31',
      base: await base(),
    });
    assert.equal(male.status, 303);
    riga = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.equal(riga.abbonamentoLivello, 2);

    await master.submit(pagina, `/aziende/${azienda.id}/abbonamento`, {
      livello: '',
      fino: '',
      base: await base(),
    });
    riga = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.equal(riga.abbonamentoLivello, null);
    assert.equal(riga.abbonamentoFino, null);
  });

  it('mails the administrators 14 and 3 days before and on the end, once each', async () => {
    const azienda = await makeAzienda('Avvisi Srl');
    const admin = await makeUser('ADMIN', undefined, azienda.id);
    const tecnico = await makeUser('TECNICO', undefined, azienda.id);
    const fine = new Date(Date.now() + 10 * GIORNO);
    await prisma.azienda.update({
      where: { id: azienda.id },
      data: { abbonamentoProva: true, abbonamentoFino: fine },
    });
    const mie = () => outbox.filter((m) => m.to === admin.email);
    await avvisaScadenze();
    assert.equal(mie().length, 1);
    assert.match(mie()[0]!.subject, /La prova gratuita di Avvisi Srl finisce tra 14 giorni/);
    assert.match(mie()[0]!.text, /impostazioni\/abbonamento\?azienda=/);
    await avvisaScadenze();
    assert.equal(mie().length, 1, 'once');
    await avvisaScadenze(new Date(fine.getTime() - 2 * GIORNO));
    assert.equal(mie().length, 2);
    assert.match(mie()[1]!.subject, /tra 3 giorni/);
    await avvisaScadenze(new Date(fine.getTime() + 60 * 60 * 1000));
    assert.equal(mie().length, 3);
    assert.match(mie()[2]!.subject, /è finita/);
    assert.ok(!outbox.some((m) => m.to === tecnico.email), 'only the administrators');
    // A new end (renewed) starts the notices again.
    await prisma.azienda.update({
      where: { id: azienda.id },
      data: {
        abbonamentoProva: false,
        abbonamentoLivello: 1,
        abbonamentoFino: new Date(Date.now() + 13 * GIORNO),
      },
    });
    await avvisaScadenze();
    assert.equal(mie().length, 4);
    assert.match(mie()[3]!.subject, /Il piano di Avvisi Srl scade tra 14 giorni/);
  });
});
