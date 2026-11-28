// A dispute (chargeback) decided against us (terms, art. 12.9), end to end with the fake Revolut (the owner, 28
// November 2026 — the review of the Tax adviser, M1; not tax advice). After a service already rendered, the money
// taken back by the bank is a failure to pay, not a termination of the contract: a credit note is issued only on
// termination (art. 115(1) and (3) of the Bulgarian VAT act; the bad debt is art. 126b). Acceptance criteria:
//  - a dispute lost at the bank leaves NO note by itself: it is "to be assessed", in the console and on Discord
//    (count only), and the hourly maintenance reminds it while it waits;
//  - MASTER chooses, once: "nota di credito (risoluzione)" → ONE note due on the payment, whatever the
//    notifications; "nessuna nota (mancato pagamento)" → none. The choice is stored and audited;
//  - the notes of an invoice never exceed it: a refund marked by hand after the note adds no second note;
//  - a dispute won leaves nothing to assess.
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
  SEGRETO_WEBHOOK,
} from './revolut-finto.js';

await avviaRevolutFinto();
const h = await import('./harness.js');
const { BASE, Browser, makeAzienda, prisma, signedIn, startApp, stopApp } = h;
const { cifraAllarmi, cifraRevolut } = await import('../../src/auth/chiavi.js');
const { ricordaContestazioniDaValutare } = await import('../../src/pagamenti/contestazioni.js');

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
  const { browser } = await signedIn('ADMIN', a.id);
  return { a, browser };
}

