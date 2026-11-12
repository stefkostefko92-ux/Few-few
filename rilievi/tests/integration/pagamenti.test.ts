// Paying a Premium plan (#31; terms 2026-11-12, art. 12): the ADMIN of the company chooses a plan that fits its
// people, reads the offer, declares the billing data and ticks the acceptance — recorded and sealed before going
// to Revolut (art. 19.1 a). The amount comes from the plan on the server; the period is given only for a
// completed order read back from Revolut with the same amount — on the return page or by the signed webhook, once.
// A plan bought during the trial starts at its end; a read-only company can pay and is open again at once.
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
const { BASE, Browser, makeAzienda, makeUser, outbox, prisma, signedIn, startApp, stopApp } = h;
const { cifraRevolut } = await import('../../src/auth/chiavi.js');
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
const dati = {
  ragioneSociale: 'Ascensori Rossi S.r.l.',
  sede: 'Via Roma 1, Milano',
  partitaIva: '01234567897',
};

async function azienda(nome: string, fino = new Date(Date.now() + 10 * GIORNO), prova = true) {
  const a = await makeAzienda(nome);
  await prisma.azienda.update({
    where: { id: a.id },
    data: { abbonamentoProva: prova, abbonamentoFino: fino },
  });
  const { browser, user } = await signedIn('ADMIN', a.id);
  return { a, browser, user };
}

const piano = (livello: number, mesi: number, prezzoCent: number) =>
  prisma.pianoAbbonamento.create({ data: { livello, mesi, prezzoCent } });

/**
 * Accepting an offer: the offer the person has seen is the one sealed. A first submission with another
 * fingerprint gets the offer for the data sent (409) — then it is accepted with its own fingerprint.
 */
async function paga(
  b: InstanceType<typeof Browser>,
  aziendaId: string,
  pianoId: string,
  extra: Record<string, string> = {},
) {
  const campi = { azienda: aziendaId, piano: pianoId, ...dati, accetto: 'si', ...extra };
  // The token of the session (any page): the offer page itself is 404 where paying is refused.
  const prima = await b.submit('/account', '/impostazioni/abbonamento/paga', {
    ...campi,
    hash: '0'.repeat(64),
  });
  if (prima.status !== 409) return prima;
  const hash = /name="hash" value="([0-9a-f]{64})"/.exec(prima.body)?.[1];
  assert.ok(hash, 'the new offer to accept');
  return b.submit('/account', '/impostazioni/abbonamento/paga', { ...campi, hash });
}

/** The copy of the offer leaves after the answer: wait for it a little. */
async function attendiPosta(test: (m: { to: string; text: string }) => boolean) {
  for (let i = 0; i < 40 && !outbox.some(test); i += 1) await new Promise((r) => setTimeout(r, 50));
  return outbox.some(test);
}

