// What happens around a payment when things do not go the plain way (#31 — the audit of 12 November 2026; terms
// 2026-11-12, art. 12.3, 12.4, 12.9), end to end with the fake Revolut:
// - a second, different offer is not opened while the first can still be paid — the person is sent back to it;
// - a higher level bought while a plan waits replaces it: the whole value of the waiting plan becomes days;
// - the return page and the signed webhook arriving together give the period once;
// - money paid that cannot become a period (company without an end, switched off) is never lost in silence: the
//   payment waits for MASTER, who is written to, and the payer is told not to pay again;
// - every payment goes to MASTER to be invoiced, and is ticked when the invoice is out; the table as CSV;
// - a company switched off with paid time left: the refund due is shown once (a converted payment is not counted
//   twice), MASTER records what was given back.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  avviaRevolutFinto,
  CHIAVE,
  eventoFirmato,
  fermaRevolutFinto,
  ordineDa,
  SEGRETO_WEBHOOK,
} from './revolut-finto.js';

await avviaRevolutFinto();
const h = await import('./harness.js');
const { BASE, Browser, makeAzienda, outbox, prisma, signedIn, startApp, stopApp } = h;
const { cifraRevolut } = await import('../../src/auth/chiavi.js');
const { rimborsiDovuti } = await import('../../src/pagamenti/rimborsi.js');

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
  master = await signedIn('MASTER');
});
after(async () => {
  await stopApp();
  await fermaRevolutFinto();
});

const HTML = { accept: 'text/html' };
const GIORNO = 24 * 60 * 60 * 1000;
const dati = {
  ragioneSociale: 'Ascensori Verdi S.r.l.',
  sede: 'Via Dante 3, Bologna',
  partitaIva: '01234567897',
};
const hashDi = (body: string) => /name="hash" value="([0-9a-f]{64})"/.exec(body)?.[1] ?? '';

