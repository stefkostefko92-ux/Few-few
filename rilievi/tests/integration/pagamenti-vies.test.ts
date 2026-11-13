// The VAT number is checked in VIES before a plan is sold with the reverse charge (terms 2026-11-13, art. 12.10;
// art. 18(1)(a) of Implementing Regulation (EU) No 282/2011), end to end with the fake VIES and the fake Revolut.
// Acceptance criteria:
//  - a company of another member state: VIES is asked when the offer is accepted, with our number as the
//    requester; valid → the order is opened and the payment keeps the consultation number, the moment and the
//    name and address VIES gave; the same offer accepted twice does not ask again;
//  - not valid in VIES (the owner, 12 November 2026: the alternative; terms 2026-11-14, art. 12.10): the offer is
//    shown again with Bulgarian VAT 20 % and why — nothing is stored until THAT offer is accepted; then the order
//    is for the total with VAT, in a regime of its own, with the moment VIES said "not valid" as the evidence;
//  - the threshold of 10 000 € a year for such sales and the owner's switch: pagamenti-soglia.test.ts;
//  - VIES does not answer → nothing is sold "to be checked later"; when VIES is back, the purchase works;
//  - a Bulgarian company pays 20 % VAT and VIES is not asked;
//  - the accountant finds the consultation number in the CSV of the payments.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { vies, WEBHOOK_DISCORD } from './esterni-finti.js';
import { avviaRevolutFinto, CHIAVE, fermaRevolutFinto, ordineDa, ordini } from './revolut-finto.js';

await avviaRevolutFinto();
const h = await import('./harness.js');
const { Browser, makeAzienda, prisma, signedIn, startApp, stopApp } = h;
const { cifraAllarmi, cifraRevolut } = await import('../../src/auth/chiavi.js');

before(async () => {
  await startApp();
  await prisma.configPagamenti.create({
    data: { id: 'revolut', attivo: true, ambiente: 'SANDBOX', chiaveEnc: cifraRevolut(CHIAVE) },
  });
  await prisma.configAllarmi.create({
    data: { id: 'discord', attivo: true, urlEnc: cifraAllarmi(WEBHOOK_DISCORD) },
  });
});
after(async () => {
  await stopApp();
  await fermaRevolutFinto();
});

const HTML = { accept: 'text/html' };
const GIORNO = 24 * 60 * 60 * 1000;
const hashDi = (body: string) => /name="hash" value="([0-9a-f]{64})"/.exec(body)?.[1] ?? '';

async function inProva(nome: string, partitaIva: string) {
  const a = await makeAzienda(nome);
  const dati = { ragioneSociale: `${nome} S.r.l.`, sede: 'Via Dante 3, Bologna', partitaIva };
  await prisma.azienda.update({
    where: { id: a.id },
    data: {
      abbonamentoProva: true,
      abbonamentoFino: new Date(Date.now() + 10 * GIORNO),
      datiSocietari: { ragioneSociale: dati.ragioneSociale, indirizzo: dati.sede, partitaIva },
    },
  });
  const { browser } = await signedIn('ADMIN', a.id);
  return { a, browser, dati };
}

