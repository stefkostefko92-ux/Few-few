// The sale with Bulgarian VAT to a company whose VAT number is not valid in VIES stays under the threshold of
// art. 59c of Directive 2006/112/EC (terms 2026-11-14, art. 12.10 b), end to end with the fake VIES and Revolut.
// Acceptance criteria:
//  - such sales stop online at 10 000 € net a year: the page says to write to us, nothing is stored and the owner
//    is told on Discord, without names; a company with a valid number is not touched;
//  - the threshold is of the whole company: the owner writes what was sold outside the portal, this year and last
//    year, and it counts; above the threshold last year — no such sale this year;
//  - the owner can switch the regime off: then, as before 4.1, the purchase with that number is not concluded.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { attendiDiscord, discord, vies, WEBHOOK_DISCORD } from './esterni-finti.js';
import { avviaRevolutFinto, CHIAVE, fermaRevolutFinto } from './revolut-finto.js';

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

describe('the threshold for the sales with Bulgarian VAT without VIES', () => {
  it('stops these sales online at the threshold of 10 000 € a year, and tells the owner', async () => {
    // 9 900 € of such sales already this year: one more of 290 € would cross the threshold.
    const gia = await makeAzienda('Vies Soglia Vecchia');
    await prisma.pagamento.create({
      data: {
        aziendaId: gia.id,
        aziendaNome: gia.name,
        livello: 3,
        mesi: 36,
        imponibileCent: 990_000,
        ivaCent: 198_000,
        totaleCent: 1_188_000,
        regimeIva: 'iva-bg-ue',
        ragioneSociale: 'Vies Soglia Vecchia S.r.l.',
        sede: 'Via Dante 3, Bologna',
        partitaIva: 'IT00488410010',
        stato: 'COMPLETATO',
        ambiente: 'SANDBOX',
        revolutOrderId: 'ord-soglia-vecchia',
        completatoAt: new Date(),
        inizio: new Date(),
        fine: new Date(Date.now() + 365 * GIORNO),
      },
    });
    const { a, browser, dati } = await inProva('Vies Soglia', '00154920102');
    const p = await piano();
    vies.risposte.set('IT00154920102', 'nonValida');
    discord.messaggi.length = 0;
    const { esito } = await accetta(browser, a.id, p.id, dati);
    assert.equal(esito.status, 422);
    assert.match(esito.body, /non possiamo concludere l&#39;acquisto qui nel portale/);
    assert.equal(await prisma.pagamento.count({ where: { aziendaId: a.id } }), 0);
    assert.ok(await attendiDiscord((m) => /soglia di 10\.000/.test(m)));
    assert.ok(discord.messaggi.every((m) => !/Vies Soglia|@/.test(m)));
    // A company with a number valid in VIES is not touched by the threshold.
    const valida = await inProva('Vies Soglia Valida', '02313821007');
    const ok = await accetta(valida.browser, valida.a.id, p.id, valida.dati);
    assert.equal(ok.esito.status, 303, ok.esito.body.slice(0, 300));
    await prisma.pagamento.deleteMany({ where: { aziendaId: gia.id } });
  });

  it('counts the sales outside the portal in the threshold, and refuses when the owner switches the regime off', async () => {
    // The sales of the tests above are not this test's: the year starts from zero.
    await prisma.pagamento.deleteMany({ where: { regimeIva: 'iva-bg-ue' } });
    const { a, browser, dati } = await inProva('Vies Altre', '00154920102');
    const p = await piano();
    vies.risposte.set('IT00154920102', 'nonValida');
    const { browser: master } = await signedIn('MASTER');
    const console = await master.get('/master/pagamenti', HTML);
    assert.match(console.body, /IVA con partita IVA non valida nel VIES/);
    assert.match(console.body, /su 10\.000,00\s€ \(0\s%\)/);
    // The threshold is of the whole company: the owner writes what was sold elsewhere this year.
    const male = await master.submit('/master/pagamenti', '/master/pagamenti/iva', {
      senzaVies: '1',
      altre: 'tanto',
    });
    assert.equal(male.status, 303);
    assert.equal(
      (await prisma.configPagamenti.findUniqueOrThrow({ where: { id: 'revolut' } }))
        .altreVenditeUeCent,
      0,
    );
    await master.submit('/master/pagamenti', '/master/pagamenti/iva', {
      senzaVies: '1',
      altre: '9.990,00',
    });
    assert.match(
      (await master.get('/master/pagamenti', HTML)).body,
      /9\.990,00\s€ fuori dal portale = 9\.990,00\s€ su 10\.000,00\s€ \(99\s%\)/,
    );
    const piena = await accetta(browser, a.id, p.id, dati);
    assert.equal(piena.esito.status, 422);
    assert.match(piena.esito.body, /non possiamo concludere l&#39;acquisto qui nel portale/);
    // Switched off (and the other sales back to 0): as before 4.1, the purchase with that number is not concluded.
    await master.submit('/master/pagamenti', '/master/pagamenti/iva', { altre: '' });
    const cfg = await prisma.configPagamenti.findUniqueOrThrow({ where: { id: 'revolut' } });
    assert.equal(cfg.senzaVies, false);
    assert.equal(cfg.altreVenditeUeCent, 0);
    const spento = await accetta(browser, a.id, p.id, dati);
    assert.equal(spento.esito.status, 422);
    assert.match(spento.esito.body, /l&#39;acquisto qui non si può concludere/);
    assert.equal(await prisma.pagamento.count({ where: { aziendaId: a.id } }), 0);
    // The threshold must not have been crossed last year either: with last year's other sales above it, no sale.
    await master.submit('/master/pagamenti', '/master/pagamenti/iva', {
      senzaVies: '1',
      altre: '0',
      altrePrecedente: '10.000,01',
    });
    const annoScorso = await accetta(browser, a.id, p.id, dati);
    assert.equal(annoScorso.esito.status, 422);
    assert.match(annoScorso.esito.body, /non possiamo concludere l&#39;acquisto qui nel portale/);
    assert.match((await master.get('/master/pagamenti', HTML)).body, /hanno superato la soglia/);
    // On again: the offer comes back with the Bulgarian VAT.
    await master.submit('/master/pagamenti', '/master/pagamenti/iva', {
      senzaVies: '1',
      altre: '0',
    });
    const acceso = await accetta(browser, a.id, p.id, dati);
    assert.equal(acceso.esito.status, 409);
    assert.match(acceso.esito.body, /IVA bulgara/);
    // Only for MASTER.
    const no = await browser.submit('/account', '/master/pagamenti/iva', { altre: '1' });
    assert.equal(no.status, 403);
  });
});
