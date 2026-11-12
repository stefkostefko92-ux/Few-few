// The workflow of a sheet (owner, 12 November 2026 — points C2, C4, C6, C7):
// - C6: a sheet of QR labels that open the sheet (only the address in the code);
// - C4: every save is a version with its differences; "Duplica" starts a new sheet from another, without
//   the identity of the lift;
// - C7: the company may turn on a two-step approval (off by default): the technician sends, someone with
//   `schede:approve` — never the sender — approves or sends back with a note; editing an approved sheet
//   reopens it; orders leave only from an approved sheet;
// - C2: the supplier book of the company; a supplier form leaves by email from the portal with its PDF and
//   the sender as reply-to; the sent order is then confirmed or cancelled.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  Browser,
  makeAzienda,
  makeUser,
  outbox,
  prisma,
  signedIn,
  startApp,
  stopApp,
} from './harness.js';

before(startApp);
after(stopApp);

const HTML = { accept: 'text/html' };
const SURVEY = {
  data: '2026-10-12',
  numeroImpianto: '880011',
  matricola: 'TO 1234',
  indirizzo: 'Via Roma 1, Torino',
  fermate: '5',
  portataKg: '480',
  marca: 'Schindler',
  tipoPorte: ['AUTOMATICHE'],
  quadroMarca: 'PELAZZA',
  quadroOrdine: 'si',
  'oq-_': '1',
  'oq-ordine': 'si',
  'oq-cliente': 'Ascensori Prova',
  'oq-nFermate': '5',
};

async function create(browser: Browser, form: Record<string, string | string[]> = SURVEY) {
  const reply = await browser.submit('/schede/nuova', '/schede', form);
  assert.equal(reply.status, 303, `create failed with ${reply.status}`);
  return reply.location.split('/').pop()!;
}

async function edit(browser: Browser, id: string, form: Record<string, string | string[]>) {
  const page = await browser.get(`/schede/${id}/modifica`);
  const base = /name="base" value="([^"]+)"/.exec(page.body)![1]!;
  return browser.submit(`/schede/${id}/modifica`, `/schede/${id}`, { ...form, base });
}

