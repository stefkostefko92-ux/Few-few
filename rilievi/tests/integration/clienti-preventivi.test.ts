// The customers registry and the quotes (the owner, 13 November 2026: "да не трябва да ги пишат всеки път когато
// правят Preventivi"). Acceptance criteria:
//  - a quote is written for a registered customer without typing the data again (the list for the form, the
//    new quote of a profile), keeps the link, and the profile lists its quotes;
//  - who has more than one company (the MASTER) still says which company a copied or prefilled quote is for;
//  - a quote is tied only to a profile it names (the server decides, not the browser);
//  - the registry never passes its limit; export and deletion carry it.
// The profile itself (create, search, version, rights) — clienti.test.ts; the customer of a quote into the
// registry — clienti-dal-preventivo.test.ts.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { eliminaAzienda } from '../../src/aziende/eliminazione.js';
import { esportaAzienda } from '../../src/aziende/esportazione.js';
import { MAX_CLIENTI } from '../../src/clienti/service.js';
import { makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';
import { base, crea, RIGHE } from './preventivi-dati.js';
import { readTar } from './tar.js';

before(startApp);
after(stopApp);

async function aziendaConPreventivi(name: string) {
  const azienda = await makeAzienda(name);
  await prisma.azienda.update({ where: { id: azienda.id }, data: { preventiviAttivi: true } });
  return azienda;
}

const PIENO = {
  nome: 'Condominio Via Roma 12',
  indirizzo: 'Via Roma 12, 20121 Milano (MI)',
  piva: 'IT 0123 4567 890',
  email: 'Amministratore@Studio-Bianchi.it',
  telefono: '+39 379 29 69 699, +359 877 414 874',
  referente: 'Stefan Kostadinov',
  note: 'Citofono 14, portineria solo la mattina',
};

const ultimo = (location: string): string => location.split('/').pop()!;

describe('the customers registry and the quotes', () => {
  it('fills a quote without typing the data again and keeps the link', async () => {
    const azienda = await aziendaConPreventivi('Clienti Preventivo');
    const { browser } = await signedIn('RESPONSABILE', azienda.id);
    const { browser: master } = await signedIn('MASTER');
    const id = ultimo((await browser.submit('/clienti/nuovo', '/clienti', PIENO)).location);

    // The list the quote form reads: what a quote needs, nothing more.
    const elenco = await browser.get(`/clienti/elenco.json?azienda=${azienda.id}`);
    assert.equal(elenco.status, 200);
    const dati = JSON.parse(elenco.body) as { clienti: Array<Record<string, string>> };
    assert.deepEqual(dati.clienti, [
      {
        id,
        nome: 'Condominio Via Roma 12',
        indirizzo: 'Via Roma 12, 20121 Milano (MI)',
        piva: 'IT01234567890',
        email: 'amministratore@studio-bianchi.it',
      },
    ]);

    // A new quote from the profile: the customer is already written.
    const nuovo = await browser.get(`/preventivi/nuovo?cliente=${id}`);
    assert.equal(nuovo.status, 200);
    assert.match(nuovo.body, new RegExp(`name="clienteId" value="${id}"`));
    for (const valore of [
      'Condominio Via Roma 12',
      'Via Roma 12, 20121 Milano (MI)',
      'IT01234567890',
      'amministratore@studio-bianchi.it',
    ])
      assert.ok(nuovo.body.includes(`value="${valore}"`), valore);

    const preventivo = await crea(browser, {
      ...RIGHE,
      cliente: 'Condominio Via Roma 12',
      clienteIndirizzo: 'Via Roma 12, 20121 Milano (MI)',
      clienteId: id,
    });
    assert.equal(
      (await prisma.preventivo.findUniqueOrThrow({ where: { id: preventivo } })).clienteId,
      id,
    );
    const pagina = await browser.get(`/preventivi/${preventivo}`);
    assert.match(pagina.body, new RegExp(`href="/clienti/${id}"`));
    assert.doesNotMatch(pagina.body, new RegExp(`action="/preventivi/${preventivo}/cliente"`));
    const profilo = await browser.get(`/clienti/${id}`);
    assert.match(profilo.body, new RegExp(`href="/preventivi/${preventivo}"`));

    // Changing the quote keeps the link; the form without it takes it off.
    const forma = await browser.get(`/preventivi/${preventivo}/modifica`);
    assert.match(forma.body, new RegExp(`name="clienteId" value="${id}"`));
    assert.match(forma.body, new RegExp(`name="clienteIdPrima" value="${id}"`));
    const salvato = await browser.submit(
      `/preventivi/${preventivo}/modifica`,
      `/preventivi/${preventivo}`,
      {
        ...RIGHE,
        clienteId: id,
        clienteIdPrima: id,
        base: await base(browser, preventivo),
        oggetto: 'Nuovo oggetto',
      },
    );
    assert.equal(salvato.status, 303);
    assert.equal(
      (await prisma.preventivo.findUniqueOrThrow({ where: { id: preventivo } })).clienteId,
      id,
    );
    // «Duplica» carries the customer; who has more than one company still says which one it is for.
    const copia = await browser.get(`/preventivi/nuovo?da=${preventivo}`);
    assert.match(copia.body, new RegExp(`name="clienteId" value="${id}"`));
    for (const adr of [`/preventivi/nuovo?da=${preventivo}`, `/preventivi/nuovo?cliente=${id}`]) {
      const delMaster = await master.get(adr);
      assert.equal(delMaster.status, 200, adr);
      assert.match(delMaster.body, new RegExp(`name="azienda" value="${azienda.id}"`), adr);
    }
    const daMaster = await master.submit(`/preventivi/nuovo?cliente=${id}`, '/preventivi', {
      ...RIGHE,
      cliente: PIENO.nome,
      azienda: azienda.id,
      clienteId: id,
    });
    assert.equal(daMaster.status, 303, daMaster.body.slice(0, 300));
    assert.equal(
      (await prisma.preventivo.findUniqueOrThrow({ where: { id: ultimo(daMaster.location) } }))
        .clienteId,
      id,
    );

    const staccato = await browser.submit(
      `/preventivi/${preventivo}/modifica`,
      `/preventivi/${preventivo}`,
      { ...RIGHE, clienteId: '', clienteIdPrima: id, base: await base(browser, preventivo) },
    );
    assert.equal(staccato.status, 303);
    assert.equal(
      (await prisma.preventivo.findUniqueOrThrow({ where: { id: preventivo } })).clienteId,
      null,
    );

    // A quote is tied only to a profile it names — with or without JavaScript: the profile of one
    // customer and the name of another give a quote without a link.
    const altroNome = await crea(browser, {
      ...RIGHE,
      cliente: 'Un altro condominio',
      clienteId: id,
    });
    assert.equal(
      (await prisma.preventivo.findUniqueOrThrow({ where: { id: altroNome } })).clienteId,
      null,
    );
    const stessoNome = await crea(browser, {
      ...RIGHE,
      cliente: '  condominio  via roma 12 ',
      clienteId: id,
    });
    assert.equal(
      (await prisma.preventivo.findUniqueOrThrow({ where: { id: stessoNome } })).clienteId,
      id,
    );
  });

  it('never passes its limit; export and deletion carry it', async () => {
    const azienda = await aziendaConPreventivi('Clienti Limite');
    const { browser, user } = await signedIn('ADMIN', azienda.id);
    await prisma.cliente.createMany({
      data: Array.from({ length: MAX_CLIENTI }, (_, i) => ({
        aziendaId: azienda.id,
        nome: `Cliente ${String(i + 1).padStart(4, '0')}`,
        searchText: `cliente ${String(i + 1).padStart(4, '0')}`,
      })),
    });
    const pieno = await browser.submit('/clienti/nuovo', '/clienti', { nome: 'Uno di troppo' });
    assert.equal(pieno.status, 422);
    assert.match(pieno.body, /value="Uno di troppo"/);
    assert.match(pieno.body, new RegExp(String(MAX_CLIENTI)));
    const preventivo = await crea(browser, RIGHE);
    const dalPreventivo = await browser.submit(
      `/preventivi/${preventivo}`,
      `/preventivi/${preventivo}/cliente`,
      {},
    );
    assert.equal(dalPreventivo.status, 303);
    assert.equal(await prisma.cliente.count({ where: { aziendaId: azienda.id } }), MAX_CLIENTI);

    // The list is read by pages and the form's list carries all of it.
    const elenco = await browser.get('/clienti');
    assert.match(elenco.body, /Cliente 0001/);
    assert.doesNotMatch(elenco.body, /Cliente 0900/);
    assert.match(elenco.body, /href="\/clienti\?p=2"/);
    const json = JSON.parse(
      (await browser.get(`/clienti/elenco.json?azienda=${azienda.id}`)).body,
    ) as { clienti: unknown[] };
    assert.equal(json.clienti.length, MAX_CLIENTI);

    const esportazione = await esportaAzienda(azienda.id, { id: user.id, master: false });
    assert.ok(esportazione);
    const chunks: Buffer[] = [];
    for await (const chunk of esportazione.stream) chunks.push(Buffer.from(chunk as Uint8Array));
    const entries = readTar(Buffer.concat(chunks));
    const dati = JSON.parse(
      [...entries].find(([n]) => n.endsWith('/dati.json'))![1].toString('utf8'),
    ) as { clienti: Array<{ nome: string; searchText?: string }> };
    assert.equal(dati.clienti.length, MAX_CLIENTI);
    assert.equal(dati.clienti[0]!.nome, 'Cliente 0001');
    assert.equal(dati.clienti[0]!.searchText, undefined, 'the search copy is not data');

    await prisma.azienda.update({ where: { id: azienda.id }, data: { deactivatedAt: new Date() } });
    assert.equal(await eliminaAzienda(azienda.id, null), true);
    assert.equal(await prisma.cliente.count({ where: { aziendaId: azienda.id } }), 0);
  });
});
