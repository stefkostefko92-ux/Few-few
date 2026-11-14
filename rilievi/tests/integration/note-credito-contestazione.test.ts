// The credit note due after a dispute (chargeback) decided against us (terms 2026-11-14, art. 12.9), end to end
// with the fake Revolut. Acceptance criteria:
//  - a dispute lost at the bank leaves ONE note due on the payment, whatever the notifications; a dispute won
//    leaves none;
//  - the notes of an invoice never exceed it: a refund marked by hand after the lost dispute adds no second note.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { WEBHOOK_DISCORD } from './esterni-finti.js';
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

describe('the credit note due after a dispute', () => {
  it('is recorded once when the dispute is lost, and never when it is won', async () => {
    const { a, browser } = await inProva('Nota Contestata Srl');
    const { ordine, pagamento } = await paga(browser, a.id, 2900);
    dispute.set('dsp-nc-1', {
      id: 'dsp-nc-1',
      state: 'needs_response',
      amount: 2900,
      order_id: ordine.id,
    });
    assert.equal((await notifica('DISPUTE_ACTION_REQUIRED', 'dsp-nc-1')).status, 200);
    assert.equal(await prisma.notaCredito.count({ where: { pagamentoId: pagamento.id } }), 0);
    dispute.get('dsp-nc-1')!.state = 'lost';
    assert.equal((await notifica('DISPUTE_LOST', 'dsp-nc-1')).status, 200);
    assert.equal((await notifica('DISPUTE_LOST', 'dsp-nc-1')).status, 200);
    const note = await prisma.notaCredito.findMany({ where: { pagamentoId: pagamento.id } });
    assert.equal(note.length, 1);
    assert.equal(note[0]!.origine, 'CONTESTAZIONE');
    assert.equal(note[0]!.contestazioneId, 'dsp-nc-1');
    assert.equal(note[0]!.totaleCent, 2900);
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
    const pagina = await master.browser.get(CONSOLE, HTML);
    assert.match(pagina.body, /Contestazione persa/);
    assert.match(pagina.body, /chiedi al commercialista/);

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
  });
});
