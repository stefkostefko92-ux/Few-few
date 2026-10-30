// The stop sign "Avviso di fermo impianto" against the real app (the owner, 30 October 2026): the company
// data and the template in the company settings (ADMIN and MASTER only), the signs of a company — read by
// everyone in it, written by the technicians, never seen from another company — their PDF on the chosen
// template, and the side bar with the Master group apart from Amministrazione.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
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
  testo: "Dal 3/11 l'impianto è fermo per lavori di ammodernamento.\nVerrà riattivato il 7/11.",
};

async function create(browser: Browser, form: Record<string, string> = CARTELLO): Promise<string> {
  const reply = await browser.submit('/cartelli/nuovo', '/cartelli', form);
  assert.equal(reply.status, 303, `create failed with ${reply.status}`);
  return reply.location.split('/').pop()!;
}

const baseOf = async (browser: Browser, id: string) =>
  /name="base" value="([^"]+)"/.exec((await browser.get(`/cartelli/${id}/modifica`)).body)?.[1] ??
  '';

describe('the company data and the sign template in the settings', () => {
  it('are saved by the company ADMIN, logged without the data, refused below ADMIN', async () => {
    const azienda = await makeAzienda();
    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    const saved = await admin.submit('/impostazioni', '/impostazioni/dati', {
      azienda: azienda.id,
      ...DATI,
    });
    assert.equal(saved.status, 303);
    assert.equal(saved.location, `/impostazioni?azienda=${azienda.id}#h-dati`);
    const row = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.deepEqual(row.datiSocietari, DATI);
    const page = await admin.get('/impostazioni');
    assert.match(page.body, /value="info@ascensoriprova\.example"/);
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { aziendaId: azienda.id, action: 'AZIENDA_DATI' },
    });
    assert.doesNotMatch(JSON.stringify(log), /ascensoriprova|Via Roma/);

    const scelto = await admin.submit('/impostazioni', '/impostazioni/cartello', {
      azienda: azienda.id,
      modello: 'grafite-oro',
    });
    assert.equal(scelto.status, 303);
    const after = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.equal(after.cartelloModello, 'grafite-oro');
    assert.match(
      (await admin.get('/impostazioni')).body,
      /value="grafite-oro" checked>/,
      'the chosen template is ticked',
    );

    const { browser: direzione } = await signedIn('DIREZIONE', azienda.id);
    for (const path of ['/impostazioni/dati', '/impostazioni/cartello']) {
      const reply = await direzione.request('POST', path, {
        form: { azienda: azienda.id, modello: 'blu', ...DATI },
      });
      assert.equal(reply.status, 403, path);
    }
  });

  it('refuses a wrong value, a forged field and another company, saving nothing', async () => {
    const [azienda, altra] = [await makeAzienda(), await makeAzienda()];
    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    const wrong = await admin.submit('/impostazioni', '/impostazioni/dati', {
      azienda: azienda.id,
      ...DATI,
      email: 'non-una-email',
      telefono: '02 ABC',
    });
    assert.equal(wrong.status, 422);
    assert.match(wrong.body, /Indirizzo email non valido\./);
    assert.match(wrong.body, /Solo cifre, spazi e \+ \( \) \. \/ -/);
    assert.match(wrong.body, /value="Ascensori Prova S\.r\.l\."/, 'the typed values come back');
    const forged = await admin.submit('/impostazioni', '/impostazioni/dati', {
      azienda: azienda.id,
      ...DATI,
      citta: ['Milano', 'Roma'],
    });
    assert.equal(forged.status, 422);
    const tooLong = await admin.submit('/impostazioni', '/impostazioni/dati', {
      azienda: azienda.id,
      provincia: 'MIL',
    });
    assert.equal(tooLong.status, 422);
    assert.equal(
      (await admin.submit('/impostazioni', '/impostazioni/dati', { azienda: altra.id, ...DATI }))
        .status,
      404,
    );
    assert.equal(
      (
        await admin.submit('/impostazioni', '/impostazioni/cartello', {
          azienda: altra.id,
          modello: 'blu',
        })
      ).status,
      404,
    );
    const unknown = await admin.submit('/impostazioni', '/impostazioni/cartello', {
      azienda: azienda.id,
      modello: '../rosso',
    });
    assert.equal(unknown.status, 400);
    for (const id of [azienda.id, altra.id]) {
      const row = await prisma.azienda.findUniqueOrThrow({ where: { id } });
      assert.equal(row.datiSocietari, null);
      assert.equal(row.cartelloModello, null);
    }
  });

  it('serves the template thumbnails to whoever sees the signs, and nothing else', async () => {
    const { browser } = await signedIn('CLIENTE');
    const thumb = await browser.get('/cartelli/modelli/rosso.webp');
    assert.equal(thumb.status, 200);
    assert.equal(thumb.headers.get('content-type'), 'image/webp');
    assert.equal(thumb.bytes.subarray(8, 12).toString(), 'WEBP');
    for (const path of ['/cartelli/modelli/nero.webp', '/cartelli/modelli/rosso.jpg']) {
      assert.equal((await browser.get(path)).status, 404, path);
    }
    assert.equal((await new Browser().get('/cartelli/modelli/rosso.webp')).status, 302);
  });
});