describe('the workflow of a sheet', () => {
  it('prints QR labels that open the sheet, for those who see it', async () => {
    const azienda = await makeAzienda('Etichette Ascensori');
    const { browser } = await signedIn('TECNICO', azienda.id);
    const id = await create(browser);
    const page = await browser.get(`/schede/${id}/etichetta`);
    assert.equal(page.status, 200);
    assert.equal(page.body.match(/class="etichetta"/g)?.length, 24);
    assert.match(page.body, /<svg[^>]*viewBox/);
    assert.match(page.body, /TO 1234/);
    assert.match(page.body, /noindex, nofollow/);
    assert.equal(
      (await browser.get(`/schede/${id}/etichetta?n=1`)).body.match(/class="etichetta"/g)?.length,
      1,
    );
    assert.equal((await new Browser().get(`/schede/${id}/etichetta`)).status, 302);
    const { browser: altro } = await signedIn('TECNICO', (await makeAzienda('Altre Etichette')).id);
    assert.equal((await altro.get(`/schede/${id}/etichetta`)).status, 404);
  });

  it('keeps a version for every save, shows what changed, and duplicates without the identity', async () => {
    const azienda = await makeAzienda('Versioni Ascensori');
    const { browser } = await signedIn('TECNICO', azienda.id);
    const id = await create(browser);
    assert.equal((await edit(browser, id, { ...SURVEY, marca: 'Otis' })).status, 303);
    const versioni = await prisma.schedaVersione.findMany({
      where: { schedaId: id },
      orderBy: { numero: 'asc' },
    });
    assert.deepEqual(
      versioni.map((v) => v.numero),
      [1, 2],
    );
    const diff = await browser.get(`/schede/${id}/versioni/2`, HTML);
    assert.equal(diff.status, 200);
    assert.match(diff.body, /Schindler/);
    assert.match(diff.body, /Otis/);
    assert.match((await browser.get(`/schede/${id}`, HTML)).body, /Versioni \(2\)/);

    const nuova = await browser.get(`/schede/nuova?da=${id}`, HTML);
    assert.equal(nuova.status, 200);
    assert.match(nuova.body, /value="Otis"/);
    assert.doesNotMatch(nuova.body, /value="TO 1234"/);
    assert.doesNotMatch(nuova.body, /value="880011"/);
    const { browser: altro } = await signedIn('TECNICO', (await makeAzienda('Altre Versioni')).id);
    assert.equal((await altro.get(`/schede/nuova?da=${id}`)).status, 404);
  });

  it('approves in two steps when the company wants it, and orders only from approved sheets', async () => {
    const azienda = await makeAzienda('Approva Ascensori');
    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    const { browser: tecnico } = await signedIn('TECNICO', azienda.id);
    const responsabile = await makeUser('RESPONSABILE', undefined, azienda.id);
    const resp = new Browser();
    await resp.login(responsabile.email);
    const id = await create(tecnico);
    // Off by default: nothing to approve, orders free.
    assert.doesNotMatch((await tecnico.get(`/schede/${id}`, HTML)).body, /Invia per approvazione/);
    await admin.submit(`/impostazioni/scheda?azienda=${azienda.id}`, '/impostazioni/approvazione', {
      azienda: azienda.id,
      attiva: '1',
    });
    assert.equal(
      (await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } })).approvazioneSchede,
      true,
    );
    const bloccata = await tecnico.submit(`/schede/${id}`, `/schede/${id}/ordini/invia`, {
      modulo: 'ordine-quadro',
      nome: 'Pelazza',
      email: 'ordini@pelazza.example',
    });
    assert.equal(bloccata.status, 303);
    assert.equal((await tecnico.get(bloccata.location)).status, 200);

    await tecnico.submit(`/schede/${id}`, `/schede/${id}/approvazione/invia`, {});
    assert.equal(
      (await prisma.scheda.findUniqueOrThrow({ where: { id } })).statoApprovazione,
      'INVIATA',
    );
    const _csrf = await tecnico.csrf(`/schede/${id}`);
    assert.equal(
      (await tecnico.post(`/schede/${id}/approvazione/decidi`, { _csrf, decisione: 'approva' }))
        .status,
      403,
      'a technician does not approve',
    );
    assert.match((await resp.get('/schede', HTML)).body, /1 scheda da approvare/);
    await resp.submit(`/schede/${id}`, `/schede/${id}/approvazione/decidi`, {
      decisione: 'respingi',
      nota: 'Manca la portata',
    });
    let row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.equal(row.statoApprovazione, 'RESPINTA');
    assert.equal(row.notaApprovazione, 'Manca la portata');
    await tecnico.submit(`/schede/${id}`, `/schede/${id}/approvazione/invia`, {});
    await resp.submit(`/schede/${id}`, `/schede/${id}/approvazione/decidi`, {
      decisione: 'approva',
    });
    row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.equal(row.statoApprovazione, 'APPROVATA');
    assert.equal(row.approvazioneDaId, responsabile.id);

    // The sender never approves his own sheet.
    const id2 = await create(resp);
    await resp.submit(`/schede/${id2}`, `/schede/${id2}/approvazione/invia`, {});
    await resp.submit(`/schede/${id2}`, `/schede/${id2}/approvazione/decidi`, {
      decisione: 'approva',
    });
    assert.equal(
      (await prisma.scheda.findUniqueOrThrow({ where: { id: id2 } })).statoApprovazione,
      'INVIATA',
    );

    // Editing an approved sheet sends it back to draft.
    await edit(tecnico, id, { ...SURVEY, marca: 'Kone' });
    assert.equal(
      (await prisma.scheda.findUniqueOrThrow({ where: { id } })).statoApprovazione,
      'BOZZA',
    );
  });

  it('sends a supplier form by email from the book, then confirms the order', async () => {
    const azienda = await makeAzienda('Ordini Ascensori');
    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    const { user: tecnicoUser, browser: tecnico } = await signedIn('TECNICO', azienda.id);
    const impostazioni = `/impostazioni/fornitori?azienda=${azienda.id}`;
    assert.equal(
      (
        await admin.submit(impostazioni, '/impostazioni/fornitori', {
          azienda: azienda.id,
          nome: 'X',
          email: 'no',
        })
      ).status,
      422,
    );
    await admin.submit(impostazioni, '/impostazioni/fornitori', {
      azienda: azienda.id,
      nome: 'Pelazza S.p.A.',
      email: 'Ordini@Pelazza.example',
    });
    const fornitore = await prisma.fornitore.findFirstOrThrow({ where: { aziendaId: azienda.id } });
    assert.equal(fornitore.email, 'ordini@pelazza.example');

    const id = await create(tecnico);
    const form = await tecnico.get(`/schede/${id}/ordini/invia?modulo=ordine-quadro`, HTML);
    assert.equal(form.status, 200);
    assert.match(form.body, /Pelazza S\.p\.A\./);
    const prima = outbox.length;
    const sent = await tecnico.submit(
      `/schede/${id}/ordini/invia?modulo=ordine-quadro`,
      `/schede/${id}/ordini/invia`,
      {
        modulo: 'ordine-quadro',
        fornitore: fornitore.id,
        messaggio: 'Urgente, grazie.',
      },
    );
    assert.equal(sent.status, 303);
    const mail = outbox.slice(prima).find((m) => m.to === 'ordini@pelazza.example');
    assert.ok(mail, 'the order leaves');
    assert.equal(mail.replyTo, tecnicoUser.email);
    assert.match(mail.text, /Urgente, grazie\./);
    assert.equal(mail.attachments?.[0]?.contentType, 'application/pdf');
    // No SMTP in the tests: a message that did not leave is not an order.
    assert.equal(await prisma.ordineFornitore.count({ where: { schedaId: id } }), 0);

    const ordine = await prisma.ordineFornitore.create({
      data: {
        aziendaId: azienda.id,
        schedaId: id,
        modulo: 'ordine-quadro',
        destinatarioNome: 'Pelazza S.p.A.',
        destinatarioEmail: 'ordini@pelazza.example',
      },
    });
    const pagina = await tecnico.get(`/schede/${id}`, HTML);
    assert.match(pagina.body, /Segna come confermato/);
    await tecnico.submit(`/schede/${id}`, `/ordini/${ordine.id}/stato`, {
      stato: 'CONFERMATO',
      nota: 'Consegna 20/11',
      scheda: id,
    });
    const confermato = await prisma.ordineFornitore.findUniqueOrThrow({ where: { id: ordine.id } });
    assert.equal(confermato.stato, 'CONFERMATO');
    assert.ok(confermato.confermatoAt);
    assert.match((await tecnico.get('/ordini?stato=CONFERMATO', HTML)).body, /Pelazza S\.p\.A\./);
    const { browser: altro } = await signedIn('TECNICO', (await makeAzienda('Altri Ordini')).id);
    await altro.submit('/account', `/ordini/${ordine.id}/stato`, { stato: 'ANNULLATO' });
    assert.equal(
      (await prisma.ordineFornitore.findUniqueOrThrow({ where: { id: ordine.id } })).stato,
      'CONFERMATO',
    );
  });
});
