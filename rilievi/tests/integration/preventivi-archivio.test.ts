// Quotes turned off on a company that already has data (the owner, 14 November 2026 — "направи го както
// трябва да бъде по най-добрия начин"; the review of Правният Разбирач: with quotes off the customers in the
// registry could be neither read nor deleted by the company, while the terms, A.9, promise that the portal
// lets it consult and delete). Acceptance criteria:
//  - the MASTER turns quotes off: nothing is deleted; the company keeps an archive when it has quotes,
//    customers or a price list (`Azienda.preventiviArchivio`), not when it never used them;
//  - in the archive, who had the quote rights reads the quotes (page, PDF, list, CSV), the customers and the
//    price list, and deletes a customer or a draft — nothing is created, changed or sent, and each page says
//    why; who never had the rights, and another company, still get nothing;
//  - the company that never used quotes sees nothing, as before;
//  - turned on again, everything works as before and the archive ends.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';
import { accendi, base, crea, RIGHE } from './preventivi-dati.js';

before(startApp);
after(stopApp);

const ultimo = (location: string): string => location.split('/').pop()!;

describe('quotes turned off on a company with data', () => {
  it('keeps them readable and deletable, never written, for who had the rights', async () => {
    const azienda = await makeAzienda('Archivio Preventivi');
    const { browser: master } = await signedIn('MASTER');
    await accendi(master, azienda.id, true);
    const { browser } = await signedIn('RESPONSABILE', azienda.id);
    const { browser: tecnico } = await signedIn('TECNICO', azienda.id);
    const altra = await makeAzienda('Archivio Altra');
    await accendi(master, altra.id, true);
    const { browser: estraneo } = await signedIn('ADMIN', altra.id);

    const cliente = ultimo(
      (await browser.submit('/clienti/nuovo', '/clienti', { nome: 'Condominio Archivio' }))
        .location,
    );
    const bozza = await crea(browser, {
      ...RIGHE,
      cliente: 'Condominio Archivio',
      clienteId: cliente,
    });
    const inviato = await crea(browser, RIGHE);
    await prisma.preventivo.update({ where: { id: inviato }, data: { stato: 'INVIATO' } });
    await prisma.voceListino.create({
      data: { aziendaId: azienda.id, descrizione: 'Manodopera', unita: 'h', prezzo: 4500, iva: 22 },
    });

    await accendi(master, azienda.id, false);
    const riga = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.equal(riga.preventiviAttivi, false);
    assert.equal(riga.preventiviArchivio, true);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'AZIENDA_PREVENTIVI', aziendaId: azienda.id },
      orderBy: { at: 'desc' },
    });
    assert.deepEqual(audit.meta, { attivi: false, archivio: true });

    // Reading: the lists, the pages, the PDF, the CSV, the price list — each page says quotes are off.
    const elenco = await browser.get('/preventivi');
    assert.equal(elenco.status, 200);
    assert.match(elenco.body, /data-preventivi-archivio/);
    assert.match(elenco.body, new RegExp(`href="/preventivi/${bozza}"`));
    assert.doesNotMatch(elenco.body, /href="\/preventivi\/nuovo"/);
    const pagina = await browser.get(`/preventivi/${bozza}`);
    assert.equal(pagina.status, 200);
    assert.match(pagina.body, /data-preventivi-archivio/);
    assert.doesNotMatch(pagina.body, new RegExp(`href="/preventivi/${bozza}/modifica"`));
    assert.doesNotMatch(pagina.body, /\/preventivi\/nuovo\?da=/);
    assert.doesNotMatch(pagina.body, new RegExp(`action="/preventivi/${bozza}/invia"`));
    assert.match(pagina.body, new RegExp(`action="/preventivi/${bozza}/elimina"`));
    const pdf = await browser.get(`/preventivi/${inviato}/pdf`);
    assert.equal(pdf.status, 200);
    assert.equal((await browser.get('/preventivi/esporta.csv')).status, 200);
    assert.match(
      (await browser.get(`/preventivi/listino?azienda=${azienda.id}`)).body,
      /Manodopera/,
    );
    const clienti = await browser.get('/clienti');
    assert.equal(clienti.status, 200);
    assert.match(clienti.body, /data-preventivi-archivio/);
    assert.match(clienti.body, /Condominio Archivio/);
    assert.doesNotMatch(clienti.body, /href="\/clienti\/nuovo/);
    const profilo = await browser.get(`/clienti/${cliente}`);
    assert.equal(profilo.status, 200);
    assert.doesNotMatch(profilo.body, new RegExp(`href="/clienti/${cliente}/modifica"`));
    assert.doesNotMatch(profilo.body, /\/preventivi\/nuovo\?cliente=/);
    assert.match(profilo.body, new RegExp(`action="/clienti/${cliente}/elimina"`));
    // The menu: the two pages, nothing to create.
    const menu = (await browser.get('/schede')).body;
    assert.match(menu, /href="\/preventivi"/);
    assert.match(menu, /href="\/clienti"/);
    assert.doesNotMatch(menu, /href="\/preventivi\/nuovo"|href="\/clienti\/nuovo"/);

    // Nothing is created, changed or sent.
    assert.equal((await browser.get('/preventivi/nuovo')).status, 403);
    assert.equal((await browser.get('/clienti/nuovo')).status, 403);
    assert.equal((await browser.get(`/clienti/elenco.json?azienda=${azienda.id}`)).status, 403);
    assert.equal((await browser.get(`/preventivi/${bozza}/modifica`)).status, 403);
    assert.equal((await browser.get(`/clienti/${cliente}/modifica`)).status, 403);
    const csrf = await browser.csrf(`/clienti/${cliente}`);
    for (const [adr, form] of [
      ['/preventivi', { ...RIGHE, azienda: azienda.id }],
      ['/clienti', { nome: 'Nuovo', azienda: azienda.id }],
      [`/clienti/${cliente}`, { nome: 'Cambiato', base: new Date().toISOString() }],
      [`/preventivi/${bozza}/invia`, { email: 'cliente@example.it' }],
      [`/preventivi/${inviato}/stato`, { stato: 'ACCETTATO' }],
      [`/preventivi/${inviato}/cliente`, {}],
      ['/preventivi/listino', { azienda: azienda.id, descrizione: 'X', unita: 'pz', prezzo: '1' }],
    ] as const) {
      const reply = await browser.post(adr, { _csrf: csrf, ...form });
      assert.equal(reply.status, 403, adr);
    }
    assert.equal(
      (await prisma.cliente.findUniqueOrThrow({ where: { id: cliente } })).nome,
      'Condominio Archivio',
    );
    assert.equal(await prisma.preventivo.count({ where: { aziendaId: azienda.id } }), 2);

    // Who never had the rights, and another company: nothing, as before.
    assert.equal((await tecnico.get('/preventivi')).status, 403);
    assert.equal((await tecnico.get('/clienti')).status, 403);
    assert.equal((await estraneo.get(`/preventivi/${bozza}`)).status, 404);
    assert.equal((await estraneo.get(`/clienti/${cliente}`)).status, 404);

    // Deleting what is saved: the customer (the quote keeps its own copy) and the draft.
    const tolto = await browser.submit(`/clienti/${cliente}`, `/clienti/${cliente}/elimina`, {});
    assert.equal(tolto.status, 303);
    assert.equal(await prisma.cliente.count({ where: { id: cliente } }), 0);
    const tolta = await browser.submit(`/preventivi/${bozza}`, `/preventivi/${bozza}/elimina`, {});
    assert.equal(tolta.status, 303);
    assert.equal(await prisma.preventivo.count({ where: { id: bozza } }), 0);

    // On again: work as before, and the archive ends.
    await accendi(master, azienda.id, true);
    assert.equal(
      (await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } })).preventiviArchivio,
      false,
    );
    assert.equal((await browser.get('/preventivi/nuovo')).status, 200);
    assert.doesNotMatch((await browser.get('/preventivi')).body, /data-preventivi-archivio/);
  });

  it('lets the MASTER correct what is saved, never send, mark or create (A.9)', async () => {
    // The review of Кодаджията, 14 November 2026: the MASTER passes every capability, so in the archive he
    // could still send a quote, mark it accepted or create from it. The terms (2026-11-15, 2.5 and A.9) give
    // him only the correction on the written instruction of the company.
    const azienda = await makeAzienda('Archivio Master');
    const { browser: master } = await signedIn('MASTER');
    await accendi(master, azienda.id, true);
    const { browser } = await signedIn('ADMIN', azienda.id);
    const cliente = ultimo(
      (await browser.submit('/clienti/nuovo', '/clienti', { nome: 'Condominio Master' })).location,
    );
    const bozza = await crea(browser, { ...RIGHE, cliente: 'Cliente a mano' });
    const inviato = await crea(browser, RIGHE);
    await prisma.preventivo.update({ where: { id: inviato }, data: { stato: 'INVIATO' } });
    await accendi(master, azienda.id, false);

    const pagina = (await master.get(`/preventivi/${inviato}`)).body;
    assert.match(pagina, /data-preventivi-archivio/);
    assert.match(pagina, /solo su istruzione scritta dell&#39;azienda/);
    assert.match(pagina, new RegExp(`href="/preventivi/${inviato}/modifica"`));
    assert.doesNotMatch(pagina, new RegExp(`action="/preventivi/${inviato}/(stato|invia)"`));
    assert.doesNotMatch(pagina, /\/preventivi\/nuovo\?da=/);
    assert.doesNotMatch(
      (await master.get(`/preventivi/${bozza}`)).body,
      new RegExp(`action="/preventivi/${bozza}/cliente"`),
    );
    assert.doesNotMatch(
      (await master.get(`/clienti/${cliente}`)).body,
      /\/preventivi\/nuovo\?cliente=/,
    );

    // The correction: the content of the quote and the customer's profile.
    const corretto = await master.submit(
      `/preventivi/${inviato}/modifica`,
      `/preventivi/${inviato}`,
      { ...RIGHE, cliente: 'Nome corretto', base: await base(master, inviato) },
    );
    assert.equal(corretto.status, 303);
    assert.equal(
      (await prisma.preventivo.findUniqueOrThrow({ where: { id: inviato } })).cliente,
      'Nome corretto',
    );
    const profilo = await master.submit(`/clienti/${cliente}/modifica`, `/clienti/${cliente}`, {
      nome: 'Condominio Corretto',
      base: (
        await prisma.cliente.findUniqueOrThrow({ where: { id: cliente } })
      ).updatedAt.toISOString(),
    });
    assert.equal(profilo.status, 303);

    // Nothing else: no state, no email, no profile from the quote, no new quote or price list row.
    const csrf = await master.csrf(`/preventivi/${inviato}`);
    for (const [adr, form] of [
      [`/preventivi/${inviato}/stato`, { stato: 'ACCETTATO', base: new Date().toISOString() }],
      [`/preventivi/${inviato}/invia`, { email: 'cliente@example.it' }],
      [`/preventivi/${bozza}/cliente`, {}],
    ] as const) {
      assert.equal((await master.post(adr, { _csrf: csrf, ...form })).status, 404, adr);
    }
    assert.equal(
      (await prisma.preventivo.findUniqueOrThrow({ where: { id: inviato } })).stato,
      'INVIATO',
    );
    const copia = await master.get(`/preventivi/nuovo?da=${inviato}`);
    assert.equal(copia.status, 303);
    assert.equal(copia.location, '/preventivi/nuovo');
    assert.equal((await master.get(`/preventivi/nuovo?cliente=${cliente}`)).status, 303);
    assert.equal(
      (await master.post('/preventivi', { _csrf: csrf, ...RIGHE, azienda: azienda.id })).status,
      422,
    );
    await master.post('/preventivi/listino', {
      _csrf: csrf,
      azienda: azienda.id,
      descrizione: 'Voce',
      unita: 'pz',
      prezzo: '1',
      iva: '22',
    });
    assert.equal(await prisma.voceListino.count({ where: { aziendaId: azienda.id } }), 0);
    assert.equal(await prisma.preventivo.count({ where: { aziendaId: azienda.id } }), 2);
    assert.equal(await prisma.cliente.count({ where: { aziendaId: azienda.id } }), 1);
  });

  it('shows nothing to a company that never used quotes', async () => {
    const azienda = await makeAzienda('Archivio Mai Usati');
    const { browser: master } = await signedIn('MASTER');
    await accendi(master, azienda.id, true);
    await accendi(master, azienda.id, false);
    assert.equal(
      (await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } })).preventiviArchivio,
      false,
    );
    const { browser } = await signedIn('ADMIN', azienda.id);
    assert.equal((await browser.get('/preventivi')).status, 403);
    assert.equal((await browser.get('/clienti')).status, 403);
    assert.doesNotMatch(
      (await browser.get('/schede')).body,
      /href="\/preventivi"|href="\/clienti"/,
    );
  });
});
