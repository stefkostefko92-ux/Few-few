// The picture of a stop sign against the real app (the owner, 30 October 2026: "nella parte superiore di
// tutti i cartelli deve comparire il logo e i dati societari"): the sign page and the template chooser in
// the settings show the sign as its PDF comes out — the company logo and data on top — served only to
// whoever may see that sign or those settings; and a company without a logo or data is told so.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import sharp from 'sharp';
import { Browser, makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const DATI = {
  ragioneSociale: 'Ascensori Prova S.r.l.',
  indirizzo: 'Via Roma 12',
  cap: '20121',
  citta: 'Milano',
  provincia: 'mi',
  telefono: '02 1234567',
  email: 'info@ascensoriprova.example',
  partitaIva: '01234567890',
  sito: 'www.ascensoriprova.example',
};

const CARTELLO = {
  data: '2026-11-03',
  indirizzo: 'Via Monte Santo 8',
  citta: 'Milano',
  ubicazione: 'Scala B',
  testo: "Dal 3/11 l'impianto è fermo per lavori di ammodernamento.",
};

const isWebp = (bytes: Buffer) => bytes.subarray(8, 12).toString() === 'WEBP';

async function withLogo(aziendaId: string) {
  const logo = await sharp({
    create: { width: 300, height: 100, channels: 3, background: { r: 255, g: 0, b: 255 } },
  })
    .png()
    .toBuffer();
  await prisma.azienda.update({
    where: { id: aziendaId },
    data: { logo, logoType: 'image/png', logoWidth: 300, logoHeight: 100, datiSocietari: DATI },
  });
}

describe('the picture on the sign page', () => {
  it('is the sign with the company header, for everyone in the company and nobody else', async () => {
    const [azienda, altra] = [await makeAzienda(), await makeAzienda()];
    const { browser: tecnico } = await signedIn('TECNICO', azienda.id);
    const reply = await tecnico.submit('/cartelli/nuovo', '/cartelli', CARTELLO);
    assert.equal(reply.status, 303);
    const page = await tecnico.get(reply.location);
    const src = /<img class="cartello__anteprima" src="([^"]+)"/.exec(page.body)?.[1];
    assert.equal(src, `${reply.location}/anteprima.webp`);

    const { browser: cliente } = await signedIn('CLIENTE', azienda.id);
    const image = await cliente.get(src);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/webp');
    assert.equal(image.headers.get('cache-control'), 'no-store');
    assert.ok(isWebp(image.bytes));

    const { browser: estraneo } = await signedIn('ADMIN', altra.id);
    assert.equal((await estraneo.get(src)).status, 404);
    assert.equal((await new Browser().get(src)).status, 302);
    assert.equal((await cliente.get('/cartelli/nonesiste/anteprima.webp')).status, 404);

    // The pictures have their own ceiling: more of them than the PDF ceiling (30 a minute) leave the
    // PDF still there — the settings alone are five pictures a page.
    for (let i = 0; i < 31; i++) assert.equal((await tecnico.get(src)).status, 200);
    assert.equal((await tecnico.get(`${reply.location}/pdf`)).status, 200);
  });

  it('says when the company has no logo or no data, and stops saying it once it has', async () => {
    const azienda = await makeAzienda();
    const { browser } = await signedIn('TECNICO', azienda.id);
    const { location } = await browser.submit('/cartelli/nuovo', '/cartelli', CARTELLO);
    const before = (await browser.get(location)).body;
    assert.match(before, /L&#39;azienda non ha ancora un logo/);
    assert.match(before, /Mancano i dati societari/);
    await withLogo(azienda.id);
    const after = (await browser.get(location)).body;
    assert.doesNotMatch(after, /non ha ancora un logo|Mancano i dati societari/);
  });
});

describe('the template chooser in the settings', () => {
  it('shows each template with the company header, to its ADMIN and the master only', async () => {
    const [azienda, altra] = [await makeAzienda(), await makeAzienda()];
    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    const page = (await admin.get(`/impostazioni?azienda=${azienda.id}`)).body;
    const srcs = [...page.matchAll(/<img class="modelli__img" src="([^"]+)"/g)].map((m) => m[1]!);
    assert.deepEqual(
      srcs.map((s) => s.replaceAll('&amp;', '&')),
      ['rosso', 'giallo-nero', 'fuori-servizio', 'blu', 'grafite-oro'].map(
        (id) => `/impostazioni/cartello/anteprima/${id}.webp?azienda=${azienda.id}`,
      ),
    );
    assert.match(page, /L&#39;azienda non ha ancora un logo/);
    const path = `/impostazioni/cartello/anteprima/blu.webp?azienda=${azienda.id}`;
    const image = await admin.get(path);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/webp');
    assert.ok(isWebp(image.bytes));

    const { browser: master } = await signedIn('MASTER');
    assert.equal((await master.get(path)).status, 200);
    const { browser: direzione } = await signedIn('DIREZIONE', azienda.id);
    assert.equal((await direzione.get(path)).status, 403);
    const { browser: estraneo } = await signedIn('ADMIN', altra.id);
    assert.equal((await estraneo.get(path)).status, 404);
    for (const wrong of [
      `/impostazioni/cartello/anteprima/viola.webp?azienda=${azienda.id}`,
      `/impostazioni/cartello/anteprima/blu.png?azienda=${azienda.id}`,
      '/impostazioni/cartello/anteprima/blu.webp',
    ])
      assert.equal((await admin.get(wrong)).status, 404, wrong);
  });

  it('sends the master to the company page for the missing logo, and says nothing once it is there', async () => {
    const azienda = await makeAzienda();
    const { browser: master } = await signedIn('MASTER');
    const page = (await master.get(`/impostazioni?azienda=${azienda.id}`)).body;
    assert.match(page, new RegExp(`<a href="/aziende/${azienda.id}">L&#39;azienda non ha ancora`));
    await withLogo(azienda.id);
    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    assert.doesNotMatch((await admin.get('/impostazioni')).body, /non ha ancora un logo/);
  });
});
