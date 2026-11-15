// Refunds and disputes through Revolut (terms 2026-11-13, art. 12.9: the refund goes "sullo stesso mezzo di
// pagamento"; the official OpenAPI 2026-08-17: POST /api/orders/{id}/refund, the DISPUTE_* events, GET
// /api/disputes/{id}), end to end with the fake Revolut. Acceptance criteria:
//  - only MASTER, only with the password: a stolen session moves no money;
//  - the refund due is ordered on the order of the payment; what exceeds what was paid there (an upgrade paid
//    partly with the credit of earlier payments) goes on the orders the credit came from — never more than paid;
//  - our id of the refund is the Idempotency-Key: an answer that never arrives is asked again with the same key
//    and Revolut holds ONE refund;
//  - the payment becomes "rimborsato" only when Revolut says the refund is completed (at once, by the signed
//    webhook or by the maintenance) — then the payer is written to; a refused refund changes nothing and is said;
//  - a payment that waits for MASTER ("da verificare") is given back in full the same way.
// The disputes and the webhook registration: pagamenti-contestazioni.test.ts.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { attendiDiscord, discord, WEBHOOK_DISCORD } from './esterni-finti.js';
import {
  avviaRevolutFinto,
  CHIAVE,
  eventoFirmato,
  fermaRevolutFinto,
  ordineDa,
  rimborsi,
  rimborsiDi,
  SEGRETO_WEBHOOK,
} from './revolut-finto.js';

await avviaRevolutFinto();
const h = await import('./harness.js');
const { BASE, Browser, makeAzienda, outbox, PASSWORD, prisma, signedIn, startApp, stopApp } = h;
const { cifraAllarmi, cifraRevolut } = await import('../../src/auth/chiavi.js');
const { rimborsiDovuti } = await import('../../src/pagamenti/rimborsi.js');
const { riconciliaRimborsi } = await import('../../src/pagamenti/rimborsi-riconcilia.js');

let master: Awaited<ReturnType<typeof signedIn>>;

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
  await prisma.configAllarmi.create({
    data: { id: 'discord', attivo: true, urlEnc: cifraAllarmi(WEBHOOK_DISCORD) },
  });
  master = await signedIn('MASTER');
});
after(async () => {
  await stopApp();
  await fermaRevolutFinto();
});

const HTML = { accept: 'text/html' };
const GIORNO = 24 * 60 * 60 * 1000;
const CONSOLE = '/master/pagamenti';
const dati = {
  ragioneSociale: 'Ascensori Verdi S.r.l.',
  sede: 'Via Dante 3, Bologna',
  partitaIva: '01234567897',
};
const hashDi = (body: string) => /name="hash" value="([0-9a-f]{64})"/.exec(body)?.[1] ?? '';

async function inProva(nome: string) {
  const a = await makeAzienda(nome);
  await prisma.azienda.update({
    where: { id: a.id },
    data: {
      abbonamentoProva: true,
      abbonamentoFino: new Date(Date.now() + 10 * GIORNO),
      datiSocietari: {
        ragioneSociale: dati.ragioneSociale,
        indirizzo: dati.sede,
        partitaIva: dati.partitaIva,
      },
    },
  });
  const { browser, user } = await signedIn('ADMIN', a.id);
  return { a, browser, user };
}

const piano = (livello: number, mesi: number, prezzoCent: number) =>
  prisma.pianoAbbonamento.create({ data: { livello, mesi, prezzoCent } });

