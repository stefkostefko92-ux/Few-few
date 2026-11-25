// The credit notes that are due (the owner, 12 November 2026: "a credit note on a refund and on a dispute"; terms
// 2026-11-14, art. 12.9; art. 115 of the Bulgarian VAT act), end to end with the fake Revolut. The portal issues
// no document: it remembers that one is due. Acceptance criteria:
//  - a refund completed by Revolut leaves ONE note due on the payment whose order got the money back, for the sum
//    refunded, to be issued within 5 days; the owner is told on Discord, without names;
//  - a refund marked by hand (a bank transfer) leaves one too; with Bulgarian VAT the taxable amount and the VAT
//    are split out of the refunded sum;
//  - a dispute lost at the bank leaves one too: note-credito-contestazione.test.ts;
//  - the MASTER records the number and the day of the note issued elsewhere — once, never in the future — and may
//    record the number of the invoice when ticking "invoiced";
//  - the accountant downloads the notes as CSV (the amounts are the credit, without a sign).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { attendiDiscord, discord, WEBHOOK_DISCORD } from './esterni-finti.js';
import {
  avviaRevolutFinto,
  CHIAVE,
  fermaRevolutFinto,
  ordineDa,
  rimborsi,
  SEGRETO_WEBHOOK,
} from './revolut-finto.js';

await avviaRevolutFinto();
const h = await import('./harness.js');
const { Browser, makeAzienda, PASSWORD, prisma, signedIn, startApp, stopApp } = h;
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

let fuori = 0;
/** A paid plan straight in the database, for the refunds marked by hand. */
const pagato = (regimeIva: string, imponibileCent: number, ivaCent: number) =>
  prisma.pagamento.create({
    data: {
      aziendaNome: 'Fuori Portale Srl',
      livello: 1,
      mesi: 12,
      imponibileCent,
      ivaCent,
      totaleCent: imponibileCent + ivaCent,
      regimeIva,
      ragioneSociale: 'Fuori Portale S.r.l.',
      sede: 'Via Roma 1, Milano',
      partitaIva: 'IT00743110157',
      stato: 'COMPLETATO',
      ambiente: 'SANDBOX',
      revolutOrderId: `ord-fuori-${++fuori}`,
      completatoAt: new Date(),
      inizio: new Date(),
      fine: new Date(Date.now() + 365 * GIORNO),
    },
  });