async function inProva(nome: string, giorni = 10) {
  const a = await makeAzienda(nome);
  await prisma.azienda.update({
    where: { id: a.id },
    data: {
      abbonamentoProva: true,
      abbonamentoFino: new Date(Date.now() + giorni * GIORNO),
      // The billing data saved in the settings: the offer page shows them, the form sends them back.
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

const spegni = (aziendaId: string) =>
  master.browser.submit(`/aziende/${aziendaId}`, `/aziende/${aziendaId}/stato`, { active: '0' });

const piano = (livello: number, mesi: number, prezzoCent: number) =>
  prisma.pianoAbbonamento.create({ data: { livello, mesi, prezzoCent } });

/** Reads the offer, then accepts exactly the one seen. */
async function accetta(b: InstanceType<typeof Browser>, aziendaId: string, pianoId: string) {
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
  return { vista, esito };
}

async function attendiPosta(test: (m: { to: string; subject: string; text: string }) => boolean) {
  for (let i = 0; i < 40 && !outbox.some(test); i += 1) await new Promise((r) => setTimeout(r, 50));
  return outbox.some(test);
}

describe('a payment that does not go the plain way', () => {
  it('holds a second offer while the first is open, then replaces the waiting plan with a higher one', async () => {
    const { a, browser } = await inProva('Due Ordini Srl');
    const p1 = await piano(1, 12, 29000);
    const p2 = await piano(2, 12, 49000);
    const uno = await accetta(browser, a.id, p1.id);
    assert.equal(uno.esito.status, 303);
    const ordine1 = ordineDa(uno.esito.location);

    // Another plan while the first order can still be paid: no second order, the way back to the first.
    const due = await accetta(browser, a.id, p2.id);
    assert.equal(due.esito.status, 409);
    assert.match(due.esito.body, /Continua il pagamento aperto/);
    assert.ok(due.esito.body.includes(`href="${uno.esito.location}"`));
    assert.equal(await prisma.pagamento.count({ where: { aziendaId: a.id } }), 1);

    // The first is paid on Revolut; the person comes back to buy the higher level before the return page.
    ordine1.state = 'completed';
    const fineProva = (await prisma.azienda.findUniqueOrThrow({ where: { id: a.id } }))
      .abbonamentoFino!;
    const tre = await accetta(browser, a.id, p2.id);
    // Asking Revolut first gave the period of the first plan — so the offer seen is no longer the right one.
    assert.equal(tre.esito.status, 409);
    assert.match(tre.esito.body, /Abbiamo aggiornato l&#39;offerta/);
    const primo = await prisma.pagamento.findUniqueOrThrow({ where: { id: ordine1.reference } });
    assert.equal(primo.stato, 'COMPLETATO');
    const inCoda = await prisma.azienda.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(inCoda.abbonamentoCambioLivello, 1);
    // The limit of people of the bought plan holds from the purchase; the section still offers the higher level.
    const sezione = await browser.get(`/impostazioni/abbonamento?azienda=${a.id}`, HTML);
    assert.ok(sezione.body.includes(`piano=${p2.id}`));
    assert.ok(!sezione.body.includes(`piano=${p1.id}`));
    assert.match(sezione.body, /Dopo l&#39;inizio del piano acquistato/);

    // The higher level, with the offer that counts the waiting plan: it replaces it from the end of the trial.
    const quattro = await accetta(browser, a.id, p2.id);
    assert.match(quattro.vista.body, /290,00 €/);
    assert.equal(quattro.esito.status, 303);
    const ordine2 = ordineDa(quattro.esito.location);
    assert.equal(ordine2.amount, 49000);
    ordine2.state = 'completed';
    await browser.get(`/impostazioni/abbonamento/esito/${ordine2.reference}`, HTML);
    const dopo = await prisma.azienda.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(dopo.abbonamentoProva, true);
    assert.equal(dopo.abbonamentoCambioAt?.toISOString(), fineProva.toISOString());
    assert.equal(dopo.abbonamentoCambioLivello, 2);
    const secondo = await prisma.pagamento.findUniqueOrThrow({ where: { id: ordine2.reference } });
    assert.equal(secondo.creditoCent, 29000);
    assert.deepEqual(secondo.creditoDa, [primo.id]);
    // 290 € at 490 € a year: about 216 days more than a year after the trial.
    const giorni = (dopo.abbonamentoFino!.getTime() - fineProva.getTime()) / GIORNO;
    assert.ok(giorni >= 365 + 215 && giorni <= 366 + 217, String(giorni));

    // Switched off with all of it unused: 290 + 490 are due once — the converted payment is not counted again.
    await spegni(a.id);
    const dovuti = (await rimborsiDovuti()).filter((r) => r.aziendaId === a.id);
    assert.deepEqual(
      dovuti.map((r) => [r.id, r.dovutoCent]),
      [[secondo.id, 78000]],
    );
    assert.ok(
      await attendiPosta(
        (m) => m.to === master.user.email && /780,00/.test(m.text) && /Due Ordini Srl/.test(m.text),
      ),
    );
  });

  it('gives the period once when the return page and the webhook arrive together', async () => {
    const { a, browser } = await inProva('Insieme Srl');
    const p = await piano(1, 1, 2900);
    const via = await accetta(browser, a.id, p.id);
    const ordine = ordineDa(via.esito.location);
    ordine.state = 'completed';
    const ev = eventoFirmato('ORDER_COMPLETED', ordine.id);
    const webhook = () =>
      fetch(`${BASE}/webhook/revolut`, { method: 'POST', headers: ev.headers, body: ev.body });
    const esiti = await Promise.all([
      browser.get(`/impostazioni/abbonamento/esito/${ordine.reference}`, HTML),
      webhook(),
      webhook(),
    ]);
    assert.equal(esiti[1].status, 200);
    const completati = await prisma.auditLog.count({
      where: { action: 'PAGAMENTO_COMPLETATO', targetId: ordine.reference },
    });
    assert.equal(completati, 1);
    const dati = await prisma.auditLog.count({
      where: { action: 'AZIENDA_ABBONAMENTO', aziendaId: a.id },
    });
    assert.equal(dati, 1);
  });

  it('keeps for MASTER a payment that cannot become a period, and tells both sides', async () => {
    const { a, browser, user } = await inProva('Senza Fine Srl');
    const p = await piano(1, 1, 2900);
    const via = await accetta(browser, a.id, p.id);
    const ordine = ordineDa(via.esito.location);
    // Between the offer and the payment MASTER makes the company "without an end" (art. 12.8).
    await prisma.azienda.update({
      where: { id: a.id },
      data: { abbonamentoFino: null, abbonamentoProva: false },
    });
    ordine.state = 'completed';
    const ritorno = await browser.get(`/impostazioni/abbonamento/esito/${ordine.reference}`, HTML);
    assert.equal(ritorno.status, 303);
    const pagina = await browser.get(ritorno.location, HTML);
    assert.match(pagina.body, /non devi pagare di nuovo/);
    const pagamento = await prisma.pagamento.findUniqueOrThrow({ where: { id: ordine.reference } });
    assert.equal(pagamento.stato, 'DA_VERIFICARE');
    assert.equal(pagamento.verificaMotivo, 'senzaScadenza');
    assert.equal(
      (await prisma.azienda.findUniqueOrThrow({ where: { id: a.id } })).abbonamentoFino,
      null,
    );
    assert.ok(
      await attendiPosta((m) => m.to === master.user.email && /Senza Fine Srl/.test(m.subject)),
    );
    assert.ok(await attendiPosta((m) => m.to === user.email && /Senza Fine Srl/.test(m.subject)));
    const console_ = await master.browser.get('/master/pagamenti', HTML);
    assert.match(console_.body, /Pagamenti da verificare/);
    assert.match(console_.body, /non ha una scadenza/);

    // A company switched off before the payment arrives: the same.
    const altra = await inProva('Spenta Srl');
    const via2 = await accetta(altra.browser, altra.a.id, p.id);
    const ordine2 = ordineDa(via2.esito.location);
    await spegni(altra.a.id);
    ordine2.state = 'completed';
    const ev = eventoFirmato('ORDER_COMPLETED', ordine2.id);
    await fetch(`${BASE}/webhook/revolut`, { method: 'POST', headers: ev.headers, body: ev.body });
    const spento = await prisma.pagamento.findUniqueOrThrow({ where: { id: ordine2.reference } });
    assert.equal(spento.stato, 'DA_VERIFICARE');
    assert.equal(spento.verificaMotivo, 'aziendaDisattivata');

    // MASTER gives the money back and records it: nothing is left to verify for that payment.
    const male = await master.browser.submit(
      '/master/pagamenti',
      `/master/pagamenti/${pagamento.id}/rimborso`,
      { importo: 'tutto' },
    );
    assert.equal(male.status, 303);
    assert.equal(
      (await prisma.pagamento.findUniqueOrThrow({ where: { id: pagamento.id } })).stato,
      'DA_VERIFICARE',
    );
    await master.browser.submit('/master/pagamenti', `/master/pagamenti/${pagamento.id}/rimborso`, {
      importo: '29,00',
    });
    const reso = await prisma.pagamento.findUniqueOrThrow({ where: { id: pagamento.id } });
    assert.equal(reso.stato, 'RIMBORSATO');
    assert.equal(reso.rimborsoCent, 2900);
    assert.ok(reso.rimborsatoAt);
    assert.equal(
      await prisma.auditLog.count({
        where: { action: 'PAGAMENTO_RIMBORSATO', targetId: pagamento.id },
      }),
      1,
    );
    // Only MASTER.
    const no = await browser.submit('/account', `/master/pagamenti/${spento.id}/rimborso`, {
      importo: '29,00',
    });
    assert.equal(no.status, 403);
  });

  it('sends every payment to MASTER to be invoiced and ticks it when the invoice is out', async () => {
    const { a, browser } = await inProva('Fattura Srl');
    const p = await piano(3, 1, 9900);
    const via = await accetta(browser, a.id, p.id);
    const ordine = ordineDa(via.esito.location);
    ordine.state = 'completed';
    await browser.get(`/impostazioni/abbonamento/esito/${ordine.reference}`, HTML);
    assert.ok(
      await attendiPosta(
        (m) =>
          m.to === master.user.email &&
          /da fatturare/.test(m.subject) &&
          /Fattura Srl/.test(m.subject) &&
          /IT01234567897/.test(m.text),
      ),
    );
    const prima = await master.browser.get('/master/pagamenti', HTML);
    assert.ok(prima.body.includes(`/master/pagamenti/${ordine.reference}/fatturato`));
    const csv = await master.browser.get('/master/pagamenti/esporta.csv');
    assert.equal(csv.status, 200);
    assert.match(String(csv.headers.get('content-type')), /text\/csv/);
    assert.match(csv.body, /"Fattura Srl"/);
    assert.match(csv.body, /"99,00"/);
    assert.equal((await browser.get('/master/pagamenti/esporta.csv')).status, 403);

    await master.browser.submit(
      '/master/pagamenti',
      `/master/pagamenti/${ordine.reference}/fatturato`,
      {},
    );
    const fatto = await prisma.pagamento.findUniqueOrThrow({ where: { id: ordine.reference } });
    assert.ok(fatto.fatturataAt);
    const dopo = await master.browser.get('/master/pagamenti', HTML);
    assert.ok(!dopo.body.includes(`/master/pagamenti/${ordine.reference}/fatturato`));
    // Twice: once in the register.
    await master.browser.submit(
      '/master/pagamenti',
      `/master/pagamenti/${ordine.reference}/fatturato`,
      {},
    );
    assert.equal(
      await prisma.auditLog.count({
        where: { action: 'PAGAMENTO_FATTURATO', targetId: ordine.reference },
      }),
      1,
    );
  });
});