/** Accepts the offer of a new plan, pays it on the fake Revolut and comes back. */
async function paga(b: InstanceType<typeof Browser>, aziendaId: string, prezzoCent: number) {
  const piano = await prisma.pianoAbbonamento.create({
    data: { livello: 1, mesi: 12, prezzoCent },
  });
  const vista = await b.get(
    `/impostazioni/abbonamento/offerta?azienda=${aziendaId}&piano=${piano.id}`,
    HTML,
  );
  const esito = await b.submit('/account', '/impostazioni/abbonamento/paga', {
    azienda: aziendaId,
    piano: piano.id,
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

const decidi = (id: string, decisione: string) =>
  master.browser.submit(CONSOLE, `${CONSOLE}/contestazioni/${id}/decisione`, { decisione });

describe('a dispute lost at the bank', () => {
  it('waits for MASTER: a credit note only when he chooses the termination', async () => {
    const { a, browser } = await inProva('Nota Contestata Srl');
    const { ordine, pagamento } = await paga(browser, a.id, 2900);
    dispute.set('dsp-nc-1', {
      id: 'dsp-nc-1',
      state: 'needs_response',
      amount: 2900,
      order_id: ordine.id,
    });
    assert.equal((await notifica('DISPUTE_ACTION_REQUIRED', 'dsp-nc-1')).status, 200);
    // Not lost yet: nothing to decide.
    assert.equal((await decidi('dsp-nc-1', 'NOTA_CREDITO')).status, 303);
    assert.equal(
      (await prisma.contestazione.findUniqueOrThrow({ where: { id: 'dsp-nc-1' } })).decisione,
      null,
    );
    dispute.get('dsp-nc-1')!.state = 'lost';
    discord.messaggi.length = 0;
    assert.equal((await notifica('DISPUTE_LOST', 'dsp-nc-1')).status, 200);
    assert.equal((await notifica('DISPUTE_LOST', 'dsp-nc-1')).status, 200);
    // No note by itself: to be assessed.
    assert.equal(await prisma.notaCredito.count({ where: { pagamentoId: pagamento.id } }), 0);
    assert.ok(await attendiDiscord((m) => /contestazioni perse da valutare: 1/.test(m)));
    assert.ok(discord.messaggi.every((m) => !/Contestata|Verdi|@/.test(m)));
    assert.equal(await ricordaContestazioniDaValutare(), 1);
    const pagina = await master.browser.get(CONSOLE, HTML);
    assert.match(pagina.body, /Da valutare/);
    assert.ok(pagina.body.includes(`action="${CONSOLE}/contestazioni/dsp-nc-1/decisione"`));
    assert.match(pagina.body, /Nota di credito \(risoluzione\)/);
    assert.match(pagina.body, /Nessuna nota \(mancato pagamento\)/);

    // A choice that is not one of the two changes nothing.
    assert.equal((await decidi('dsp-nc-1', 'ALTRO')).status, 303);
    assert.equal(
      (await prisma.contestazione.findUniqueOrThrow({ where: { id: 'dsp-nc-1' } })).decisione,
      null,
    );
    assert.equal((await decidi('dsp-nc-1', 'NOTA_CREDITO')).status, 303);
    const decisa = await prisma.contestazione.findUniqueOrThrow({ where: { id: 'dsp-nc-1' } });
    assert.equal(decisa.decisione, 'NOTA_CREDITO');
    assert.ok(decisa.decisaAt);
    const note = await prisma.notaCredito.findMany({ where: { pagamentoId: pagamento.id } });
    assert.equal(note.length, 1);
    assert.equal(note[0]!.origine, 'CONTESTAZIONE');
    assert.equal(note[0]!.contestazioneId, 'dsp-nc-1');
    assert.equal(note[0]!.totaleCent, 2900);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'CONTESTAZIONE_DECISA', targetId: pagamento.id },
    });
    assert.equal(audit.actorId, master.user.id);
    assert.deepEqual(audit.meta, { contestazione: 'dsp-nc-1', decisione: 'NOTA_CREDITO' });
    // Once: the other choice afterwards, and the notifications again, change nothing.
    await decidi('dsp-nc-1', 'NESSUNA_NOTA');
    assert.equal((await notifica('DISPUTE_LOST', 'dsp-nc-1')).status, 200);
    assert.equal(
      (await prisma.contestazione.findUniqueOrThrow({ where: { id: 'dsp-nc-1' } })).decisione,
      'NOTA_CREDITO',
    );
    assert.equal(await prisma.notaCredito.count({ where: { pagamentoId: pagamento.id } }), 1);
    assert.equal(await ricordaContestazioniDaValutare(), 0);
    // The bank has already given the money back: a refund marked by hand afterwards adds no second note — the
    // notes of an invoice never exceed it.
    await master.browser.submit(CONSOLE, `${CONSOLE}/${pagamento.id}/rimborso`, {
      importo: '29,00',
    });
    assert.equal(
      (await prisma.pagamento.findUniqueOrThrow({ where: { id: pagamento.id } })).stato,
      'RIMBORSATO',
    );
    assert.equal(await prisma.notaCredito.count({ where: { pagamentoId: pagamento.id } }), 1);
    const dopo = await master.browser.get(CONSOLE, HTML);
    assert.match(dopo.body, /Contestazione persa/);
    assert.match(dopo.body, /Nota di credito scelta/);
  });

  it('leaves no note when MASTER says it is a failure to pay', async () => {
    const { a, browser } = await inProva('Nota Mancata Srl');
    const { ordine, pagamento } = await paga(browser, a.id, 2900);
    dispute.set('dsp-nc-3', { id: 'dsp-nc-3', state: 'lost', amount: 2900, order_id: ordine.id });
    assert.equal((await notifica('DISPUTE_LOST', 'dsp-nc-3')).status, 200);
    assert.equal(await ricordaContestazioniDaValutare(), 1);
    assert.equal((await decidi('dsp-nc-3', 'NESSUNA_NOTA')).status, 303);
    const decisa = await prisma.contestazione.findUniqueOrThrow({ where: { id: 'dsp-nc-3' } });
    assert.equal(decisa.decisione, 'NESSUNA_NOTA');
    assert.equal(await prisma.notaCredito.count({ where: { pagamentoId: pagamento.id } }), 0);
    assert.equal(
      await prisma.auditLog.count({
        where: { action: 'CONTESTAZIONE_DECISA', targetId: pagamento.id },
      }),
      1,
    );
    assert.equal(await ricordaContestazioniDaValutare(), 0);
    assert.match((await master.browser.get(CONSOLE, HTML)).body, /Nessuna nota: mancato pagamento/);
    // Only for MASTER.
    const { browser: admin } = await signedIn('ADMIN');
    const vietato = await admin.submit('/account', `${CONSOLE}/contestazioni/dsp-nc-3/decisione`, {
      decisione: 'NOTA_CREDITO',
    });
    assert.equal(vietato.status, 403);

    const vinta = await inProva('Nota Vinta Srl');
    const altro = await paga(vinta.browser, vinta.a.id, 2900);
    dispute.set('dsp-nc-2', {
      id: 'dsp-nc-2',
      state: 'won',
      amount: 2900,
      order_id: altro.ordine.id,
    });
    assert.equal((await notifica('DISPUTE_WON', 'dsp-nc-2')).status, 200);
    assert.equal(await prisma.notaCredito.count({ where: { pagamentoId: altro.pagamento.id } }), 0);
    assert.equal(await ricordaContestazioniDaValutare(), 0);
  });
});
