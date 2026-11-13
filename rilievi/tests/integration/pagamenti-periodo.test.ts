// The plan bought and its period (#31 — terms 2026-11-12, art. 12.1, 12.3, 12.4), end to end with the fake
// Revolut: the offer sealed is the one the person has seen (another VAT number → the new offer first, nothing
// charged); a second click on the same offer goes to the same Revolut page; a higher level starts at once with
// the paid days left turned into days of the new level; a lower one waits for the end of the plan running now;
// one plan in the queue at a time. The maintenance expires an old payment only when Revolut says it is unpaid,
// and moves the queued plans that have started.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  avviaRevolutFinto,
  CHIAVE,
  fermaRevolutFinto,
  ordineDa,
  ordini,
  SEGRETO_WEBHOOK,
} from './revolut-finto.js';

await avviaRevolutFinto();
const { makeAzienda, prisma, signedIn, startApp, stopApp } = await import('./harness.js');
const { cifraRevolut } = await import('../../src/auth/chiavi.js');
const { riconciliaInSospeso } = await import('../../src/pagamenti/riconcilia.js');
const { avviaPianiInCoda } = await import('../../src/abbonamenti/servizio.js');
const { scadenzaDopoMesi } = await import('../../src/abbonamenti/regole.js');

before(async () => {
  await startApp();
  await prisma.configPagamenti.create({
    data: {
      id: 'revolut',
      attivo: true,
      ambiente: 'SANDBOX',
      chiaveEnc: cifraRevolut(CHIAVE),
      webhookId: 'wh-1',
      webhookSegretoEnc: cifraRevolut(SEGRETO_WEBHOOK),
    },
  });
});
after(async () => {
  await stopApp();
  await fermaRevolutFinto();
});

const HTML = { accept: 'text/html' };
const GIORNO = 24 * 60 * 60 * 1000;
const dati = { ragioneSociale: 'Ascensori Bianchi S.r.l.', sede: 'Via Po 2, Torino' };
const hashDi = (body: string) => /name="hash" value="([0-9a-f]{64})"/.exec(body)?.[1] ?? '';

const piano = (livello: number, mesi: number, prezzoCent: number) =>
  prisma.pianoAbbonamento.create({ data: { livello, mesi, prezzoCent } });

/** A company on a paid plan of `livello` until `fine`, bought on Revolut (the payment behind it). */
async function pagata(nome: string, livello: number, inizio: Date, fine: Date, prezzoCent: number) {
  const a = await makeAzienda(nome);
  await prisma.azienda.update({
    where: { id: a.id },
    data: {
      abbonamentoLivello: livello,
      abbonamentoFino: fine,
      abbonamentoProva: false,
      // The billing data saved in the settings: the offer page shows them, the form sends them back.
      datiSocietari: {
        ragioneSociale: dati.ragioneSociale,
        indirizzo: dati.sede,
        partitaIva: '01234567897',
      },
    },
  });
  await prisma.pagamento.create({
    data: {
      aziendaId: a.id,
      aziendaNome: nome,
      livello,
      mesi: 12,
      imponibileCent: prezzoCent,
      ivaCent: 0,
      totaleCent: prezzoCent,
      regimeIva: 'inversione',
      ...dati,
      partitaIva: 'IT01234567897',
      stato: 'COMPLETATO',
      ambiente: 'SANDBOX',
      revolutOrderId: randomUUID(),
      completatoAt: inizio,
      inizio,
      fine,
    },
  });
  const { browser } = await signedIn('ADMIN', a.id);
  return { a, browser };
}

