// The customers of a company (the owner, 13 November 2026: "добави страница клиенти за всяка една фирма, по този
// начин ще могат да регистрират клиентите си с техни профили и да не трябва да ги пишат всеки път когато
// правят Preventivi"). Acceptance criteria:
//  - the registry lives with the quotes: where quotes are off nobody has it; where they are on, who reads the
//    quotes reads the customers and who writes the quotes writes them; another company's customer is 404;
//  - a profile needs only a name; wrong data comes back with what was typed; the search finds a customer by
//    name, address, VAT number, email, phone or contact person — not by the note;
//  - a profile is changed only on the version that was opened; deleting it keeps the quotes as they are;
//  - a customer of another company is never linked to a quote; the audit has no personal data.
// The quote form, the customer of a quote into the registry, the limit, export and deletion —
// clienti-preventivi.test.ts.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';
import { crea, RIGHE } from './preventivi-dati.js';

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
  telefono: '+39 02 1234567',
  referente: 'Geom. Luca Bianchi',
  note: 'Citofono 14, portineria solo la mattina',
};

const ultimo = (location: string): string => location.split('/').pop()!;

describe('the customers of a company', () => {
  it('live with the quotes: a profile is created, shown and found', async () => {
    const spenta = await makeAzienda('Clienti Spenti');
    const { browser: senza } = await signedIn('ADMIN', spenta.id);
    assert.equal((await senza.get('/clienti')).status, 403);
    assert.equal((await senza.get('/clienti/nuovo')).status, 403);
    assert.doesNotMatch((await senza.get('/schede')).body, /href="\/clienti"/);

    const azienda = await aziendaConPreventivi('Clienti Uno');
    const { browser } = await signedIn('RESPONSABILE', azienda.id);
    const vuoto = await browser.get('/clienti');
    assert.equal(vuoto.status, 200);
    assert.match(vuoto.body, /<h1>Clienti<\/h1>/);
    assert.match(vuoto.body, /href="\/clienti"/, 'the menu has the registry');
    assert.match(vuoto.body, /href="\/clienti\/nuovo"/);

    const creato = await browser.submit('/clienti/nuovo', '/clienti', PIENO);
    assert.equal(creato.status, 303, creato.body.slice(0, 300));
    const id = ultimo(creato.location);
    assert.equal(creato.location, `/clienti/${id}`);
    const riga = await prisma.cliente.findUniqueOrThrow({ where: { id } });
    assert.equal(riga.aziendaId, azienda.id);
    assert.equal(riga.piva, 'IT01234567890');
    assert.equal(riga.email, 'amministratore@studio-bianchi.it');

    const profilo = await browser.get(`/clienti/${id}`);
    assert.equal(profilo.status, 200);
    for (const testo of [
      'Condominio Via Roma 12',
      'Via Roma 12, 20121 Milano (MI)',
      'IT01234567890',
      'amministratore@studio-bianchi.it',
      '+39 02 1234567',
      'Geom. Luca Bianchi',
      'Citofono 14, portineria solo la mattina',
    ])
      assert.ok(profilo.body.includes(testo), testo);
    assert.match(profilo.body, new RegExp(`href="/preventivi/nuovo\\?cliente=${id}"`));

    // Found by any part of the profile — the phone also without its spaces — but not by the note.
    for (const q of ['roma', '01234567890', 'studio-bianchi', '021234567', 'LUCA']) {
      const trovato = await browser.get(`/clienti?q=${encodeURIComponent(q)}`);
      assert.match(trovato.body, new RegExp(`href="/clienti/${id}"`), q);
    }
    const perNota = await browser.get('/clienti?q=citofono');
    assert.doesNotMatch(perNota.body, new RegExp(`href="/clienti/${id}"`));

    // Wrong data: nothing is written, what was typed comes back, every field says what is wrong.
    const sbagliato = await browser.submit('/clienti/nuovo', '/clienti', {
      nome: '',
      piva: '12345',
      email: 'non-un-indirizzo',
      telefono: 'chiamami',
      referente: 'Sig.ra Verdi',
    });
    assert.equal(sbagliato.status, 422);
    assert.match(sbagliato.body, /value="chiamami"/);
    assert.match(sbagliato.body, /value="Sig\.ra Verdi"/);
    for (const campo of ['nome', 'piva', 'email', 'telefono'])
      assert.match(sbagliato.body, new RegExp(`id="err-${campo}"`), campo);
    assert.equal(await prisma.cliente.count({ where: { aziendaId: azienda.id } }), 1);

    // The audit says that a customer was added — never who the customer is.
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'CLIENTE_CREATE', targetId: id },
    });
    assert.equal(audit.aziendaId, azienda.id);
    assert.doesNotMatch(JSON.stringify(audit), /Roma|Bianchi|01234567890|1234567/i);
  });

  it('is changed only on the opened version; deleting it keeps the quotes', async () => {
    const azienda = await aziendaConPreventivi('Clienti Versione');
    const { browser } = await signedIn('ADMIN', azienda.id);
    const id = ultimo((await browser.submit('/clienti/nuovo', '/clienti', PIENO)).location);
    const modifica = `/clienti/${id}/modifica`;
    const pagina = await browser.get(modifica);
    assert.equal(pagina.status, 200);
    assert.match(pagina.body, /value="Condominio Via Roma 12"/);
    const aperta = /name="base" value="([^"]+)"/.exec(pagina.body)?.[1] ?? '';
    assert.ok(aperta);

    const salvato = await browser.submit(modifica, `/clienti/${id}`, {
      ...PIENO,
      base: aperta,
      telefono: '02 7654321',
    });
    assert.equal(salvato.status, 303);
    assert.equal(salvato.location, `/clienti/${id}`);
    assert.equal(
      (await prisma.cliente.findUniqueOrThrow({ where: { id } })).telefono,
      '02 7654321',
    );
    // The search follows the change.
    assert.match((await browser.get('/clienti?q=027654321')).body, new RegExp(`/clienti/${id}"`));

    // A second save from the page opened before: nothing is written, the typed text stays.
    const vecchio = await browser.submit(modifica, `/clienti/${id}`, {
      ...PIENO,
      base: aperta,
      referente: 'Scritto sulla versione vecchia',
    });
    assert.equal(vecchio.status, 409);
    assert.match(vecchio.body, /value="Scritto sulla versione vecchia"/);
    assert.equal(
      (await prisma.cliente.findUniqueOrThrow({ where: { id } })).referente,
      'Geom. Luca Bianchi',
    );

    const preventivo = await crea(browser, { ...RIGHE, cliente: PIENO.nome, clienteId: id });
    assert.equal(
      (await prisma.preventivo.findUniqueOrThrow({ where: { id: preventivo } })).clienteId,
      id,
    );
    const eliminato = await browser.submit(`/clienti/${id}`, `/clienti/${id}/elimina`, {});
    assert.equal(eliminato.status, 303);
    assert.equal(eliminato.location, '/clienti');
    assert.equal(await prisma.cliente.count({ where: { id } }), 0);
    const rimasto = await prisma.preventivo.findUniqueOrThrow({ where: { id: preventivo } });
    assert.equal(rimasto.clienteId, null);
    assert.equal(rimasto.cliente, PIENO.nome);
    assert.equal(rimasto.clienteEmail, 'amministratore@example.it');
    for (const action of ['CLIENTE_UPDATE', 'CLIENTE_DELETE'] as const) {
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { action, targetId: id } });
      assert.doesNotMatch(JSON.stringify(audit), /Roma|Bianchi|7654321/i, action);
    }
  });

  it('is closed to another company and to who has no quote rights', async () => {
    const nostra = await aziendaConPreventivi('Clienti Nostra');
    const altra = await aziendaConPreventivi('Clienti Altra');
    const { browser } = await signedIn('ADMIN', nostra.id);
    const { browser: estraneo } = await signedIn('ADMIN', altra.id);
    const { browser: tecnico } = await signedIn('TECNICO', nostra.id);
    const id = ultimo((await browser.submit('/clienti/nuovo', '/clienti', PIENO)).location);

    assert.equal((await estraneo.get(`/clienti/${id}`)).status, 404);
    assert.equal((await estraneo.get(`/clienti/${id}/modifica`)).status, 404);
    assert.equal((await estraneo.get(`/clienti/elenco.json?azienda=${nostra.id}`)).status, 404);
    assert.equal((await estraneo.get(`/preventivi/nuovo?cliente=${id}`)).status, 303);
    const csrf = await estraneo.csrf('/clienti/nuovo');
    assert.equal(
      (await estraneo.post(`/clienti/${id}`, { _csrf: csrf, ...PIENO, nome: 'Preso' })).status,
      404,
    );
    assert.equal((await estraneo.post(`/clienti/${id}/elimina`, { _csrf: csrf })).status, 404);
    assert.doesNotMatch((await estraneo.get('/clienti')).body, /Condominio Via Roma 12/);
    assert.equal((await prisma.cliente.findUniqueOrThrow({ where: { id } })).nome, PIENO.nome);

    // The default rights give quotes — and so the customers — from RESPONSABILE up.
    assert.equal((await tecnico.get('/clienti')).status, 403);
    assert.equal((await tecnico.get(`/clienti/${id}`)).status, 403);
    assert.equal((await tecnico.get(`/clienti/elenco.json?azienda=${nostra.id}`)).status, 403);
    assert.doesNotMatch((await tecnico.get('/schede')).body, /href="\/clienti"/);

    // A customer of another company is never linked to a quote, whatever the form says.
    const suo = ultimo(
      (await estraneo.submit('/clienti/nuovo', '/clienti', { nome: 'Cliente altrui' })).location,
    );
    const preventivo = await crea(browser, { ...RIGHE, clienteId: suo });
    assert.equal(
      (await prisma.preventivo.findUniqueOrThrow({ where: { id: preventivo } })).clienteId,
      null,
    );
  });
});
