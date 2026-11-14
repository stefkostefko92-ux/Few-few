// Annotations on a photo (the owner, 12 November 2026 — point C5): the sheet of the sketch editor drawn over
// a ready photo, sent on its own from the page of the form. Only who writes the scheda's company, only on a
// ready photo of a scheda not in the bin; a forged sheet is refused; an empty one takes them away. They show
// over the tile of the gallery, over the photo in the print and in the PDF, and go with the export.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';
import { newScheda, photo, processAll, upload } from './media.js';

before(startApp);
after(stopApp);

const FRECCIA = { e: [{ t: 'p', c: 'r', s: 2, d: 'M300 300l400 200' }] };

describe('photo annotations', () => {
  it('are saved by who writes, shown in the gallery, the print and the PDF, removed when empty', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await newScheda(browser);
    await upload(browser, id, 'impianto', [await photo('quadro.jpg')]);
    await processAll();
    const foto = await prisma.allegato.findFirstOrThrow({ where: { schedaId: id } });
    const path = `/schede/${id}/allegati/${foto.id}/annotazioni`;
    const salva = (foglio: string) => browser.submit(`/schede/${id}/modifica`, path, { foglio });

    const saved = await salva(JSON.stringify(FRECCIA));
    assert.equal(saved.status, 200);
    assert.deepEqual(JSON.parse(saved.body), { ok: true, annotazioni: FRECCIA });
    assert.deepEqual(
      (await prisma.allegato.findUniqueOrThrow({ where: { id: foto.id } })).annotazioni,
      FRECCIA,
    );
    assert.equal(
      await prisma.auditLog.count({ where: { action: 'ALLEGATO_ANNOTAZIONI', targetId: id } }),
      1,
    );
    // The form page: the tile carries the drawing and the button; the show page — the drawing only.
    const edit = await browser.get(`/schede/${id}/modifica`);
    assert.match(edit.body, /<svg class="annotazioni" viewBox="[\d. ]+"/);
    assert.match(edit.body, /data-annota>/);
    assert.match(edit.body, /id="annotazioni-testi"/);
    assert.match((await browser.get(`/schede/${id}`)).body, /class="annotazioni"/);

    // Forged or too heavy: refused, nothing changes.
    for (const bad of ['{"e":[{"t":"z"}]}', 'not json', JSON.stringify({ e: [], x: 1 })]) {
      const reply = await salva(bad);
      assert.equal(reply.status, 422, bad);
    }
    assert.deepEqual(
      (await prisma.allegato.findUniqueOrThrow({ where: { id: foto.id } })).annotazioni,
      FRECCIA,
    );

    // In the print (a vector drawing over the photo) and in the PDF.
    await prisma.allegato.update({ where: { id: foto.id }, data: { inStampa: true } });
    const stampa = await browser.get(`/schede/${id}/stampa`);
    assert.match(
      stampa.body,
      /<svg class="paper__foto-annotata" viewBox="[\d. ]+" width="\d+" height="\d+" role="img"/,
    );
    assert.match(stampa.body, /<path d="M300 300/);
    const pdf = await browser.get(`/schede/${id}/pdf`);
    assert.equal(pdf.status, 200);

    // Empty: no annotations any more.
    assert.equal((await salva('{"e":[]}')).status, 200);
    assert.equal(
      (await prisma.allegato.findUniqueOrThrow({ where: { id: foto.id } })).annotazioni,
      null,
    );
    assert.doesNotMatch((await browser.get(`/schede/${id}/modifica`)).body, /class="annotazioni"/);
  });

  it('are not for who only reads, nor another company, nor a scheda in the bin', async () => {
    const azienda = await makeAzienda('Annotazioni Ascensori');
    const { browser } = await signedIn('TECNICO', azienda.id);
    const id = await newScheda(browser);
    await upload(browser, id, 'impianto', [await photo('targa.jpg')]);
    await processAll();
    const foto = await prisma.allegato.findFirstOrThrow({ where: { schedaId: id } });
    const path = `/schede/${id}/allegati/${foto.id}/annotazioni`;
    const form = { foglio: JSON.stringify(FRECCIA) };

    const { browser: cliente } = await signedIn('CLIENTE', azienda.id);
    const csrfCliente = await cliente.csrf(`/schede/${id}`).catch(() => '');
    assert.equal((await cliente.post(path, { _csrf: csrfCliente, ...form })).status, 403);
    const { browser: estraneo } = await signedIn('TECNICO');
    assert.equal((await estraneo.submit('/schede/nuova', path, form)).status, 404);
    await prisma.scheda.update({ where: { id }, data: { deletedAt: new Date() } });
    assert.equal((await browser.submit('/schede/nuova', path, form)).status, 404);
    assert.equal(
      (await prisma.allegato.findUniqueOrThrow({ where: { id: foto.id } })).annotazioni,
      null,
    );
  });
});
