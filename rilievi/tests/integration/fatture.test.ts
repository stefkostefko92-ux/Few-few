// The invoice of a paid plan, in the console of MASTER ("Da fatturare"), end to end with the fake VIES and the fake
// Revolut (the owner, 28 November 2026 — the review of the Tax adviser, H1, H2, M4; not tax advice). Acceptance
// criteria:
//  - H1: with the reverse charge the invoice goes to the name and address VIES gave (art. 18(1)(a) of Implementing
//    Regulation (EU) No 282/2011). When the name in VIES differs from the declared one (case, punctuation and the
//    legal form do not count), or VIES gives no name, the row says so and shows both names — the sale is not
//    stopped; the decision is MASTER's, before the invoice. The same name written another way says nothing;
//  - H2: every row carries "Entro il" — the payment plus 5 days (art. 113(4) of the Bulgarian VAT act); a payment
//    whose deadline is within a day is reminded on Discord (count only); "invoiced" needs the number AND the date
//    of the invoice (not in the future) — the date is its own column, not the moment of the tick; both show next
//    to the credit note (art. 115(4)) and in the CSV;
//  - M4: the text for MASTER lists the particulars of each regime.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { attendiDiscord, discord, vies, WEBHOOK_DISCORD } from './esterni-finti.js';
import { avviaRevolutFinto, CHIAVE, fermaRevolutFinto, ordineDa } from './revolut-finto.js';

await avviaRevolutFinto();
const h = await import('./harness.js');
const { Browser, makeAzienda, outbox, prisma, signedIn, startApp, stopApp } = h;
const { cifraAllarmi, cifraRevolut } = await import('../../src/auth/chiavi.js');
const { ricordaFattureInScadenza } = await import('../../src/pagamenti/fatture.js');

let master: Awaited<ReturnType<typeof signedIn>>;