/** Accepts the offer, pays it on the fake Revolut and comes back: the payment as the portal holds it. */
async function paga(b: InstanceType<typeof Browser>, aziendaId: string, pianoId: string) {
  const vista = await b.get(
    `/impostazioni/abbonamento/offerta?azienda=${aziendaId}&piano=${pianoId}`,
    HTML,
  );
  assert.equal(vista.status, 200, vista.body.slice(0, 300));
  const esito = await b.submit('/account', '/impostazioni/abbonamento/paga', {
    azienda: aziendaId,
    piano: pianoId,
    ...dati,
    accetto: 'si',
    hash: hashDi(vista.body),
  });
  assert.equal(esito.status, 303, esito.body.slice(0, 300));
  const ordine = ordineDa(esito.location);
  ordine.state = 'completed';
  await b.get(`/impostazioni/abbonamento/esito/${ordine.reference}`, HTML);
  return {
    ordine,
    pagamento: await prisma.pagamento.findUniqueOrThrow({ where: { id: ordine.reference } }),
  };
}

const spegni = (aziendaId: string) =>
  master.browser.submit(`/aziende/${aziendaId}`, `/aziende/${aziendaId}/stato`, { active: '0' });

const rimborsa = (pagamentoId: string, importo: string, password: string = PASSWORD) =>
  master.browser.submit(CONSOLE, `${CONSOLE}/${pagamentoId}/rimborso-revolut`, {
    importo,
    password,
  });

const notifica = (evento: string, id: string) => {
  const ev = eventoFirmato(evento, id);
  return fetch(`${BASE}/webhook/revolut`, { method: 'POST', headers: ev.headers, body: ev.body });
};

async function attendiPosta(test: (m: { to: string; subject: string; text: string }) => boolean) {
  for (let i = 0; i < 40 && !outbox.some(test); i += 1) await new Promise((r) => setTimeout(r, 50));
  return outbox.some(test);
}

