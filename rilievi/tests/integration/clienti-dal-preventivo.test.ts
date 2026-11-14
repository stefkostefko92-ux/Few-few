// The customer typed in a quote goes into the registry (the owner, 13 November 2026). Acceptance criteria:
//  - one button on the quote page writes the profile from what the quote says and ties the quote to it,
//    without moving the version of the quote; another company's quote is 404;
//  - once: the same customer in another quote is tied to the profile that is there, not written twice;
//  - who is «the same»: the namesake with the same VAT number first («IT» or not); without a number on one
//    side, the only namesake; when the name alone does not say who (several namesakes), a new profile —
//    two customers are never merged by guess;
//  - a form opened before the customer went into the registry does not take the link off when saved.
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

describe('the customer of a quote into the registry', () => {
  it('takes the customer of a quote into the registry once', async () => {
    const azienda = await aziendaConPreventivi('Clienti Dal Preventivo');
    const altra = await aziendaConPreventivi('Clienti Dal Preventivo Altra');
    const { browser } = await signedIn('RESPONSABILE', azienda.id);
    const { browser: estraneo } = await signedIn('ADMIN', altra.id);
    const primo = await crea(browser, {
      ...RIGHE,
      clienteIndirizzo: 'Via Manzoni 4, Milano',
      clientePiva: '01234567890',
    });
    const prima = await prisma.preventivo.findUniqueOrThrow({ where: { id: primo } });
    const pagina = await browser.get(`/preventivi/${primo}`);
    assert.match(pagina.body, new RegExp(`action="/preventivi/${primo}/cliente"`));

    const csrf = await estraneo.csrf('/preventivi/nuovo');
    assert.equal(
      (await estraneo.post(`/preventivi/${primo}/cliente`, { _csrf: csrf })).status,
      404,
    );

    const aggiunto = await browser.submit(
      `/preventivi/${primo}`,
      `/preventivi/${primo}/cliente`,
      {},
    );
    assert.equal(aggiunto.status, 303);
    assert.equal(aggiunto.location, `/preventivi/${primo}`);
    const clienti = await prisma.cliente.findMany({ where: { aziendaId: azienda.id } });
    assert.equal(clienti.length, 1);
    const cliente = clienti[0]!;
    assert.equal(cliente.nome, 'Condominio Manzoni 4');
    assert.equal(cliente.indirizzo, 'Via Manzoni 4, Milano');
    assert.equal(cliente.piva, '01234567890');
    assert.equal(cliente.email, 'amministratore@example.it');
    const dopo = await prisma.preventivo.findUniqueOrThrow({ where: { id: primo } });
    assert.equal(dopo.clienteId, cliente.id);
    // The quote itself is not a new version: who has it open still saves.
    assert.equal(dopo.updatedAt.getTime(), prima.updatedAt.getTime());
    assert.match(
      (await browser.get(`/preventivi/${primo}`)).body,
      new RegExp(`href="/clienti/${cliente.id}"`),
    );
    // Found in the registry by what the quote said.
    assert.match(
      (await browser.get('/clienti?q=manzoni')).body,
      new RegExp(`href="/clienti/${cliente.id}"`),
    );

    // The same customer in a second quote (same name, written differently; the VAT number with «IT»):
    // linked to the profile that is there, not written twice. Again on the first: nothing changes.
    const secondo = await crea(browser, {
      ...RIGHE,
      cliente: 'CONDOMINIO MANZONI 4',
      clientePiva: 'IT01234567890',
    });
    for (const quale of [secondo, primo])
      await browser.submit(`/preventivi/${quale}`, `/preventivi/${quale}/cliente`, {});
    assert.equal(await prisma.cliente.count({ where: { aziendaId: azienda.id } }), 1);
    assert.equal(
      (await prisma.preventivo.findUniqueOrThrow({ where: { id: secondo } })).clienteId,
      cliente.id,
    );

    // The form of the first quote was open (no profile yet) while the customer went into the registry:
    // saving it does not take the link off — the form says what it had when it was opened.
    const salvato = await browser.submit(`/preventivi/${primo}/modifica`, `/preventivi/${primo}`, {
      ...RIGHE,
      clienteId: '',
      clienteIdPrima: '',
      base: prima.updatedAt.toISOString(),
    });
    assert.equal(salvato.status, 303, salvato.body.slice(0, 300));
    assert.equal(
      (await prisma.preventivo.findUniqueOrThrow({ where: { id: primo } })).clienteId,
      cliente.id,
    );

    // Same name, another VAT number: another customer.
    const terzo = await crea(browser, { ...RIGHE, clientePiva: '09876543210' });
    await browser.submit(`/preventivi/${terzo}`, `/preventivi/${terzo}/cliente`, {});
    assert.equal(await prisma.cliente.count({ where: { aziendaId: azienda.id } }), 2);
    assert.notEqual(
      (await prisma.preventivo.findUniqueOrThrow({ where: { id: terzo } })).clienteId,
      cliente.id,
    );
  });

  it('ties to the namesake with the same VAT number and never merges by guess', async () => {
    const azienda = await aziendaConPreventivi('Clienti Omonimi');
    const { browser } = await signedIn('RESPONSABILE', azienda.id);
    const profilo = (nome: string, piva: string | null, createdAt: string) =>
      prisma.cliente.create({
        data: {
          aziendaId: azienda.id,
          nome,
          piva,
          searchText: nome.toLowerCase(),
          createdAt: new Date(createdAt),
        },
      });
    const collega = async (form: Record<string, string>) => {
      const id = await crea(browser, { ...RIGHE, ...form });
      await browser.submit(`/preventivi/${id}`, `/preventivi/${id}/cliente`, {});
      return (await prisma.preventivo.findUniqueOrThrow({ where: { id } })).clienteId;
    };
    const conta = () => prisma.cliente.count({ where: { aziendaId: azienda.id } });

    // Two namesakes: the older one without a number, the newer one with it.
    const senza = await profilo('Rossi Srl', null, '2026-01-01T10:00:00Z');
    const con = await profilo('Rossi Srl', 'IT01234567890', '2026-02-01T10:00:00Z');
    assert.equal(await collega({ cliente: 'Rossi Srl', clientePiva: '01234567890' }), con.id);
    // No number in the quote and two namesakes: the name does not say who — a new profile.
    const nuovo = await collega({ cliente: 'ROSSI SRL' });
    assert.ok(nuovo && nuovo !== senza.id && nuovo !== con.id);
    assert.equal(await conta(), 3);
    // A number nobody has, and two namesakes without one: a new profile again.
    const altro = await collega({ cliente: 'Rossi Srl', clientePiva: '09876543210' });
    assert.ok(altro && ![senza.id, con.id, nuovo].includes(altro));
    assert.equal(await conta(), 4);

    // One namesake, a number on one side only: the same customer.
    const mario = await profilo('Bianchi Mario', null, '2026-03-01T10:00:00Z');
    assert.equal(
      await collega({ cliente: 'bianchi mario', clientePiva: 'BNCMRA80A01F205X' }),
      mario.id,
    );
    const verdi = await profilo('Verdi Spa', '01111111111', '2026-03-02T10:00:00Z');
    assert.equal(await collega({ cliente: 'Verdi Spa' }), verdi.id);
    assert.equal(await conta(), 6);
  });
});