describe('paying a plan', () => {
  it('records the offer, pays on Revolut, starts the plan at the end of the trial, once', async () => {
    const { a, browser, user } = await azienda('Paga Srl');
    const p = await piano(1, 12, 29000);
    const page = await browser.get(`/impostazioni/abbonamento?azienda=${a.id}`, HTML);
    assert.match(page.body, /290,00[  ]€/);
    const offerta = await browser.get(
      `/impostazioni/abbonamento/offerta?azienda=${a.id}&piano=${p.id}`,
      HTML,
    );
    assert.equal(offerta.status, 200);
    assert.match(offerta.body, /Offerta Premium/);
    assert.match(offerta.body, /Totale da pagare ora: 290,00 €/);
    assert.match(offerta.body, /inversione contabile/);
    assert.doesNotMatch(offerta.body, /name="accetto"[^>]*checked/);

    assert.equal((await paga(browser, a.id, p.id, { accetto: '' })).status, 422);
    assert.equal((await paga(browser, a.id, p.id, { partitaIva: 'US123' })).status, 422);
    // A forged amount is not read.
    const via = await paga(browser, a.id, p.id, { totale: '1', prezzo: '1' });
    assert.equal(via.status, 303);
    assert.ok(via.location.startsWith('http://127.0.0.1:'), via.location);
    const ordine = ordineDa(via.location);
    assert.equal(ordine.amount, 29000);
    const pagamento = await prisma.pagamento.findFirstOrThrow({ where: { aziendaId: a.id } });
    assert.equal(pagamento.stato, 'IN_ATTESA');
    assert.equal(pagamento.totaleCent, 29000);
    assert.equal(ordine.reference, pagamento.id);
    const prova = await prisma.accettazioneOfferta.findUniqueOrThrow({
      where: { pagamentoId: pagamento.id },
    });
    assert.match(prova.testo, /Offerta Premium/);
    assert.equal(prova.partitaIva, 'IT01234567897');
    assert.equal(prova.userId, user.id);
    assert.match(prova.sigillo, /^[0-9a-f]{64}$/);

    // Not paid yet: the return page changes nothing.
    const presto = await browser.get(`/impostazioni/abbonamento/esito/${pagamento.id}`, HTML);
    assert.equal(presto.status, 303);
    assert.equal(
      (await prisma.pagamento.findUniqueOrThrow({ where: { id: pagamento.id } })).stato,
      'IN_ATTESA',
    );

    ordine.state = 'completed';
    const fineProva = (await prisma.azienda.findUniqueOrThrow({ where: { id: a.id } }))
      .abbonamentoFino!;
    await browser.get(`/impostazioni/abbonamento/esito/${pagamento.id}`, HTML);
    // The plan waits for the end of the trial (art. 12.3): the trial goes on as it is until then.
    const dopo = await prisma.azienda.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(dopo.abbonamentoProva, true);
    assert.equal(dopo.abbonamentoLivello, null);
    assert.equal(dopo.abbonamentoCambioAt?.toISOString(), fineProva.toISOString());
    assert.equal(dopo.abbonamentoCambioLivello, 1);
    assert.equal(
      dopo.abbonamentoFino?.toISOString(),
      scadenzaDopoMesi(fineProva, 12, new Date()).toISOString(),
    );
    const fatto = await prisma.pagamento.findUniqueOrThrow({ where: { id: pagamento.id } });
    assert.equal(fatto.stato, 'COMPLETATO');
    assert.equal(fatto.inizio?.toISOString(), fineProva.toISOString());
    assert.ok(await attendiPosta((m) => m.to === user.email && /Offerta Premium/.test(m.text)));
    const sezione = await browser.get(`/impostazioni/abbonamento?azienda=${a.id}`, HTML);
    assert.match(sezione.body, /Prova gratuita fino al/);
    assert.match(sezione.body, /Piano acquistato: livello 1 dal/);
    // Again (return page, then the webhook): nothing more.
    await browser.get(`/impostazioni/abbonamento/esito/${pagamento.id}`, HTML);
    const ev = eventoFirmato('ORDER_COMPLETED', ordine.id);
    const r = await fetch(`${BASE}/webhook/revolut`, {
      method: 'POST',
      headers: ev.headers,
      body: ev.body,
    });
    assert.equal(r.status, 200);
    const ancora = await prisma.azienda.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(ancora.abbonamentoFino?.toISOString(), dopo.abbonamentoFino?.toISOString());
  });

  it('completes by the signed webhook only, and never for a different amount', async () => {
    const scaduta = new Date(Date.now() - GIORNO);
    const { a, browser } = await azienda('Webhook Srl', scaduta, false);
    const p = await piano(1, 1, 5000);
    // A read-only company can buy a plan (art. 12.5 d).
    const via = await paga(browser, a.id, p.id);
    assert.equal(via.status, 303);
    const ordine = ordineDa(via.location);
    ordine.state = 'completed';
    const falso = eventoFirmato('ORDER_COMPLETED', ordine.id, { segreto: 'wsk_altro' });
    const no = await fetch(`${BASE}/webhook/revolut`, {
      method: 'POST',
      headers: falso.headers,
      body: falso.body,
    });
    assert.equal(no.status, 401);
    const vecchio = eventoFirmato('ORDER_COMPLETED', ordine.id, {
      timestamp: Date.now() - 10 * 60_000,
    });
    assert.equal(
      (
        await fetch(`${BASE}/webhook/revolut`, {
          method: 'POST',
          headers: vecchio.headers,
          body: vecchio.body,
        })
      ).status,
      401,
    );
    assert.equal(
      (await prisma.pagamento.findFirstOrThrow({ where: { aziendaId: a.id } })).stato,
      'IN_ATTESA',
    );
    // Revolut says a different amount: not applied.
    ordine.amount = 1;
    const ev = eventoFirmato('ORDER_COMPLETED', ordine.id);
    assert.equal(
      (
        await fetch(`${BASE}/webhook/revolut`, {
          method: 'POST',
          headers: ev.headers,
          body: ev.body,
        })
      ).status,
      200,
    );
    assert.notEqual(
      (await prisma.pagamento.findFirstOrThrow({ where: { aziendaId: a.id } })).stato,
      'COMPLETATO',
    );
    ordine.amount = 5000;
    const ok = await fetch(`${BASE}/webhook/revolut`, {
      method: 'POST',
      headers: ev.headers,
      body: ev.body,
    });
    assert.equal(ok.status, 200);
    const dopo = await prisma.azienda.findUniqueOrThrow({ where: { id: a.id } });
    assert.ok(dopo.abbonamentoFino!.getTime() > Date.now() + 25 * GIORNO);
    assert.equal((await browser.get('/schede/nuova', HTML)).status, 200, 'open again');
    // An unknown order is acknowledged and ignored.
    const ignoto = eventoFirmato('ORDER_COMPLETED', '00000000-0000-4000-8000-000000000000');
    assert.equal(
      (
        await fetch(`${BASE}/webhook/revolut`, {
          method: 'POST',
          headers: ignoto.headers,
          body: ignoto.body,
        })
      ).status,
      200,
    );
  });

  it('refuses a plan below the people of the company, and adds Bulgarian VAT in Bulgaria', async () => {
    const { a, browser } = await azienda('Grande Srl');
    for (let i = 0; i < 10; i += 1) await makeUser('TECNICO', undefined, a.id);
    const piccolo = await piano(1, 12, 29000);
    assert.equal((await paga(browser, a.id, piccolo.id)).status, 422);
    const medio = await piano(2, 12, 49000);
    const bg = await paga(browser, a.id, medio.id, { partitaIva: 'BG208725181' });
    assert.equal(bg.status, 303);
    assert.equal(ordineDa(bg.location).amount, 58800);
    // Not the ADMIN of the company: no offer, no payment.
    const { browser: tecnico } = await signedIn('TECNICO', a.id);
    assert.equal(
      (
        await tecnico.get(
          `/impostazioni/abbonamento/offerta?azienda=${a.id}&piano=${medio.id}`,
          HTML,
        )
      ).status,
      404,
    );
    const finto = await tecnico.submit('/account', '/impostazioni/abbonamento/paga', {
      azienda: a.id,
      piano: medio.id,
      ...dati,
      accetto: 'si',
    });
    assert.equal(finto.status, 404);
  });

  it('offers nothing while payments are off', async () => {
    await prisma.configPagamenti.update({ where: { id: 'revolut' }, data: { attivo: false } });
    const { a, browser } = await azienda('Spenti Srl');
    const p = await piano(3, 12, 99000);
    assert.doesNotMatch(
      (await browser.get(`/impostazioni/abbonamento?azienda=${a.id}`, HTML)).body,
      /990,00[  ]€/,
    );
    assert.equal((await paga(browser, a.id, p.id)).status, 404);
    await prisma.configPagamenti.update({ where: { id: 'revolut' }, data: { attivo: true } });
  });
});