describe('a refund through Revolut', () => {
  it('needs the password, waits for Revolut and then closes the payment and writes to the payer', async () => {
    const { a, browser, user } = await inProva('Rimborso Uno Srl');
    const { ordine, pagamento } = await paga(browser, a.id, (await piano(1, 12, 29000)).id);
    await spegni(a.id);
    const [dovuto] = (await rimborsiDovuti()).filter((r) => r.aziendaId === a.id);
    assert.equal(dovuto?.dovutoCent, 29000);
    // The console sends to the page of the refund, which shows what is due and holds the form.
    const console = await master.browser.get(CONSOLE, HTML);
    assert.ok(console.body.includes(`href="${CONSOLE}/${pagamento.id}/rimborso"`));
    const pagina = await master.browser.get(`${CONSOLE}/${pagamento.id}/rimborso`, HTML);
    assert.equal(pagina.status, 200);
    assert.ok(pagina.body.includes(`action="${CONSOLE}/${pagamento.id}/rimborso-revolut"`));
    assert.match(pagina.body, /Rimborsa su Revolut/);
    assert.match(pagina.body, /al massimo 290,00/);

    // Without the password, or with a wrong one: nothing leaves.
    const senza = await rimborsa(pagamento.id, '290,00', 'sbagliata-9');
    assert.equal(senza.status, 422);
    assert.match(senza.body, /Password non corretta/);
    assert.equal(rimborsi.richieste.length, 0);
    assert.equal(await prisma.rimborso.count(), 0);

    // More than what was paid on Revolut: refused before anything leaves.
    const troppo = await rimborsa(pagamento.id, '290,01');
    assert.equal(troppo.status, 422);
    assert.match(troppo.body, /al massimo 290,00/);
    assert.equal(rimborsi.richieste.length, 0);

    // With the password: the refund is ordered with our id as the Idempotency-Key; Revolut is still working on it.
    rimborsi.stato = 'processing';
    const via = await rimborsa(pagamento.id, '290,00');
    assert.equal(via.status, 303, via.body.slice(0, 400));
    const riga = await prisma.rimborso.findFirstOrThrow({
      where: { perPagamentoId: pagamento.id },
    });
    assert.deepEqual(rimborsi.richieste, [{ ordine: ordine.id, chiave: riga.id, amount: 29000 }]);
    assert.equal(riga.stato, 'IN_CORSO');
    assert.equal(riga.importoCent, 29000);
    const [reso] = rimborsiDi(ordine.id);
    assert.equal(riga.revolutRefundId, reso!.id);
    assert.equal(reso!.reference, riga.id);
    assert.equal(
      (await prisma.pagamento.findUniqueOrThrow({ where: { id: pagamento.id } })).stato,
      'COMPLETATO',
    );
    const inCorso = await master.browser.get(via.location, HTML);
    assert.match(inCorso.body, /l&#39;esito arriva entro 2 giorni/);
    // A second order of refund while the first is open: no.
    const doppio = await rimborsa(pagamento.id, '290,00');
    assert.equal(doppio.status, 409);
    assert.match(doppio.body, /già in corso/);
    assert.equal(rimborsi.richieste.length, 1);

    // Revolut completes it and says so with a signed webhook: the portal reads the refund order back.
    reso!.state = 'completed';
    assert.equal((await notifica('ORDER_COMPLETED', reso!.id)).status, 200);
    const fatto = await prisma.pagamento.findUniqueOrThrow({ where: { id: pagamento.id } });
    assert.equal(fatto.stato, 'RIMBORSATO');
    assert.equal(fatto.rimborsoCent, 29000);
    assert.ok(fatto.rimborsatoAt);
    assert.equal(
      (await prisma.rimborso.findUniqueOrThrow({ where: { id: riga.id } })).stato,
      'COMPLETATO',
    );
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'PAGAMENTO_RIMBORSATO', targetId: pagamento.id },
    });
    assert.deepEqual(audit.meta, { rimborsoCent: 29000, origine: 'revolut' });
    assert.equal((await rimborsiDovuti()).filter((r) => r.aziendaId === a.id).length, 0);
    // The payer is told where the money goes; MASTER too. A second webhook changes nothing.
    assert.ok(
      await attendiPosta(
        (m) =>
          m.to === user.email &&
          /Rimborso di 290,00/.test(m.subject) &&
          /stesso mezzo/.test(m.text),
      ),
    );
    assert.ok(await attendiPosta((m) => m.to === master.user.email && /290,00/.test(m.text)));
    await notifica('ORDER_COMPLETED', reso!.id);
    assert.equal(
      await prisma.auditLog.count({
        where: { action: 'PAGAMENTO_RIMBORSATO', targetId: pagamento.id },
      }),
      1,
    );
  });

  it('splits what exceeds the last order on the orders the credit came from', async () => {
    const { a, browser } = await inProva('Rimborso Due Srl');
    const primo = await paga(browser, a.id, (await piano(1, 12, 29000)).id);
    // A higher level while the first plan waits: it replaces it, the 290 € become days (art. 12.4).
    const secondo = await paga(browser, a.id, (await piano(2, 12, 49000)).id);
    assert.deepEqual(secondo.pagamento.creditoDa, [primo.pagamento.id]);
    await spegni(a.id);
    const [dovuto] = (await rimborsiDovuti()).filter((r) => r.aziendaId === a.id);
    assert.deepEqual([dovuto?.id, dovuto?.dovutoCent], [secondo.pagamento.id, 78000]);

    rimborsi.stato = 'completed';
    rimborsi.richieste.length = 0;
    const via = await rimborsa(secondo.pagamento.id, '780,00');
    assert.equal(via.status, 303, via.body.slice(0, 400));
    assert.deepEqual(
      rimborsi.richieste.map((r) => [r.ordine, r.amount]),
      [
        [secondo.ordine.id, 49000],
        [primo.ordine.id, 29000],
      ],
    );
    const dopo = await prisma.pagamento.findMany({
      where: { aziendaId: a.id },
      orderBy: { createdAt: 'asc' },
      select: { stato: true, rimborsoCent: true },
    });
    // Each payment carries what was given back on ITS order (the credit note follows the invoice).
    assert.deepEqual(dopo, [
      { stato: 'COMPLETATO', rimborsoCent: 29000 },
      { stato: 'RIMBORSATO', rimborsoCent: 49000 },
    ]);
    assert.equal((await rimborsiDovuti()).filter((r) => r.aziendaId === a.id).length, 0);
    const pagina = await master.browser.get(via.location, HTML);
    assert.match(pagina.body, /Rimborso eseguito su Revolut/);
  });

  it('asks again with the same key when the answer is lost, and Revolut holds one refund', async () => {
    const { a, browser } = await inProva('Rimborso Muto Srl');
    const { ordine, pagamento } = await paga(browser, a.id, (await piano(1, 1, 2900)).id);
    await spegni(a.id);
    rimborsi.stato = 'completed';
    rimborsi.muto = true;
    rimborsi.richieste.length = 0;
    const via = await rimborsa(pagamento.id, '29,00');
    assert.equal(via.status, 303);
    const riga = await prisma.rimborso.findFirstOrThrow({
      where: { perPagamentoId: pagamento.id },
    });
    assert.equal(riga.stato, 'IN_CORSO');
    assert.equal(riga.revolutRefundId, null);
    const pagina = await master.browser.get(via.location, HTML);
    assert.match(pagina.body, /Revolut non ha risposto/);
    assert.ok(pagina.body.includes(`${CONSOLE}/rimborsi/${riga.id}/riprova`));

    // "Riprova": the same Idempotency-Key — Revolut answers with the refund it already made.
    rimborsi.muto = false;
    const riprova = await master.browser.submit(
      CONSOLE,
      `${CONSOLE}/rimborsi/${riga.id}/riprova`,
      {},
    );
    assert.equal(riprova.status, 303);
    assert.deepEqual(
      rimborsi.richieste.map((r) => r.chiave),
      [riga.id, riga.id],
    );
    assert.equal(rimborsiDi(ordine.id).length, 1);
    const fatto = await prisma.pagamento.findUniqueOrThrow({ where: { id: pagamento.id } });
    assert.deepEqual([fatto.stato, fatto.rimborsoCent], ['RIMBORSATO', 2900]);
  });

  it('finds by our reference a refund whose answer was lost, when the webhook announces it', async () => {
    const { a, browser } = await inProva('Rimborso Annunciato Srl');
    const { ordine, pagamento } = await paga(browser, a.id, (await piano(1, 1, 2900)).id);
    await spegni(a.id);
    rimborsi.stato = 'completed';
    rimborsi.muto = true;
    await rimborsa(pagamento.id, '29,00');
    rimborsi.muto = false;
    const [reso] = rimborsiDi(ordine.id);
    assert.equal((await notifica('ORDER_COMPLETED', reso!.id)).status, 200);
    const riga = await prisma.rimborso.findFirstOrThrow({
      where: { perPagamentoId: pagamento.id },
    });
    assert.deepEqual([riga.stato, riga.revolutRefundId], ['COMPLETATO', reso!.id]);
    assert.equal(
      (await prisma.pagamento.findUniqueOrThrow({ where: { id: pagamento.id } })).stato,
      'RIMBORSATO',
    );
  });

  it('changes nothing when Revolut refuses, says it, and the refund can be ordered again', async () => {
    const { a, browser } = await inProva('Rimborso Rifiutato Srl');
    const { ordine, pagamento } = await paga(browser, a.id, (await piano(1, 1, 2900)).id);
    await spegni(a.id);
    rimborsi.http = 422;
    discord.messaggi.length = 0;
    const no = await rimborsa(pagamento.id, '29,00');
    assert.equal(no.status, 303);
    const pagina = await master.browser.get(no.location, HTML);
    assert.match(pagina.body, /Revolut ha rifiutato il rimborso \(codice 422\)/);
    const riga = await prisma.rimborso.findFirstOrThrow({
      where: { perPagamentoId: pagamento.id },
    });
    assert.deepEqual([riga.stato, riga.errore], ['FALLITO', '422']);
    assert.equal(
      (await prisma.pagamento.findUniqueOrThrow({ where: { id: pagamento.id } })).stato,
      'COMPLETATO',
    );
    assert.equal((await rimborsiDovuti()).filter((r) => r.aziendaId === a.id).length, 1);
    // Discord: the kind of event and the console, no company and no person.
    assert.ok(await attendiDiscord((m) => /rimborso su Revolut non è riuscito/.test(m)));
    assert.ok(discord.messaggi.every((m) => !/Rimborso Rifiutato|@/.test(m)));

    // Revolut accepts, then the refund fails on its side: read back by the maintenance, nothing is closed.
    rimborsi.http = null;
    rimborsi.stato = 'processing';
    assert.equal((await rimborsa(pagamento.id, '29,00')).status, 303);
    const [reso] = rimborsiDi(ordine.id);
    reso!.state = 'failed';
    await riconciliaRimborsi();
    const righe = await prisma.rimborso.findMany({
      where: { perPagamentoId: pagamento.id },
      orderBy: { createdAt: 'asc' },
      select: { stato: true, errore: true },
    });
    assert.deepEqual(righe, [
      { stato: 'FALLITO', errore: '422' },
      { stato: 'FALLITO', errore: 'failed' },
    ]);
    assert.equal(
      (await prisma.pagamento.findUniqueOrThrow({ where: { id: pagamento.id } })).stato,
      'COMPLETATO',
    );
    // The third time it goes through.
    rimborsi.stato = 'completed';
    assert.equal((await rimborsa(pagamento.id, '29,00')).status, 303);
    assert.equal(
      (await prisma.pagamento.findUniqueOrThrow({ where: { id: pagamento.id } })).stato,
      'RIMBORSATO',
    );
  });

  it('gives back in full a payment that waits for MASTER', async () => {
    const { a, browser } = await inProva('Rimborso Verifica Srl');
    const vista = await browser.get(
      `/impostazioni/abbonamento/offerta?azienda=${a.id}&piano=${(await piano(1, 1, 2900)).id}`,
      HTML,
    );
    const pianoId = /name="piano" value="([^"]+)"/.exec(vista.body)![1]!;
    const esito = await browser.submit('/account', '/impostazioni/abbonamento/paga', {
      azienda: a.id,
      piano: pianoId,
      ...dati,
      accetto: 'si',
      hash: hashDi(vista.body),
    });
    const ordine = ordineDa(esito.location);
    // Between the offer and the payment the company becomes "without an end": paid, but no period.
    await prisma.azienda.update({
      where: { id: a.id },
      data: { abbonamentoFino: null, abbonamentoProva: false },
    });
    ordine.state = 'completed';
    await browser.get(`/impostazioni/abbonamento/esito/${ordine.reference}`, HTML);
    const p = await prisma.pagamento.findUniqueOrThrow({ where: { id: ordine.reference } });
    assert.equal(p.stato, 'DA_VERIFICARE');
    assert.ok(await attendiDiscord((m) => /il piano non è partito/.test(m)));
    const console = await master.browser.get(CONSOLE, HTML);
    assert.ok(console.body.includes(`href="${CONSOLE}/${p.id}/rimborso"`));
    const pagina = await master.browser.get(`${CONSOLE}/${p.id}/rimborso`, HTML);
    assert.match(pagina.body, /si restituisce per intero/);
    rimborsi.stato = 'completed';
    rimborsi.richieste.length = 0;
    assert.equal((await rimborsa(p.id, '29,00')).status, 303);
    assert.deepEqual(
      rimborsi.richieste.map((r) => [r.ordine, r.amount]),
      [[ordine.id, 2900]],
    );
    const dopo = await prisma.pagamento.findUniqueOrThrow({ where: { id: p.id } });
    assert.deepEqual([dopo.stato, dopo.rimborsoCent], ['RIMBORSATO', 2900]);
  });
});