async function accetta(
  b: InstanceType<typeof Browser>,
  aziendaId: string,
  pianoId: string,
  dati: Record<string, string>,
) {
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

const piano = () =>
  prisma.pianoAbbonamento.create({ data: { livello: 1, mesi: 12, prezzoCent: 29000 } });

describe('the VAT number in VIES before the reverse charge', () => {
  it('opens the order for a valid number and keeps the consultation with the payment', async () => {
    const { a, browser, dati } = await inProva('Vies Valida', '01234567897');
    const p = await piano();
    const prima = vies.richieste.length;
    const { vista, esito } = await accetta(browser, a.id, p.id, dati);
    // The page says what happens on acceptance.
    assert.match(vista.body, /VIES/);
    assert.equal(esito.status, 303, esito.body.slice(0, 300));
    assert.equal(vies.richieste.length, prima + 1);
    assert.deepEqual(vies.richieste.at(-1), {
      countryCode: 'IT',
      vatNumber: '01234567897',
      requesterMemberStateCode: 'BG',
      requesterNumber: '208725180',
    });
    const ordine = ordineDa(esito.location);
    const pagamento = await prisma.pagamento.findUniqueOrThrow({ where: { id: ordine.reference } });
    assert.equal(pagamento.regimeIva, 'inversione');
    assert.equal(pagamento.ivaCent, 0);
    assert.match(pagamento.viesConsultazione ?? '', /^WAPIAAAAY\d+xYz$/);
    assert.ok(pagamento.viesAt && Date.now() - pagamento.viesAt.getTime() < 60_000);
    assert.equal(pagamento.viesNome, 'ASCENSORI VERDI S.R.L.');
    assert.equal(pagamento.viesIndirizzo, 'VIA DANTE 3 40100 BOLOGNA BO');

    // The same offer accepted again (back, a second tab): the same order, and VIES is not asked twice.
    const ancora = await accetta(browser, a.id, p.id, dati);
    assert.equal(ancora.esito.status, 303);
    assert.equal(ancora.esito.location, esito.location);
    assert.equal(vies.richieste.length, prima + 1);

    // The accountant: the consultation number is in the CSV of the payments.
    const master = await signedIn('MASTER');
    const csv = await master.browser.get('/master/pagamenti/esporta.csv');
    assert.equal(csv.status, 200);
    assert.ok(csv.body.includes(pagamento.viesConsultazione!));
    // And in the console, on the row to invoice once it is paid.
    ordine.state = 'completed';
    await browser.get(`/impostazioni/abbonamento/esito/${ordine.reference}`, HTML);
    const console = await master.browser.get('/master/pagamenti', HTML);
    assert.ok(console.body.includes(pagamento.viesConsultazione!));
  });

  it('sells with Bulgarian VAT when the number is not valid in VIES, after showing the offer again', async () => {
    const { a, browser, dati } = await inProva('Vies Non Valida', '00743110157');
    const p = await piano();
    vies.risposte.set('IT00743110157', 'nonValida');
    const ordiniPrima = ordini.size;
    // The offer first seen has no VAT (nobody has asked VIES yet): accepting it does not sell — it comes back
    // with the VAT, the total and the reason, and nothing is stored.
    const prima = await accetta(browser, a.id, p.id, dati);
    assert.match(prima.vista.body, /290,00\s€/);
    assert.equal(prima.esito.status, 409);
    assert.match(prima.esito.body, /non risulta valida nel VIES/);
    assert.match(prima.esito.body, /IVA bulgara/);
    assert.match(prima.esito.body, /58,00/);
    assert.match(prima.esito.body, /348,00/);
    assert.notEqual(hashDi(prima.esito.body), hashDi(prima.vista.body));
    assert.equal(await prisma.pagamento.count({ where: { aziendaId: a.id } }), 0);
    assert.equal(await prisma.accettazioneOfferta.count({ where: { aziendaId: a.id } }), 0);
    assert.equal(ordini.size, ordiniPrima);

    // The offer with VAT, accepted: the order is for the total, the sealed text carries the VAT.
    const seconda = await browser.submit('/account', '/impostazioni/abbonamento/paga', {
      azienda: a.id,
      piano: p.id,
      ...dati,
      accetto: 'si',
      hash: hashDi(prima.esito.body),
    });
    assert.equal(seconda.status, 303, seconda.body.slice(0, 300));
    const ordine = ordineDa(seconda.location);
    assert.equal(ordine.amount, 34800);
    const pagamento = await prisma.pagamento.findUniqueOrThrow({ where: { id: ordine.reference } });
    assert.deepEqual(
      [pagamento.regimeIva, pagamento.imponibileCent, pagamento.ivaCent, pagamento.totaleCent],
      ['iva-bg-ue', 29000, 5800, 34800],
    );
    // The evidence: when VIES said "not valid" — and no consultation number, name or address.
    assert.ok(pagamento.viesAt && Date.now() - pagamento.viesAt.getTime() < 60_000);
    assert.deepEqual(
      [pagamento.viesConsultazione, pagamento.viesNome, pagamento.viesIndirizzo],
      [null, null, null],
    );
    const sigillata = await prisma.accettazioneOfferta.findUniqueOrThrow({
      where: { pagamentoId: pagamento.id },
    });
    assert.match(sigillata.testo, /IVA bulgara/);
    assert.equal(sigillata.totaleCent, 34800);
    // The accountant tells it from the reverse charge and from the domestic sale.
    const master = await signedIn('MASTER');
    const csv = await master.browser.get('/master/pagamenti/esporta.csv');
    assert.match(csv.body, /senza partita IVA valida nel VIES/);
  });

  it('sells nothing while VIES does not answer, and sells when it is back', async () => {
    const { a, browser, dati } = await inProva('Vies Muta', '00488410010');
    const p = await piano();
    for (const guasto of ['MS_UNAVAILABLE', 'TIMEOUT'] as const) {
      vies.risposte.set('IT00488410010', guasto);
      const { esito } = await accetta(browser, a.id, p.id, dati);
      assert.equal(esito.status, 503);
      assert.match(esito.body, /in questo momento non risponde/);
      assert.equal(await prisma.pagamento.count({ where: { aziendaId: a.id } }), 0);
    }
    // VIES is back, without name and address (some member states do not disclose them): the purchase works.
    vies.risposte.set('IT00488410010', 'senzaDati');
    const { esito } = await accetta(browser, a.id, p.id, dati);
    assert.equal(esito.status, 303, esito.body.slice(0, 300));
    const pagamento = await prisma.pagamento.findFirstOrThrow({ where: { aziendaId: a.id } });
    assert.ok(pagamento.viesConsultazione);
    assert.equal(pagamento.viesNome, null);
    assert.equal(pagamento.viesIndirizzo, null);
  });

  it('does not ask VIES for a Bulgarian company: 20 % VAT', async () => {
    const { a, browser, dati } = await inProva('Asansyori Sofia', 'BG123456789');
    const p = await piano();
    const prima = vies.richieste.length;
    const { esito } = await accetta(browser, a.id, p.id, dati);
    assert.equal(esito.status, 303, esito.body.slice(0, 300));
    assert.equal(vies.richieste.length, prima);
    const pagamento = await prisma.pagamento.findFirstOrThrow({ where: { aziendaId: a.id } });
    assert.equal(pagamento.regimeIva, 'iva-bg');
    assert.equal(pagamento.ivaCent, 5800);
    assert.equal(pagamento.viesConsultazione, null);
    assert.equal(pagamento.viesAt, null);
  });
});
