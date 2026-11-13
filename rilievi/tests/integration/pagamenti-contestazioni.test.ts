// Disputes (chargebacks) and the registration of the Revolut webhook (terms 2026-11-13, art. 12.9; the official
// OpenAPI 2026-08-17: the DISPUTE_* events carry only `dispute_id`, the dispute is read with GET
// /api/disputes/{id}), end to end with the fake Revolut. Acceptance criteria:
//  - a dispute announced by a signed webhook is read back from Revolut, linked to the payment of its order, shown
//    to MASTER with its deadline, mailed to MASTER and sent to Discord without personal data;
//  - an unsigned event does nothing; the same event twice gives one row and one audit entry;
//  - the portal decides nothing by itself: a lost dispute does not touch the payment or the subscription;
//  - the webhook is registered with the dispute events; a Revolut that refuses them still gets the order events
//    and the console says so.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { attendiDiscord, discord, WEBHOOK_DISCORD } from './esterni-finti.js';
import {
  avviaRevolutFinto,
  CHIAVE,
  dispute,
  eventoFirmato,
  fermaRevolutFinto,
  ordineDa,
  ordini,
  SEGRETO_WEBHOOK,
  webhook,
} from './revolut-finto.js';

await avviaRevolutFinto();
const h = await import('./harness.js');
const { BASE, Browser, makeAzienda, outbox, prisma, signedIn, startApp, stopApp } = h;
const { cifraAllarmi, cifraRevolut } = await import('../../src/auth/chiavi.js');

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

const notifica = (evento: string, id: string) => {
  const ev = eventoFirmato(evento, id);
  return fetch(`${BASE}/webhook/revolut`, { method: 'POST', headers: ev.headers, body: ev.body });
};

async function attendiPosta(test: (m: { to: string; subject: string; text: string }) => boolean) {
  for (let i = 0; i < 40 && !outbox.some(test); i += 1) await new Promise((r) => setTimeout(r, 50));
  return outbox.some(test);
}

describe('a dispute (chargeback)', () => {
  it('is read back from Revolut, shown to MASTER with its deadline, mailed and sent to Discord', async () => {
    const { a, browser } = await inProva('Contestata Srl');
    const { ordine, pagamento } = await paga(browser, a.id, (await piano(1, 1, 2900)).id);
    dispute.set('dsp-1', {
      id: 'dsp-1',
      state: 'needs_response',
      amount: 2900,
      order_id: ordine.id,
      response_due_date: '2026-11-25T09:00:00.000Z',
    });
    discord.messaggi.length = 0;

    // Not signed: nothing.
    const falso = await fetch(`${BASE}/webhook/revolut`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'revolut-signature': 'v1=00' },
      body: JSON.stringify({ event: 'DISPUTE_ACTION_REQUIRED', dispute_id: 'dsp-1' }),
    });
    assert.equal(falso.status, 401);
    assert.equal(await prisma.contestazione.count(), 0);

    assert.equal((await notifica('DISPUTE_ACTION_REQUIRED', 'dsp-1')).status, 200);
    const c = await prisma.contestazione.findUniqueOrThrow({ where: { id: 'dsp-1' } });
    assert.equal(c.pagamentoId, pagamento.id);
    assert.equal(c.stato, 'DA_RISPONDERE');
    assert.equal(c.importoCent, 2900);
    assert.equal(c.rispostaEntro?.toISOString(), '2026-11-25T09:00:00.000Z');
    assert.match(c.motivo ?? '', /13\.1/);
    const pagina = await master.browser.get(CONSOLE, HTML);
    assert.match(pagina.body, /Contestazioni/);
    assert.match(pagina.body, /Contestata Srl/);
    assert.match(pagina.body, /25\/11\/2026/);
    assert.match(pagina.body, /Da rispondere/);
    assert.ok(
      await attendiPosta(
        (m) => m.to === master.user.email && /contestato un pagamento/.test(m.text),
      ),
    );
    assert.ok(await attendiDiscord((m) => /chargeback/.test(m)));
    assert.ok(discord.messaggi.every((m) => !/Contestata|@/.test(m)));
    assert.equal(
      await prisma.auditLog.count({
        where: { action: 'PAGAMENTO_CONTESTATO', targetId: pagamento.id },
      }),
      1,
    );
    // The same event again: no second row, no second audit.
    await notifica('DISPUTE_ACTION_REQUIRED', 'dsp-1');
    assert.equal(
      await prisma.auditLog.count({
        where: { action: 'PAGAMENTO_CONTESTATO', targetId: pagamento.id },
      }),
      1,
    );

    // Lost: the state follows; the payment and the subscription are NOT touched — MASTER decides.
    dispute.get('dsp-1')!.state = 'lost';
    dispute.get('dsp-1')!.substate = 'lost_expired';
    assert.equal((await notifica('DISPUTE_LOST', 'dsp-1')).status, 200);
    const persa = await prisma.contestazione.findUniqueOrThrow({ where: { id: 'dsp-1' } });
    assert.deepEqual([persa.stato, persa.sottostato], ['PERSA', 'lost_expired']);
    assert.equal(
      (await prisma.pagamento.findUniqueOrThrow({ where: { id: pagamento.id } })).stato,
      'COMPLETATO',
    );
    assert.match((await master.browser.get(CONSOLE, HTML)).body, /Persa/);

    // A dispute on an order that is not ours is kept without a payment, never dropped.
    dispute.set('dsp-2', {
      id: 'dsp-2',
      state: 'under_review',
      amount: 100,
      order_id: 'altro-ordine',
    });
    await notifica('DISPUTE_UNDER_REVIEW', 'dsp-2');
    const estranea = await prisma.contestazione.findUniqueOrThrow({ where: { id: 'dsp-2' } });
    assert.deepEqual([estranea.pagamentoId, estranea.stato], [null, 'IN_ESAME']);
  });
});

describe('the webhook of Revolut', () => {
  it('is registered with the dispute events, and without them where Revolut refuses them', async () => {
    const uno = await master.browser.submit(CONSOLE, `${CONSOLE}/webhook`, {});
    assert.equal(uno.status, 303);
    assert.ok(webhook.eventi.includes('ORDER_COMPLETED'));
    for (const e of [
      'DISPUTE_ACTION_REQUIRED',
      'DISPUTE_UNDER_REVIEW',
      'DISPUTE_WON',
      'DISPUTE_LOST',
    ])
      assert.ok(webhook.eventi.includes(e), e);
    webhook.rifiutaDispute = true;
    const due = await master.browser.submit(CONSOLE, `${CONSOLE}/webhook`, {});
    assert.equal(due.status, 303);
    assert.deepEqual(webhook.eventi, ['ORDER_COMPLETED', 'ORDER_CANCELLED', 'ORDER_FAILED']);
    const pagina = await master.browser.get(due.location, HTML);
    assert.match(pagina.body, /senza gli avvisi delle contestazioni/);
    webhook.rifiutaDispute = false;
    assert.ok(ordini.size > 0);
  });
});