before(async () => {
  await startApp();
  await prisma.configPagamenti.create({
    data: { id: 'revolut', attivo: true, ambiente: 'SANDBOX', chiaveEnc: cifraRevolut(CHIAVE) },
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
const hashDi = (body: string) => /name="hash" value="([0-9a-f]{64})"/.exec(body)?.[1] ?? '';
const giorno = (d: Date) => d.toISOString().slice(0, 10);

/** A company in its trial that pays a plan with the reverse charge (the number is valid in the fake VIES). */
async function paga(nome: string, ragioneSociale: string, partitaIva: string) {
  const a = await makeAzienda(nome);
  const dati = { ragioneSociale, sede: 'Via Dante 3, Bologna', partitaIva };
  await prisma.azienda.update({
    where: { id: a.id },
    data: {
      abbonamentoProva: true,
      abbonamentoFino: new Date(Date.now() + 10 * GIORNO),
      datiSocietari: { ragioneSociale, indirizzo: dati.sede, partitaIva },
    },
  });
  const { browser } = await signedIn('ADMIN', a.id);
  const piano = await prisma.pianoAbbonamento.create({
    data: { livello: 1, mesi: 12, prezzoCent: 29000 },
  });
  const vista = await browser.get(
    `/impostazioni/abbonamento/offerta?azienda=${a.id}&piano=${piano.id}`,
    HTML,
  );
  const esito = await browser.submit('/account', '/impostazioni/abbonamento/paga', {
    azienda: a.id,
    piano: piano.id,
    ...dati,
    accetto: 'si',
    hash: hashDi(vista.body),
  });
  assert.equal(esito.status, 303, esito.body.slice(0, 300));
  const ordine = ordineDa(esito.location);
  ordine.state = 'completed';
  await (browser as InstanceType<typeof Browser>).get(
    `/impostazioni/abbonamento/esito/${ordine.reference}`,
    HTML,
  );
  return prisma.pagamento.findUniqueOrThrow({ where: { id: ordine.reference } });
}

/** The row of the payment in "Da fatturare": from its form back to the start of the row. */
function riga(pagina: string, id: string): string {
  const fine = pagina.indexOf(`action="/master/pagamenti/${id}/fatturato"`);
  assert.ok(fine > 0, 'the row is in "Da fatturare"');
  return pagina.slice(pagina.lastIndexOf('<tr>', fine), fine);
}

describe('the invoice of a paid plan', () => {
  it('warns when the name in VIES is not the declared one, and says nothing when it is', async () => {
    const uguale = await paga('Fattura Uguale', 'Ascensori Verdi S.r.l.', '01234567897');
    const diverso = await paga('Fattura Diversa', 'Lift Bianchi S.r.l.', '00743110157');
    vies.risposte.set('IT01114601006', 'senzaDati');
    const senza = await paga('Fattura Senza Nome', 'Elevatori Neri S.p.A.', '01114601006');
    assert.equal(diverso.viesNome, 'ASCENSORI VERDI S.R.L.');
    assert.equal(senza.viesNome, null);

    const pagina = (await master.browser.get(CONSOLE, HTML)).body;
    assert.doesNotMatch(riga(pagina, uguale.id), /non corrisponde|non comunica/);
    const r = riga(pagina, diverso.id);
    assert.match(r, /Il nome nel VIES non corrisponde a quello dichiarato/);
    assert.match(r, /Dichiarato: Lift Bianchi S\.r\.l\./);
    assert.match(r, /Nel VIES: ASCENSORI VERDI S\.R\.L\./);
    assert.match(r, /VIA DANTE 3 40100 BOLOGNA BO/);
    assert.match(riga(pagina, senza.id), /Il VIES non comunica il nome/);
    assert.match(riga(pagina, senza.id), /Dichiarato: Elevatori Neri S\.p\.A\./);
    // The sale went through all the same: the decision is MASTER's.
    assert.equal(diverso.stato, 'COMPLETATO');
    // The mail with the data for the invoice says it too.
    assert.ok(
      outbox.some(
        (m) =>
          m.to === master.user.email &&
          /Fattura Diversa/.test(m.subject) &&
          /non corrisponde/.test(m.text) &&
          /ASCENSORI VERDI S\.R\.L\./.test(m.text),
      ),
    );
    // M4: the particulars of each regime and the name and address of VIES are in the text above the table.
    assert.match(pagina, /nome e all&#39;indirizzo dati dal VIES/);
    assert.match(pagina, /«обратно начисляване»/);
    assert.match(pagina, /art\. 196 della Direttiva 2006\/112\/CE/);
    assert.match(pagina, /aliquota 20 %/);
  });

  it('carries the deadline, reminds it, and is ticked only with the number and the date', async () => {
    const p = await paga('Fattura Termine', 'Ascensori Verdi S.r.l.', '01234567897');
    const entro = new Date(p.completatoAt!.getTime() + 5 * GIORNO);
    const pagina = (await master.browser.get(CONSOLE, HTML)).body;
    assert.match(pagina, /Entro il/);
    const fmt = new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    assert.ok(riga(pagina, p.id).includes(fmt.format(entro)), 'the deadline is on the row');

    // The reminder: nothing within a day yet; four days and a bit later — the payments within a day, on Discord.
    assert.equal(await ricordaFattureInScadenza(new Date()), 0);
    discord.messaggi.length = 0;
    const n = await ricordaFattureInScadenza(new Date(Date.now() + 4.5 * GIORNO));
    assert.ok(n >= 1);
    assert.ok(await attendiDiscord((m) => /fatture da emettere entro un giorno: \d+/.test(m)));
    assert.ok(discord.messaggi.every((m) => !/Termine|Verdi|@/.test(m)));

    const segna = (dati: Record<string, string>) =>
      master.browser.submit(CONSOLE, `${CONSOLE}/${p.id}/fatturato`, dati);
    // Paid two days ago: an invoice for an advance is never dated before the payment (the review of Кодаджията).
    await prisma.pagamento.update({
      where: { id: p.id },
      data: { completatoAt: new Date(Date.now() - 2 * GIORNO) },
    });
    const oggi = giorno(new Date());
    const domani = giorno(new Date(Date.now() + 2 * GIORNO));
    const primaDelPagamento = giorno(new Date(Date.now() - 4 * GIORNO));
    const casi: Array<Record<string, string>> = [
      {},
      { numero: '2026/0042' },
      { data: oggi },
      { numero: '', data: oggi },
      { numero: '<script>', data: oggi },
      { numero: '2026/0042', data: domani },
      { numero: '2026/0042', data: '20/11/2026' },
      { numero: '2026/0042', data: primaDelPagamento },
    ];
    for (const male of casi) {
      assert.equal((await segna(male)).status, 303);
      const ora = await prisma.pagamento.findUniqueOrThrow({ where: { id: p.id } });
      assert.equal(ora.fatturataAt, null, JSON.stringify(male));
    }
    const ieri = giorno(new Date(Date.now() - GIORNO));
    assert.equal((await segna({ numero: '2026/0042', data: ieri })).status, 303);
    const fatto = await prisma.pagamento.findUniqueOrThrow({ where: { id: p.id } });
    assert.equal(fatto.fatturaNumero, '2026/0042');
    assert.equal(fatto.fatturaData && giorno(fatto.fatturaData), ieri);
    assert.ok(fatto.fatturataAt);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'PAGAMENTO_FATTURATO', targetId: p.id },
    });
    assert.deepEqual(audit.meta, { fatturaNumero: '2026/0042', fatturaData: ieri });
    // Once: a second tick changes nothing.
    await segna({ numero: '2026/0099', data: oggi });
    assert.equal(
      (await prisma.pagamento.findUniqueOrThrow({ where: { id: p.id } })).fatturaNumero,
      '2026/0042',
    );
    // Off the list, and in the CSV with its date.
    const dopo = (await master.browser.get(CONSOLE, HTML)).body;
    assert.ok(!dopo.includes(`action="/master/pagamenti/${p.id}/fatturato"`));
    const csv = (await master.browser.get(`${CONSOLE}/esporta.csv`)).body;
    assert.match(csv, /"Data fattura"/);
    assert.match(csv, /"2026\/0042"/);
  });
});