describe('the offer and the period of a plan', () => {
  it('seals only the offer the person has seen, and a second click reuses the order', async () => {
    const a = await makeAzienda('Vista Srl');
    await prisma.azienda.update({
      where: { id: a.id },
      data: { abbonamentoProva: true, abbonamentoFino: new Date(Date.now() + 5 * GIORNO) },
    });
    const { browser } = await signedIn('ADMIN', a.id);
    const p = await piano(1, 12, 29000);
    const vista = await browser.get(
      `/impostazioni/abbonamento/offerta?azienda=${a.id}&piano=${p.id}`,
      HTML,
    );
    const hashVisto = hashDi(vista.body);
    assert.ok(hashVisto);
    const campi = { azienda: a.id, piano: p.id, ...dati, accetto: 'si' };
    // Seen with an Italian VAT number (reverse charge), sent with a Bulgarian one (20 % VAT): the new offer.
    const bg = await browser.submit('/account', '/impostazioni/abbonamento/paga', {
      ...campi,
      partitaIva: 'BG208725181',
      hash: hashVisto,
    });
    assert.equal(bg.status, 409);
    assert.match(bg.body, /Abbiamo aggiornato l&#39;offerta/);
    assert.match(bg.body, /IVA bulgara 20 %/);
    assert.equal(await prisma.pagamento.count({ where: { aziendaId: a.id } }), 0);
    const hashBg = hashDi(bg.body);
    const uno = await browser.submit('/account', '/impostazioni/abbonamento/paga', {
      ...campi,
      partitaIva: 'BG208725181',
      hash: hashBg,
    });
    assert.equal(uno.status, 303);
    assert.equal(ordineDa(uno.location).amount, 34800);
    const due = await browser.submit('/account', '/impostazioni/abbonamento/paga', {
      ...campi,
      partitaIva: 'BG208725181',
      hash: hashBg,
    });
    assert.equal(due.location, uno.location);
    assert.equal(await prisma.pagamento.count({ where: { aziendaId: a.id } }), 1);
  });

  it('starts a higher level at once and turns the paid days left into days of it', async () => {
    const inizio = new Date(Date.now() - 30 * GIORNO);
    const fine = new Date(Date.now() + 335 * GIORNO);
    const { a, browser } = await pagata('Sale Srl', 1, inizio, fine, 36500);
    const p = await piano(2, 12, 73000);
    const vista = await browser.get(
      `/impostazioni/abbonamento/offerta?azienda=${a.id}&piano=${p.id}`,
      HTML,
    );
    assert.match(vista.body, /Giorni già pagati: i 33[45] giorni/);
    assert.match(vista.body, /Il piano inizia alla conferma del pagamento/);
    const via = await browser.submit('/account', '/impostazioni/abbonamento/paga', {
      azienda: a.id,
      piano: p.id,
      ...dati,
      partitaIva: '01234567897',
      accetto: 'si',
      hash: hashDi(vista.body),
    });
    assert.equal(via.status, 303);
    const ordine = ordineDa(via.location);
    ordine.state = 'completed';
    await browser.get(`/impostazioni/abbonamento/esito/${ordine.reference}`, HTML);
    const dopo = await prisma.azienda.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(dopo.abbonamentoLivello, 2);
    assert.equal(dopo.abbonamentoCambioAt, null);
    // About 335 days at 365 € a year are worth about 167 days at 730 € a year: the end moves on by them.
    const extra =
      (dopo.abbonamentoFino!.getTime() - scadenzaDopoMesi(null, 12, new Date()).getTime()) / GIORNO;
    assert.ok(extra >= 165 && extra <= 169, String(extra));
    const fatto = await prisma.pagamento.findUniqueOrThrow({ where: { id: ordine.reference } });
    assert.ok(fatto.creditoCent >= 33400 && fatto.creditoCent <= 33600, String(fatto.creditoCent));
  });

  it('queues a lower level after the plan running now, one plan at a time', async () => {
    const fine = new Date(Date.now() + 100 * GIORNO);
    const { a, browser } = await pagata(
      'Scende Srl',
      2,
      new Date(Date.now() - 200 * GIORNO),
      fine,
      49000,
    );
    const p = await piano(1, 1, 2900);
    const vista = await browser.get(
      `/impostazioni/abbonamento/offerta?azienda=${a.id}&piano=${p.id}`,
      HTML,
    );
    assert.match(vista.body, /alla fine del piano attuale/);
    const via = await browser.submit('/account', '/impostazioni/abbonamento/paga', {
      azienda: a.id,
      piano: p.id,
      ...dati,
      partitaIva: '01234567897',
      accetto: 'si',
      hash: hashDi(vista.body),
    });
    const ordine = ordineDa(via.location);
    ordine.state = 'completed';
    await browser.get(`/impostazioni/abbonamento/esito/${ordine.reference}`, HTML);
    const dopo = await prisma.azienda.findUniqueOrThrow({ where: { id: a.id } });
    // The paid level 2 stays until its end; level 1 from then.
    assert.equal(dopo.abbonamentoLivello, 2);
    assert.equal(dopo.abbonamentoCambioAt?.toISOString(), fine.toISOString());
    assert.equal(dopo.abbonamentoCambioLivello, 1);
    // Another plan while this one waits: not offered.
    const altro = await browser.get(
      `/impostazioni/abbonamento/offerta?azienda=${a.id}&piano=${p.id}`,
      HTML,
    );
    assert.equal(altro.status, 303);
    const sezione = await browser.get(`/impostazioni/abbonamento?azienda=${a.id}`, HTML);
    assert.doesNotMatch(sezione.body, /\/impostazioni\/abbonamento\/offerta\?/);
    assert.match(sezione.body, /Piano acquistato: livello 1 dal/);
    // The day comes: the maintenance moves it into place.
    await prisma.azienda.update({
      where: { id: a.id },
      data: { abbonamentoCambioAt: new Date(Date.now() - 1000) },
    });
    assert.ok((await avviaPianiInCoda()) >= 1);
    const ora = await prisma.azienda.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(ora.abbonamentoLivello, 1);
    assert.equal(ora.abbonamentoCambioAt, null);
  });

  it('expires an old payment only when Revolut says it is unpaid', async () => {
    const a = await makeAzienda('Vecchio Srl');
    const vecchio = new Date(Date.now() - 8 * GIORNO);
    const nuovo = async (orderId: string) =>
      prisma.pagamento.create({
        data: {
          aziendaId: a.id,
          aziendaNome: 'Vecchio Srl',
          livello: 1,
          mesi: 1,
          imponibileCent: 2900,
          ivaCent: 0,
          totaleCent: 2900,
          regimeIva: 'inversione',
          ...dati,
          partitaIva: 'IT01234567897',
          ambiente: 'SANDBOX',
          revolutOrderId: orderId,
          createdAt: vecchio,
        },
      });
    const letto = randomUUID();
    ordini.set(letto, {
      id: letto,
      state: 'pending',
      amount: 2900,
      currency: 'EUR',
      reference: '',
      redirect: '',
    });
    const pNonPagato = await nuovo(letto);
    // An order Revolut does not answer for (another key, an outage): it may be paid — it stays.
    const pIgnoto = await nuovo(randomUUID());
    await riconciliaInSospeso();
    assert.equal(
      (await prisma.pagamento.findUniqueOrThrow({ where: { id: pNonPagato.id } })).stato,
      'SCADUTO',
    );
    assert.equal(
      (await prisma.pagamento.findUniqueOrThrow({ where: { id: pIgnoto.id } })).stato,
      'IN_ATTESA',
    );
  });
});
