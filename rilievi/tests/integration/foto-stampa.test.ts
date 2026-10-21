import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { ORDINABILI } from '../../src/schede/ordine.js';
import { Browser, makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';
import { newScheda, photo, processAll, upload } from './media.js';

before(startApp);
after(stopApp);

/** Saves the sheet with the minimum it needs and `form` on top (the page's own `base`). */
async function salva(browser: Browser, id: string, form: Record<string, string | string[]>) {
  const edit = await browser.get(`/schede/${id}/modifica`);
  const base = /name="base" value="([^"]+)"/.exec(edit.body)![1]!;
  return browser.submit(`/schede/${id}/modifica`, `/schede/${id}`, {
    base,
    data: '2026-10-21',
    indirizzo: 'Via Roma 1, Milano',
    matricola: '0012345',
    ...form,
  });
}

const inStampa = async (schedaId: string) =>
  (await prisma.allegato.findMany({ where: { schedaId, inStampa: true } })).map((r) => r.id);

describe('the photos to print, chosen as icons at the end of the form', () => {
  it('puts at the end of the print and the PDF only the photos ticked among the icons', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await newScheda(browser);
    await upload(browser, id, 'impianto', [await photo('ingresso.jpg'), await photo('targa.jpg')]);
    await processAll();
    const [one, two] = await prisma.allegato.findMany({
      where: { schedaId: id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const pages = async () =>
      (await PDFDocument.load((await browser.get(`/schede/${id}/pdf`)).bytes)).getPageCount();
    const before = await pages();
    assert.doesNotMatch((await browser.get(`/schede/${id}/stampa`)).body, /paper__foto/);
    const shown = `${one!.id} ${two!.id}`;

    const save = async (form: Record<string, string | string[]>) => {
      const edit = await browser.get(`/schede/${id}/modifica`);
      const base = /name="base" value="([^"]+)"/.exec(edit.body)![1]!;
      const reply = await browser.submit(`/schede/${id}/modifica`, `/schede/${id}`, {
        base,
        data: '2026-10-21',
        indirizzo: 'Via Roma 1, Milano',
        matricola: '0012345',
        ...form,
      });
      assert.equal(reply.status, 303, `save failed with ${reply.status}`);
      const rows = await prisma.allegato.findMany({ where: { schedaId: id, inStampa: true } });
      return rows.map((r) => r.id);
    };
    const edit = await browser.get(`/schede/${id}/modifica`);
    assert.match(edit.body, new RegExp(`name="fotoMostrate" value="${shown}"`));
    assert.doesNotMatch(edit.body, /name="fotoStampa" value="[a-z0-9]+" checked/, 'none ticked');
    assert.deepEqual(await save({ fotoMostrate: shown, fotoStampa: two!.id }), [two!.id]);
    assert.deepEqual(await save({}), [two!.id], 'a page without the icons leaves the choice alone');
    assert.equal((await prisma.scheda.findUniqueOrThrow({ where: { id } })).fotoStampate, true);

    const print = await browser.get(`/schede/${id}/stampa`);
    assert.match(print.body, /class="paper__section paper__foto"/);
    assert.match(print.body, new RegExp(`/schede/${id}/allegati/${two!.id}\\?mini=1`));
    assert.doesNotMatch(print.body, new RegExp(`/allegati/${one!.id}\\?mini=1`));
    assert.equal(await pages(), before + 1, 'the photos start on a page of their own');

    // Only the photos shown change: one uploaded after the page opened keeps its choice.
    assert.deepEqual(await save({ fotoMostrate: one!.id }), [two!.id]);
    assert.deepEqual(await save({ fotoMostrate: shown }), []);
    assert.equal((await prisma.scheda.findUniqueOrThrow({ where: { id } })).fotoStampate, false);
    assert.doesNotMatch((await browser.get(`/schede/${id}/stampa`)).body, /paper__foto/);
    assert.equal(await pages(), before);
  });

  it('show the ready photos by section, mark a section not on the sheet, and print it anyway when ticked', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await newScheda(browser);
    await upload(browser, id, 'quadro', await photo('quadro.jpg'));
    await upload(browser, id, 'argano', await photo('argano.jpg'));
    await upload(browser, id, 'cavi', await photo('in-coda.jpg'));
    await processAll();
    const late = await prisma.allegato.findFirstOrThrow({
      where: { schedaId: id, sezione: 'cavi' },
    });
    await prisma.allegato.update({ where: { id: late.id }, data: { stato: 'IN_LAVORAZIONE' } });
    const quadro = await prisma.allegato.findFirstOrThrow({
      where: { schedaId: id, sezione: 'quadro' },
    });
    const argano = await prisma.allegato.findFirstOrThrow({
      where: { schedaId: id, sezione: 'argano' },
    });
    // "Argano" out of the printed sections.
    const keep = ORDINABILI.filter((key) => key !== 'argano');
    assert.equal((await salva(browser, id, { 'stampa-_': '1', stampa: keep })).status, 303);

    const form = (await browser.get(`/schede/${id}/modifica`)).body;
    assert.match(form, /data-sezione="quadro">/);
    assert.match(form, /data-sezione="argano" data-esclusa>/);
    assert.match(
      form,
      new RegExp(`value="${argano.id}"><img src="[^"]+${argano.id}\\?riquadro=1"`),
    );
    assert.doesNotMatch(form, new RegExp(`value="${late.id}"`), 'a photo still in progress waits');
    assert.match(form, new RegExp(`name="fotoMostrate" value="${quadro.id} ${argano.id}"`));

    const saved = await salva(browser, id, {
      'stampa-_': '1',
      stampa: keep,
      fotoMostrate: `${quadro.id} ${argano.id}`,
      fotoStampa: argano.id,
    });
    assert.equal(saved.status, 303);
    const print = (await browser.get(`/schede/${id}/stampa`)).body;
    assert.match(print, new RegExp(`/allegati/${argano.id}\\?mini=1`), 'ticked: printed anyway');
    assert.match(print, /<h3 class="paper__foto-titolo">Argano<\/h3>/);
    assert.doesNotMatch(print, new RegExp(`/allegati/${quadro.id}\\?mini=1`));

    // A new sheet has no photos yet: no icons, the hint says when they come.
    const nuova = (await browser.get('/schede/nuova')).body;
    assert.doesNotMatch(nuova, /data-foto-stampa/);
    assert.match(nuova, /dopo il primo salvataggio/);
  });

  it('change only the photos of this sheet, and a tampered list changes nothing', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await newScheda(browser);
    const other = await newScheda(browser);
    await upload(browser, id, 'quadro', await photo('mia.jpg'));
    await upload(browser, other, 'quadro', await photo('altra.jpg'));
    await processAll();
    const mine = await prisma.allegato.findFirstOrThrow({ where: { schedaId: id } });
    const theirs = await prisma.allegato.findFirstOrThrow({ where: { schedaId: other } });
    const both = `${mine.id} ${theirs.id}`;
    const ok = await salva(browser, id, { fotoMostrate: both, fotoStampa: [mine.id, theirs.id] });
    assert.equal(ok.status, 303);
    assert.deepEqual(await inStampa(id), [mine.id]);
    assert.deepEqual(await inStampa(other), [], 'the other sheet is not touched');

    const bad = await salva(browser, id, { fotoMostrate: `${mine.id} ../x`, fotoStampa: [] });
    assert.equal(bad.status, 422);
    assert.match(bad.body, /id="err-fotoStampa"/);
    assert.deepEqual(await inStampa(id), [mine.id], 'nothing changed');
  });

  it('come again from the server for those who write the sheet, and for no one else', async () => {
    const { browser, user } = await signedIn('TECNICO');
    const id = await newScheda(browser);
    await upload(browser, id, 'quadro', await photo('quadro.jpg'));
    await processAll();
    const row = await prisma.allegato.findFirstOrThrow({ where: { schedaId: id } });
    await prisma.allegato.update({ where: { id: row.id }, data: { inStampa: true } });

    const part = await browser.get(`/schede/${id}/foto-stampa`);
    assert.equal(part.status, 200);
    assert.match(part.body, /^<div class="foto-stampa" data-foto-stampa=/);
    assert.match(part.body, new RegExp(`value="${row.id}" checked>`));
    assert.doesNotMatch(part.body, /<html/);

    const reader = (await signedIn('CLIENTE', user.aziendaId!)).browser;
    assert.equal((await reader.get(`/schede/${id}/foto-stampa`)).status, 403);
    const stranger = (await signedIn('ADMIN', (await makeAzienda()).id)).browser;
    assert.equal((await stranger.get(`/schede/${id}/foto-stampa`)).status, 404);
  });
});
