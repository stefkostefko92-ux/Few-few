// A stop sign filled from the scheda of the lift, against the real app (the owner, 30 October 2026:
// "usare le schede per auto compilare cartello di fermo impianto lasciando la possibilità di creare anche
// cartelli per impianti che non hanno schede"): the button on the scheda, the search in the form, the link
// kept both ways, the memory of the last sign — and never a scheda the person cannot see, of another
// company or in the trash.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

let counter = 0;

async function makeScheda(aziendaId: string, extra: Record<string, unknown> = {}) {
  const matricola = `77${Date.now().toString().slice(-6)}${++counter}`;
  return prisma.scheda.create({
    data: {
      aziendaId,
      data: new Date('2026-10-12'),
      matricola,
      numeroImpianto: `9${counter}`,
      indirizzo: 'Via Monte Santo 8, 20124 Milano (MI)',
      tipoImpianto: ['ELETTRICO'],
      quadroSostituire: true,
      searchText: `${matricola} via monte santo 8 20124 milano mi`,
      ...extra,
    },
  });
}

const SIGN = {
  data: '2026-11-03',
  indirizzo: 'Via Monte Santo 8',
  citta: 'Milano',
  ubicazione: 'Scala B',
  testo: "Dal 3/11 l'impianto è fermo per lavori.",
};

describe('a sign from the scheda of the lift', () => {
  it('comes filled from the button on the scheda, keeps the link and is listed on the scheda', async () => {
    const azienda = await makeAzienda();
    const scheda = await makeScheda(azienda.id);
    const { browser } = await signedIn('TECNICO', azienda.id);
    const page = (await browser.get(`/schede/${scheda.id}`)).body;
    assert.match(page, new RegExp(`href="/cartelli/nuovo\\?scheda=${scheda.id}"`));

    const form = (await browser.get(`/cartelli/nuovo?scheda=${scheda.id}`)).body;
    assert.match(form, new RegExp(`name="scheda" value="${scheda.id}"`));
    assert.match(form, /id="f-indirizzo"[^>]*value="Via Monte Santo 8"/);
    assert.match(form, /id="f-citta"[^>]*value="Milano"/);
    assert.match(form, /sostituzione del quadro di manovra\.<\/textarea>/);
    assert.match(form, /Testo proposto dai lavori indicati nella scheda/);

    const saved = await browser.submit(`/cartelli/nuovo?scheda=${scheda.id}`, '/cartelli', {
      ...SIGN,
      scheda: scheda.id,
    });
    assert.equal(saved.status, 303);
    const id = saved.location.split('/').pop()!;
    const row = await prisma.cartello.findUniqueOrThrow({ where: { id } });
    assert.equal(row.schedaId, scheda.id);
    assert.equal(row.aziendaId, azienda.id);
    assert.match(
      (await browser.get(saved.location)).body,
      new RegExp(`href="/schede/${scheda.id}"`),
    );
    assert.match(
      (await browser.get(`/schede/${scheda.id}`)).body,
      new RegExp(`href="/cartelli/${id}"`),
    );

    // The second sign of the same lift remembers what the person wrote on the first.
    const again = (await browser.get(`/cartelli/nuovo?scheda=${scheda.id}`)).body;
    assert.match(again, /id="f-ubicazione"[^>]*value="Scala B"/);
  });

  it('is found by the search in the form: one hit goes straight to the filled form', async () => {
    const azienda = await makeAzienda();
    const scheda = await makeScheda(azienda.id);
    const { browser } = await signedIn('OPERATORE', azienda.id);
    const one = await browser.get(`/cartelli/nuovo?cerca=${scheda.matricola}`);
    assert.equal(one.status, 303);
    assert.equal(one.location, `/cartelli/nuovo?scheda=${scheda.id}`);
    const none = (await browser.get('/cartelli/nuovo?cerca=nessunimpiantoqui')).body;
    assert.match(none, /Nessuna scheda trovata: compila il cartello a mano/);
    // A lift without a scheda: the empty form, as before.
    const plain = await browser.submit('/cartelli/nuovo', '/cartelli', SIGN);
    assert.equal(plain.status, 303);
    const row = await prisma.cartello.findFirstOrThrow({
      where: { id: plain.location.split('/').pop()! },
    });
    assert.equal(row.schedaId, null);
  });

  it('never takes a scheda of another company, in the trash, or one the person cannot see', async () => {
    const [azienda, altra] = [await makeAzienda(), await makeAzienda()];
    const straniera = await makeScheda(altra.id);
    const cestino = await makeScheda(azienda.id, { deletedAt: new Date() });
    const { browser } = await signedIn('TECNICO', azienda.id);
    for (const scheda of [straniera, cestino]) {
      const get = await browser.get(`/cartelli/nuovo?scheda=${scheda.id}`);
      assert.equal(get.status, 303, 'no filled form');
      assert.equal(get.location, '/cartelli/nuovo');
      const post = await browser.submit('/cartelli/nuovo', '/cartelli', {
        ...SIGN,
        scheda: scheda.id,
      });
      assert.equal(post.status, 422);
      assert.match(post.body, /La scheda scelta non è più disponibile/);
      assert.match(post.body, /value="Scala B"/, 'what was typed comes back');
    }
    assert.equal(
      (await browser.get(`/cartelli/nuovo?cerca=${straniera.matricola}`)).body.includes(
        straniera.id,
      ),
      false,
    );
    assert.equal(await prisma.cartello.count({ where: { aziendaId: azienda.id } }), 0);

    // A role that writes signs but does not see the schede: no search, no scheda.
    await prisma.azienda.update({
      where: { id: azienda.id },
      data: { permessiRuoli: { OPERATORE: ['interventi:read', 'interventi:write'] } },
    });
    const propria = await makeScheda(azienda.id);
    const { browser: operatore } = await signedIn('OPERATORE', azienda.id);
    assert.doesNotMatch((await operatore.get('/cartelli/nuovo')).body, /name="cerca"/);
    const post = await operatore.submit('/cartelli/nuovo', '/cartelli', {
      ...SIGN,
      scheda: propria.id,
    });
    assert.equal(post.status, 422);
  });

  it('keeps the sign when the scheda is deleted for good, without the link', async () => {
    const azienda = await makeAzienda();
    const scheda = await makeScheda(azienda.id);
    const { browser } = await signedIn('TECNICO', azienda.id);
    const saved = await browser.submit(`/cartelli/nuovo?scheda=${scheda.id}`, '/cartelli', {
      ...SIGN,
      scheda: scheda.id,
    });
    const id = saved.location.split('/').pop()!;
    await prisma.scheda.delete({ where: { id: scheda.id } });
    const row = await prisma.cartello.findUniqueOrThrow({ where: { id } });
    assert.equal(row.schedaId, null);
    assert.equal((await browser.get(saved.location)).status, 200);
    assert.equal((await new Browser().get(`/cartelli/nuovo?scheda=${scheda.id}`)).status, 302);
  });
});