describe('the credit note due after a refund', () => {
  it('is recorded when Revolut completes the refund, shown to MASTER and closed with its number', async () => {
    const { a, browser } = await inProva('Nota Uno Srl');
    const { pagamento } = await paga(browser, a.id, 29000);
    await master.browser.submit(`/aziende/${a.id}`, `/aziende/${a.id}/stato`, { active: '0' });
    assert.equal(await prisma.notaCredito.count(), 0);
    rimborsi.stato = 'completed';
    discord.messaggi.length = 0;
    const via = await master.browser.submit(
      CONSOLE,
      `${CONSOLE}/${pagamento.id}/rimborso-revolut`,
      { importo: '290,00', password: PASSWORD },
    );
    assert.equal(via.status, 303, via.body.slice(0, 300));
    const riga = await prisma.rimborso.findFirstOrThrow({
      where: { perPagamentoId: pagamento.id },
    });
    assert.equal(riga.stato, 'COMPLETATO');
    const [nota, ...altre] = await prisma.notaCredito.findMany({
      where: { pagamentoId: pagamento.id },
    });
    assert.equal(altre.length, 0);
    assert.equal(nota!.origine, 'RIMBORSO');
    assert.equal(nota!.rimborsoId, riga.id);
    // Reverse charge on the invoice: the whole sum is the taxable amount.
    assert.deepEqual([nota!.imponibileCent, nota!.ivaCent, nota!.totaleCent], [29000, 0, 29000]);
    assert.equal(nota!.entroIl.getTime() - nota!.eventoAt.getTime(), 5 * GIORNO);
    assert.equal(nota!.emessaAt, null);
    assert.ok(await attendiDiscord((m) => /note di credito da emettere: 1/.test(m)));
    assert.ok(discord.messaggi.every((m) => !/Nota Uno|Verdi|@/.test(m)));

    const pagina = await master.browser.get(CONSOLE, HTML);
    assert.match(pagina.body, /id="h-note"/);
    assert.match(pagina.body, /Ascensori Verdi S\.r\.l\./);
    assert.match(pagina.body, /290,00 € \(senza IVA\)/);
    assert.match(pagina.body, /non ancora fatturato/);
    const azione = `${CONSOLE}/note-credito/${nota!.id}/emessa`;
    assert.ok(pagina.body.includes(`action="${azione}"`));

    // The number of the invoice, written when it is ticked as issued, shows next to the note.
    const brutto = await master.browser.submit(CONSOLE, `${CONSOLE}/${pagamento.id}/fatturato`, {
      numero: '<script>',
    });
    assert.equal(brutto.status, 303);
    assert.equal(
      (await prisma.pagamento.findUniqueOrThrow({ where: { id: pagamento.id } })).fatturataAt,
      null,
    );
    await master.browser.submit(CONSOLE, `${CONSOLE}/${pagamento.id}/fatturato`, {
      numero: '2026/0042',
    });
    assert.match((await master.browser.get(CONSOLE, HTML)).body, /n\. 2026\/0042/);

    // Without a number, or with a day in the future: nothing is recorded.
    const domani = new Date(Date.now() + 2 * GIORNO).toISOString().slice(0, 10);
    const oggi = new Date(Date.now() - GIORNO).toISOString().slice(0, 10);
    for (const male of [
      { numero: '', data: oggi },
      { numero: 'NC-7', data: domani },
      { numero: 'NC-7', data: '14/11/2026' },
    ]) {
      assert.equal((await master.browser.submit(CONSOLE, azione, male)).status, 303);
      assert.equal(
        (await prisma.notaCredito.findUniqueOrThrow({ where: { id: nota!.id } })).emessaAt,
        null,
      );
    }
    assert.equal(
      (await master.browser.submit(CONSOLE, azione, { numero: 'NC-7', data: oggi })).status,
      303,
    );
    const emessa = await prisma.notaCredito.findUniqueOrThrow({ where: { id: nota!.id } });
    assert.equal(emessa.numero, 'NC-7');
    assert.equal(emessa.emessaAt?.toISOString().slice(0, 10), oggi);
    assert.equal(await prisma.auditLog.count({ where: { action: 'NOTA_CREDITO_EMESSA' } }), 1);
    // Once: a second number does not replace the first.
    await master.browser.submit(CONSOLE, azione, { numero: 'NC-8', data: oggi });
    assert.equal(
      (await prisma.notaCredito.findUniqueOrThrow({ where: { id: nota!.id } })).numero,
      'NC-7',
    );
    const dopo = await master.browser.get(CONSOLE, HTML);
    assert.match(dopo.body, /Ultime emesse/);
    assert.match(dopo.body, /n\. NC-7 del/);
    assert.ok(!dopo.body.includes(`action="${azione}"`));

    const csv = await master.browser.get(`${CONSOLE}/note-credito.csv`);
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type') ?? '', /text\/csv/);
    assert.match(csv.body, /"Imponibile a credito";"IVA a credito";"Totale a credito"/);
    assert.match(csv.body, /"290,00";"0,00";"290,00"/);
    assert.match(csv.body, /"2026\/0042"/);
    assert.match(csv.body, /"NC-7"/);
    // Only for MASTER.
    const { browser: admin } = await signedIn('ADMIN');
    assert.equal((await admin.get(`${CONSOLE}/note-credito.csv`)).status, 403);
  });

  it('is recorded for a refund marked by hand, with the Bulgarian VAT split out of the sum', async () => {
    const intero = await pagato('iva-bg-ue', 29000, 5800);
    const via = await master.browser.submit(CONSOLE, `${CONSOLE}/${intero.id}/rimborso`, {
      importo: '348,00',
    });
    assert.equal(via.status, 303);
    const nota = await prisma.notaCredito.findFirstOrThrow({ where: { pagamentoId: intero.id } });
    assert.equal(nota.origine, 'RIMBORSO');
    assert.equal(nota.rimborsoId, null);
    assert.deepEqual([nota.imponibileCent, nota.ivaCent, nota.totaleCent], [29000, 5800, 34800]);
    // A partial refund of a Bulgarian customer: 100,00 € is 83,33 € + 16,67 €.
    const parte = await pagato('iva-bg', 29000, 5800);
    await master.browser.submit(CONSOLE, `${CONSOLE}/${parte.id}/rimborso`, { importo: '100,00' });
    const piccola = await prisma.notaCredito.findFirstOrThrow({ where: { pagamentoId: parte.id } });
    assert.deepEqual(
      [piccola.imponibileCent, piccola.ivaCent, piccola.totaleCent],
      [8333, 1667, 10000],
    );
    const pagina = await master.browser.get(CONSOLE, HTML);
    assert.match(pagina.body, /290,00 € \+ IVA 58,00 € = 348,00 €/);
    assert.match(pagina.body, /83,33 € \+ IVA 16,67 € = 100,00 €/);
  });
});
