// The price list from the settings, filled at once (the owner, 13 November 2026: "Нямаме listino prezzi,
// направи го от impostazioni за да можем да правим preventivi по-бързо и лесно"). Acceptance criteria:
//  - «Listino prezzi» is a section of the company's settings (only with quotes on): the card says how many
//    rows there are; a row is added, changed and deleted from there, and one comes back there;
//  - a pasted sheet is first shown (how many new rows, how many updated by their code) and writes nothing;
//    confirmed, all its rows are written or none; a row whose code is in the list updates that row;
//  - a row that cannot be read stops everything and is named by its number; the list never passes its limit;
//  - who writes quotes in the company but does not manage its settings does the same from the quotes page;
//    nobody else can; the audit has the numbers, never the prices;
//  - the list goes out as a file for Excel and comes back the same; the quote form is told where the list
//    is managed.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { MAX_VOCI } from '../../src/preventivi/listino.js';
import { makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const HTML = { accept: 'text/html' };

async function aziendaConPreventivi(name: string) {
  const azienda = await makeAzienda(name);
  await prisma.azienda.update({ where: { id: azienda.id }, data: { preventiviAttivi: true } });
  return azienda;
}

const FOGLIO =
  'Codice\tDescrizione\tUM\tPrezzo €\tIVA %\n' +
  'QM-01\tQuadro di manovra VVVF\tpz\t4.850,00\t10\n' +
  'FU-10\tFune 10 mm\tm\t3,20\t22\n' +
  '\tManodopera specializzata\th\t48,50\t22\n';

/** The fingerprint the preview page gives to «Conferma e importa». */
const improntaDi = (body: string): string => {
  const m = /name="impronta" value="([0-9a-f]{64})"/.exec(body);
  assert.ok(m, 'the preview carries the fingerprint of what was looked at');
  return m[1]!;
};

const voci = (aziendaId: string) =>
  prisma.voceListino.findMany({
    where: { aziendaId },
    orderBy: { descrizione: 'asc' },
    select: { codice: true, descrizione: true, unita: true, prezzo: true, iva: true },
  });

describe('the price list in the settings', () => {
  it('is a section of the settings only with quotes on, and a row is managed from there', async () => {
    const spenta = await makeAzienda('Listino Spento');
    const { browser: senza } = await signedIn('ADMIN', spenta.id);
    assert.doesNotMatch((await senza.get('/impostazioni', HTML)).body, /\/impostazioni\/listino/);
    assert.equal((await senza.get(`/impostazioni/listino?azienda=${spenta.id}`, HTML)).status, 404);

    const azienda = await aziendaConPreventivi('Listino Impostazioni');
    const { browser } = await signedIn('ADMIN', azienda.id);
    const sezione = `/impostazioni/listino?azienda=${azienda.id}`;
    const hub = await browser.get('/impostazioni', HTML);
    assert.match(hub.body, /href="\/impostazioni\/listino\?azienda=/);
    assert.match(hub.body, /Listino vuoto/);
    const pagina = await browser.get(sezione, HTML);
    assert.equal(pagina.status, 200);
    assert.match(pagina.body, /<h1>Listino prezzi<\/h1>/);
    assert.match(pagina.body, /action="\/preventivi\/listino"/);
    assert.match(pagina.body, /action="\/preventivi\/listino\/importa"/);
    assert.match(pagina.body, /name="da" value="impostazioni"/);
    // The quotes section of the settings sends there, not to another page.
    assert.match(
      (await browser.get(`/impostazioni/preventivi?azienda=${azienda.id}`, HTML)).body,
      /href="\/impostazioni\/listino\?azienda=/,
    );

    const voce = {
      azienda: azienda.id,
      da: 'impostazioni',
      codice: 'QM-01',
      descrizione: 'Quadro VVVF',
      unita: 'pz',
      prezzo: '4850',
      iva: '10',
    };
    const aggiunta = await browser.submit(sezione, '/preventivi/listino', voce);
    assert.equal(aggiunta.status, 303);
    assert.equal(aggiunta.location, sezione);
    const dopo = await browser.get(sezione, HTML);
    assert.match(dopo.body, /Voce aggiunta al listino/);
    assert.match(dopo.body, /Quadro VVVF/);
    assert.match(dopo.body, /4\.850,00/);
    assert.match((await browser.get('/impostazioni', HTML)).body, /1 voce/);

    // A wrong row comes back on the settings page, with what was typed.
    const doppia = await browser.submit(sezione, '/preventivi/listino', {
      ...voce,
      descrizione: 'Doppio codice',
    });
    assert.equal(doppia.status, 422);
    assert.match(doppia.body, /Questo codice è già nel listino/);
    assert.match(doppia.body, /value="Doppio codice"/);
    assert.match(doppia.body, /class="sottonav"/);

    // Changing and deleting a row from there comes back there.
    const riga = await prisma.voceListino.findFirstOrThrow({ where: { aziendaId: azienda.id } });
    const modifica = `/preventivi/listino/${riga.id}?azienda=${azienda.id}&da=impostazioni`;
    assert.match(
      dopo.body,
      new RegExp(
        `href="/preventivi/listino/${riga.id}\\?azienda=${azienda.id}&amp;da=impostazioni"`,
      ),
    );
    const scheda = await browser.get(modifica, HTML);
    assert.match(scheda.body, /href="\/impostazioni\/listino\?azienda=/);
    const salvata = await browser.submit(modifica, modifica, { ...voce, prezzo: '4.900,50' });
    assert.equal(salvata.location, sezione);
    assert.equal((await voci(azienda.id))[0]!.prezzo, 490050);
    const eliminata = await browser.submit(
      modifica,
      `/preventivi/listino/${riga.id}/elimina?azienda=${azienda.id}&da=impostazioni`,
      {},
    );
    assert.equal(eliminata.location, sezione);
    assert.equal(await prisma.voceListino.count({ where: { aziendaId: azienda.id } }), 0);
  });

  it('fills the list at once: first what will happen, then all the rows or none', async () => {
    const azienda = await aziendaConPreventivi('Listino Importa');
    const { browser, user } = await signedIn('ADMIN', azienda.id);
    const sezione = `/impostazioni/listino?azienda=${azienda.id}`;
    const importa = (testo: string, altro: Record<string, string> = {}) =>
      browser.submit(sezione, '/preventivi/listino/importa', {
        azienda: azienda.id,
        da: 'impostazioni',
        testo,
        unita: 'pz',
        iva: '22',
        ...altro,
      });
    /** Looked at, then confirmed with the fingerprint of what was looked at — as the page does. */
    const conferma = async (testo: string) => {
      const vista = await importa(testo);
      assert.equal(vista.status, 200, vista.body.slice(0, 300));
      return importa(testo, { conferma: '1', impronta: improntaDi(vista.body) });
    };
    const quante = () => prisma.voceListino.count({ where: { aziendaId: azienda.id } });

    // Looked at first: the numbers and the rows, nothing written.
    const anteprima = await importa(FOGLIO);
    assert.equal(anteprima.status, 200);
    assert.match(anteprima.body, /Voci nuove: 3/);
    assert.match(anteprima.body, /Voci aggiornate \(stesso codice\): 0/);
    assert.match(anteprima.body, /Quadro di manovra VVVF/);
    assert.match(anteprima.body, /name="conferma" value="1"/);
    assert.equal(await quante(), 0);

    // Only what was looked at is written: a confirmation without the fingerprint, or with the text changed
    // after the look, shows the (new) summary and writes nothing.
    const senza = await importa(FOGLIO, { conferma: '1' });
    assert.equal(senza.status, 200);
    assert.match(senza.body, /Le righe sono cambiate dopo il controllo/);
    const cambiato = await importa(`${FOGLIO}EX-1\tRiga aggiunta dopo\tpz\t1\t22\n`, {
      conferma: '1',
      impronta: improntaDi(anteprima.body),
    });
    assert.equal(cambiato.status, 200);
    assert.match(cambiato.body, /Voci nuove: 4/);
    assert.equal(await quante(), 0);
    // The first button of the form only checks (Enter in a field never confirms).
    assert.match(
      anteprima.body,
      /action="\/preventivi\/listino\/importa" novalidate>\s*<button type="submit" hidden><\/button>/,
    );

    const fatto = await importa(FOGLIO, { conferma: '1', impronta: improntaDi(anteprima.body) });
    assert.equal(fatto.status, 303);
    assert.equal(fatto.location, sezione);
    assert.match(
      (await browser.get(sezione, HTML)).body,
      /Listino aggiornato\. Voci nuove: 3; voci aggiornate: 0\./,
    );
    assert.deepEqual(await voci(azienda.id), [
      { codice: 'FU-10', descrizione: 'Fune 10 mm', unita: 'm', prezzo: 320, iva: 22 },
      { codice: null, descrizione: 'Manodopera specializzata', unita: 'h', prezzo: 4850, iva: 22 },
      {
        codice: 'QM-01',
        descrizione: 'Quadro di manovra VVVF',
        unita: 'pz',
        prezzo: 485000,
        iva: 10,
      },
    ]);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'LISTINO_UPDATE', aziendaId: azienda.id },
      orderBy: { at: 'desc' },
    });
    assert.equal(audit.actorId, user.id);
    assert.deepEqual(audit.meta, { azione: 'importazione', nuove: 3, aggiornate: 0 });

    // The same sheet again doubles nothing: the codes are found, the row without a code is already there.
    const ancora = await importa(FOGLIO);
    assert.match(ancora.body, /Voci nuove: 0/);
    assert.match(ancora.body, /Voci aggiornate \(stesso codice\): 2/);
    assert.match(ancora.body, /già presenti nel listino, non aggiunte: 1/);
    assert.equal((await conferma(FOGLIO)).status, 303);
    assert.equal(await quante(), 3);

    // New prices for the same codes update those rows; a new code is added.
    const nuoviPrezzi =
      'QM-01;Quadro di manovra VVVF;pz;5.100,00;10\nFU-10;Fune 10 mm;m;3,45\nOL-1;Olio;l;9';
    const seconda = await importa(nuoviPrezzi);
    assert.match(seconda.body, /Voci nuove: 1/);
    assert.match(seconda.body, /Voci aggiornate \(stesso codice\): 2/);
    assert.match(seconda.body, /Voci nel listino dopo l&#39;importazione: 4/);
    assert.equal((await conferma(nuoviPrezzi)).status, 303);
    assert.deepEqual(
      (await voci(azienda.id)).map((v) => [v.codice, v.prezzo]),
      [
        ['FU-10', 345],
        [null, 4850],
        ['OL-1', 900],
        ['QM-01', 510000],
      ],
    );

    // A row that cannot be read stops everything, confirmed or not, and is named by its number.
    for (const altro of [{}, { conferma: '1' }] as Array<Record<string, string>>) {
      const rotta = await importa('Z1;Voce buona;pz;10\nZ2;Voce senza prezzo;pz;gratis', altro);
      assert.equal(rotta.status, 422);
      assert.match(rotta.body, /Riga 2/);
      assert.match(rotta.body, /non è un prezzo valido/);
      // What was pasted is still in the box.
      assert.match(rotta.body, /Z2;Voce senza prezzo;pz;gratis/);
    }
    // Columns in another order are refused, never read as they come: the VAT is not taken for the price.
    const spostate = await importa('A1;Porta;100;22');
    assert.equal(spostate.status, 422);
    assert.match(spostate.body, /U\.M\.: è un numero: controlla l&#39;ordine delle colonne/);
    const due = await importa('Codice;Descrizione;Costo;Prezzo\nA1;Porta;50;100');
    assert.equal(due.status, 422);
    assert.match(due.body, /Due colonne per lo stesso dato: Costo, Prezzo/);
    assert.equal(await quante(), 4);
    assert.equal((await importa('', { conferma: '1' })).status, 422);
    assert.equal((await importa('Fune;3,20', { conferma: '1' })).status, 422);

    // Never over the limit of the list: nothing of the sheet is written.
    await prisma.voceListino.createMany({
      data: Array.from({ length: MAX_VOCI - 5 }, (_, i) => ({
        aziendaId: azienda.id,
        codice: `P${i}`,
        descrizione: `Riempitivo ${i}`,
        unita: 'pz',
        prezzo: 100,
        iva: 22,
      })),
    });
    const piena = await importa('N1;Una;pz;1\nN2;Due;pz;1', { conferma: '1' });
    assert.equal(piena.status, 422);
    assert.match(piena.body, /al massimo 1000 voci/);
    assert.equal(await quante(), MAX_VOCI - 1);
    // One row still fits; an update of an existing code always does.
    assert.equal((await conferma('N1;Una;pz;1\nP0;Riempitivo 0;pz;2')).status, 303);
    assert.equal(await quante(), MAX_VOCI);
    // A whole list of new prices goes in as one write, well inside the time a transaction has.
    const tutti = Array.from(
      { length: MAX_VOCI - 5 },
      (_, i) => `P${i};Riempitivo ${i};pz;${i + 1},50`,
    ).join('\n');
    const inizio = Date.now();
    assert.equal((await conferma(tutti)).status, 303);
    assert.ok(Date.now() - inizio < 4000, `${Date.now() - inizio} ms`);
    const p7 = await prisma.voceListino.findFirstOrThrow({
      where: { aziendaId: azienda.id, codice: 'P7' },
    });
    assert.equal(p7.prezzo, 850);
    assert.equal(await quante(), MAX_VOCI);
    // The audit never carries a price.
    const righe = await prisma.auditLog.findMany({
      where: { action: 'LISTINO_UPDATE', aziendaId: azienda.id },
    });
    assert.doesNotMatch(JSON.stringify(righe), /prezzo|5100|510000/);
  });

  it('is for who writes quotes in that company, from the quotes page too', async () => {
    const azienda = await aziendaConPreventivi('Listino Permessi');
    const corpo = { azienda: azienda.id, testo: FOGLIO, unita: 'pz', iva: '22', conferma: '1' };

    // Writes quotes, does not manage the settings: the same tools on the quotes page.
    const { browser: responsabile } = await signedIn('RESPONSABILE', azienda.id);
    assert.equal(
      (await responsabile.get(`/impostazioni/listino?azienda=${azienda.id}`, HTML)).status,
      403,
    );
    const pagina = `/preventivi/listino?azienda=${azienda.id}`;
    const vista = await responsabile.get(pagina, HTML);
    assert.match(vista.body, /action="\/preventivi\/listino\/importa"/);
    assert.doesNotMatch(vista.body, /name="da" value="impostazioni"/);
    // Saying «from the settings» without managing them still lands on the quotes page.
    const guardato = await responsabile.submit(pagina, '/preventivi/listino/importa', {
      ...corpo,
      conferma: '',
    });
    const fatto = await responsabile.submit(pagina, '/preventivi/listino/importa', {
      ...corpo,
      impronta: improntaDi(guardato.body),
      da: 'impostazioni',
    });
    assert.equal(fatto.status, 303);
    assert.equal(fatto.location, pagina);
    assert.equal(await prisma.voceListino.count({ where: { aziendaId: azienda.id } }), 3);

    // Does not write quotes: nothing.
    const { browser: tecnico } = await signedIn('TECNICO', azienda.id);
    assert.equal(
      (await tecnico.submit('/account', '/preventivi/listino/importa', corpo)).status,
      403,
    );
    assert.equal((await tecnico.get(`/preventivi/listino.csv?azienda=${azienda.id}`)).status, 403);
    // Another company: the list is not there for them.
    const altra = await aziendaConPreventivi('Listino Altra');
    const { browser: estraneo } = await signedIn('ADMIN', altra.id);
    assert.equal(
      (await estraneo.submit('/account', '/preventivi/listino/importa', corpo)).status,
      404,
    );
    assert.equal((await estraneo.get(`/preventivi/listino.csv?azienda=${azienda.id}`)).status, 404);
    // Without the token of the form nothing is written.
    assert.equal((await responsabile.post('/preventivi/listino/importa', corpo)).status, 403);
    assert.equal(await prisma.voceListino.count({ where: { aziendaId: azienda.id } }), 3);
    assert.equal(await prisma.voceListino.count({ where: { aziendaId: altra.id } }), 0);
  });

  it('goes out for Excel and comes back the same; the quote form knows where the list is', async () => {
    const azienda = await aziendaConPreventivi('Listino Excel');
    const { browser } = await signedIn('ADMIN', azienda.id);
    const sezione = `/impostazioni/listino?azienda=${azienda.id}`;
    const foglio = {
      azienda: azienda.id,
      da: 'impostazioni',
      testo: FOGLIO,
      unita: 'pz',
      iva: '22',
    };
    const guardato = await browser.submit(sezione, '/preventivi/listino/importa', foglio);
    const dentro = await browser.submit(sezione, '/preventivi/listino/importa', {
      ...foglio,
      conferma: '1',
      impronta: improntaDi(guardato.body),
    });
    assert.equal(dentro.status, 303);

    const file = await browser.get(`/preventivi/listino.csv?azienda=${azienda.id}`);
    assert.equal(file.status, 200);
    assert.match(file.headers.get('content-type') ?? '', /text\/csv/);
    assert.match(file.headers.get('content-disposition') ?? '', /attachment; filename="listino-/);
    assert.match(file.body, /^﻿"Codice";"Descrizione";"Unità";"Prezzo €";"IVA %"\r\n/);
    assert.match(file.body, /"QM-01";"Quadro di manovra VVVF";"pz";"4850,00";"10"\r\n/);
    assert.match(file.body, /"";"Manodopera specializzata";"h";"48,50";"22"\r\n/);
    // Pasted back as it is, nothing is new: the rows with a code are found by it, the one without is there.
    const indietro = await browser.submit(sezione, '/preventivi/listino/importa', {
      azienda: azienda.id,
      da: 'impostazioni',
      testo: file.body,
      unita: 'pz',
      iva: '22',
    });
    assert.equal(indietro.status, 200);
    assert.match(indietro.body, /Voci nuove: 0/);
    assert.match(indietro.body, /Voci aggiornate \(stesso codice\): 2/);
    assert.match(indietro.body, /già presenti nel listino, non aggiunte: 1/);

    // The quote form: where the list of the chosen company is managed — the settings for who manages them.
    const json = JSON.parse(
      (await browser.get(`/preventivi/listino.json?azienda=${azienda.id}`)).body,
    ) as { gestione: string; voci: unknown[] };
    assert.equal(json.gestione, sezione);
    assert.equal(json.voci.length, 3);
    const { browser: responsabile } = await signedIn('RESPONSABILE', azienda.id);
    const suo = JSON.parse(
      (await responsabile.get(`/preventivi/listino.json?azienda=${azienda.id}`)).body,
    ) as { gestione: string };
    assert.equal(suo.gestione, `/preventivi/listino?azienda=${azienda.id}`);
    // And the form carries the note for an empty list (shown by the script when the list has no rows).
    const forma = await browser.get(`/preventivi/nuovo?azienda=${azienda.id}`, HTML);
    assert.match(forma.body, /data-listino-vuoto/);
  });
});