describe('the stop signs', () => {
  it('are written by the technicians, read by everyone in the company, logged', async () => {
    const azienda = await makeAzienda();
    const { browser: tecnico } = await signedIn('OPERATORE', azienda.id);
    const id = await create(tecnico);
    const row = await prisma.cartello.findUniqueOrThrow({ where: { id } });
    assert.equal(row.aziendaId, azienda.id);
    assert.equal(row.testo, CARTELLO.testo);
    assert.equal(row.data.toISOString().slice(0, 10), '2026-11-03');
    assert.ok(
      await prisma.auditLog.findFirst({ where: { targetId: id, action: 'CARTELLO_CREATE' } }),
    );

    const { browser: cliente } = await signedIn('CLIENTE', azienda.id);
    const list = await cliente.get('/cartelli');
    assert.equal(list.status, 200);
    assert.match(list.body, new RegExp(`href="/cartelli/${id}"`));
    assert.doesNotMatch(list.body, /href="\/cartelli\/nuovo"/);
    const page = await cliente.get(`/cartelli/${id}`);
    assert.equal(page.status, 200);
    assert.match(page.body, /Scala B/);
    assert.match(page.body, /Modello «Rosso»/, 'the default template');
    assert.doesNotMatch(page.body, /\/modifica"|\/elimina"/);
    assert.equal((await cliente.get('/cartelli/nuovo')).status, 403);
    assert.equal(
      (await cliente.request('POST', '/cartelli', { form: { ...CARTELLO } })).status,
      403,
    );
  });

  it('never show another company’s sign, its PDF, its edit or its deletion', async () => {
    const [a, b] = [await makeAzienda(), await makeAzienda()];
    const { browser: tecnicoA } = await signedIn('TECNICO', a.id);
    const id = await create(tecnicoA);
    const { browser: adminB } = await signedIn('ADMIN', b.id);
    for (const path of [`/cartelli/${id}`, `/cartelli/${id}/pdf`, `/cartelli/${id}/modifica`]) {
      assert.equal((await adminB.get(path)).status, 404, path);
    }
    assert.doesNotMatch((await adminB.get('/cartelli')).body, new RegExp(id));
    const deleted = await adminB.submit('/cartelli/nuovo', `/cartelli/${id}/elimina`, {});
    assert.equal(deleted.status, 404);
    assert.ok(await prisma.cartello.findUnique({ where: { id } }), 'still there');
  });

  it('refuse a sign without the text or the date, keeping what was typed', async () => {
    const azienda = await makeAzienda();
    const { browser } = await signedIn('TECNICO', azienda.id);
    const reply = await browser.submit('/cartelli/nuovo', '/cartelli', {
      ...CARTELLO,
      data: '',
      testo: '   ',
    });
    assert.equal(reply.status, 422);
    assert.match(reply.body, /Indica la data del cartello\./);
    assert.match(reply.body, /Scrivi l&#39;informazione per gli utenti\./);
    assert.match(reply.body, /value="Via Monte Santo 8"/);
    const tooLong = await browser.submit('/cartelli/nuovo', '/cartelli', {
      ...CARTELLO,
      testo: 'x'.repeat(601),
    });
    assert.equal(tooLong.status, 422);
    assert.match(tooLong.body, /Massimo 600 caratteri\./);
    assert.equal(await prisma.cartello.count({ where: { aziendaId: azienda.id } }), 0);
  });

  it('save a change only over the version that was opened, and delete for good', async () => {
    const azienda = await makeAzienda();
    const { browser } = await signedIn('TECNICO', azienda.id);
    const id = await create(browser);
    const base = await baseOf(browser, id);
    const ok = await browser.submit(`/cartelli/${id}/modifica`, `/cartelli/${id}`, {
      ...CARTELLO,
      ubicazione: 'Scala C',
      base,
    });
    assert.equal(ok.status, 303);
    const stale = await browser.submit(`/cartelli/${id}/modifica`, `/cartelli/${id}`, {
      ...CARTELLO,
      ubicazione: 'Scala D',
      base,
    });
    assert.equal(stale.status, 409);
    assert.match(stale.body, /Nel frattempo qualcuno ha modificato questo cartello/);
    assert.equal(
      (await prisma.cartello.findUniqueOrThrow({ where: { id } })).ubicazione,
      'Scala C',
    );

    const deleted = await browser.submit(`/cartelli/${id}`, `/cartelli/${id}/elimina`, {});
    assert.equal(deleted.status, 303);
    assert.equal(deleted.location, '/cartelli');
    assert.equal(await prisma.cartello.findUnique({ where: { id } }), null);
    const log = await prisma.auditLog.findMany({
      where: { targetId: id },
      orderBy: { at: 'asc' },
      select: { action: true },
    });
    assert.deepEqual(
      log.map((entry) => entry.action),
      ['CARTELLO_CREATE', 'CARTELLO_UPDATE', 'CARTELLO_DELETE'],
    );
    assert.equal((await browser.get(`/cartelli/${id}`)).status, 404);
  });

  it('come out as one A4 page on the company template: landscape, or portrait for “Blu tecnico”', async () => {
    const azienda = await makeAzienda();
    await prisma.azienda.update({
      where: { id: azienda.id },
      data: { datiSocietari: DATI },
    });
    const { browser } = await signedIn('TECNICO', azienda.id);
    const id = await create(browser);
    const size = async () => {
      const reply = await browser.get(`/cartelli/${id}/pdf`);
      assert.equal(reply.status, 200);
      assert.equal(reply.headers.get('content-type'), 'application/pdf');
      assert.match(
        reply.headers.get('content-disposition') ?? '',
        /^attachment; filename="cartello-fermo-impianto-2026-11-03\.pdf"$/,
      );
      const pdf = await PDFDocument.load(reply.bytes);
      assert.equal(pdf.getPageCount(), 1);
      const { width, height } = pdf.getPage(0).getSize();
      return [Math.round(width), Math.round(height)];
    };
    assert.deepEqual(await size(), [842, 595]);
    await prisma.azienda.update({ where: { id: azienda.id }, data: { cartelloModello: 'blu' } });
    assert.deepEqual(await size(), [595, 842]);
    // A template that is no longer there falls back to the first one.
    await prisma.azienda.update({ where: { id: azienda.id }, data: { cartelloModello: 'viola' } });
    assert.deepEqual(await size(), [842, 595]);
  });
});

describe('the side bar', () => {
  it('keeps the Master group (companies, requests) apart from the company administration', async () => {
    const { browser: master } = await signedIn('MASTER');
    const body = (await master.get('/cartelli')).body;
    const group = (key: string) =>
      new RegExp(`aria-labelledby="nav-${key}">([\\s\\S]*?)</ul>`).exec(body)?.[1] ?? '';
    assert.match(group('master'), /href="\/aziende"/);
    assert.match(group('master'), /href="\/richieste"/);
    assert.doesNotMatch(group('amministrazione'), /href="\/aziende"|href="\/richieste"/);
    assert.match(group('amministrazione'), /href="\/impostazioni"/);
    assert.match(group('assistenza'), /href="\/cartelli"/);

    const azienda = await makeAzienda();
    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    const adminBody = (await admin.get('/cartelli')).body;
    assert.doesNotMatch(adminBody, /id="nav-master"/);
    assert.match(adminBody, /id="nav-amministrazione"/);
  });
});
