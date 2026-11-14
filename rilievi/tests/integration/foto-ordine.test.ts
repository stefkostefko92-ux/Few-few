// The order and the size of the photos in the print, chosen in "Stampa e PDF" (the owner, 10 November
// 2026): saved with the sheet, kept by the form and the icons that come again, followed by the print
// and the PDF; a page from before leaves them alone, a forged value is refused.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { Browser, prisma, signedIn, startApp, stopApp } from './harness.js';
import { newScheda, photo, processAll, upload } from './media.js';

before(startApp);
after(stopApp);

async function salva(browser: Browser, id: string, form: Record<string, string | string[]>) {
  const edit = await browser.get(`/schede/${id}/modifica`);
  const base = /name="base" value="([^"]+)"/.exec(edit.body)![1]!;
  return browser.submit(`/schede/${id}/modifica`, `/schede/${id}`, {
    base,
    data: '2026-11-10',
    indirizzo: 'Via Roma 1, Milano',
    matricola: '0012345',
    ...form,
  });
}

describe('the order and the size of the photos in the print', () => {
  it('are saved with the sheet and followed by the print and the PDF', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await newScheda(browser);
    await upload(browser, id, 'impianto', [await photo('ingresso.jpg'), await photo('targa.jpg')]);
    await upload(browser, id, 'quadro', [await photo('quadro.jpg')]);
    await processAll();
    const rows = await prisma.allegato.findMany({
      where: { schedaId: id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const [uno, due, tre] = rows.map((r) => r.id) as [string, string, string];
    const tutte = `${uno} ${due} ${tre}`;

    // The form: the size of before ("Medie") and every icon with its shape for the preview.
    const form = (await browser.get(`/schede/${id}/modifica`)).body;
    assert.match(form, /name="fotoDimensione" value="MEDIE" checked/);
    assert.match(form, /name="fotoOrdine" value=""/);
    assert.match(
      form,
      new RegExp(
        `data-rapporto="[0-9.]+" data-titolo="Impianto"><input type="checkbox" name="fotoStampa" value="${uno}"`,
      ),
    );
    assert.match(form, /data-foto-ordine-blocco/);

    const saved = await salva(browser, id, {
      fotoMostrate: tutte,
      fotoStampa: [uno, due, tre],
      fotoOrdine: `${tre} ${uno} ${due}`,
      fotoDimensione: 'GRANDI',
    });
    assert.equal(saved.status, 303);
    const posti = await prisma.allegato.findMany({
      where: { schedaId: id },
      orderBy: { ordineStampa: 'asc' },
      select: { id: true, ordineStampa: true },
    });
    assert.deepEqual(
      posti.map((p) => [p.id, p.ordineStampa]),
      [
        [tre, 1],
        [uno, 2],
        [due, 3],
      ],
    );
    assert.equal(
      (await prisma.scheda.findUniqueOrThrow({ where: { id } })).fotoDimensione,
      'GRANDI',
    );

    // The print: that order, the size on the grid.
    const print = (await browser.get(`/schede/${id}/stampa`)).body;
    assert.match(print, /paper__foto-grid paper__foto-grid--grandi/);
    const at = (aid: string) => print.indexOf(`/allegati/${aid}?mini=1`);
    assert.ok(at(tre) > 0 && at(tre) < at(uno) && at(uno) < at(due), 'printed in the order chosen');

    // The form again and the icons that come again: the order and the size saved.
    const again = (await browser.get(`/schede/${id}/modifica`)).body;
    assert.match(again, new RegExp(`name="fotoOrdine" value="${tre} ${uno} ${due}"`));
    assert.match(again, /name="fotoDimensione" value="GRANDI" checked/);
    const icons = (await browser.get(`/schede/${id}/foto-stampa`)).body;
    assert.match(icons, new RegExp(`name="fotoOrdine" value="${tre} ${uno} ${due}"`));
    assert.match(icons, /name="fotoDimensione" value="GRANDI" checked/);

    // A page from before (no order, no size): both stay.
    assert.equal(
      (await salva(browser, id, { fotoMostrate: tutte, fotoStampa: [uno, due, tre] })).status,
      303,
    );
    assert.equal((await prisma.allegato.findUniqueOrThrow({ where: { id: tre } })).ordineStampa, 1);
    assert.equal(
      (await prisma.scheda.findUniqueOrThrow({ where: { id } })).fotoDimensione,
      'GRANDI',
    );

    // One a row takes more pages than small photos.
    const pages = async () =>
      (await PDFDocument.load((await browser.get(`/schede/${id}/pdf`)).bytes)).getPageCount();
    const conDimensione = async (fotoDimensione: string) => {
      const r = await salva(browser, id, {
        fotoMostrate: tutte,
        fotoStampa: [uno, due, tre],
        fotoOrdine: `${tre} ${uno} ${due}`,
        fotoDimensione,
      });
      assert.equal(r.status, 303);
      return pages();
    };
    const piccole = await conDimensione('PICCOLE');
    const una = await conDimensione('UNA');
    assert.ok(una > piccole, `${piccole} → ${una}`);

    // A photo taken off the print loses its place.
    assert.equal(
      (
        await salva(browser, id, {
          fotoMostrate: tutte,
          fotoStampa: [uno, tre],
          fotoOrdine: `${tre} ${uno}`,
          fotoDimensione: 'MEDIE',
        })
      ).status,
      303,
    );
    assert.equal(
      (await prisma.allegato.findUniqueOrThrow({ where: { id: due } })).ordineStampa,
      null,
    );
  });

  it('refuses a forged size and saves nothing', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await newScheda(browser);
    await upload(browser, id, 'impianto', [await photo('ingresso.jpg')]);
    await processAll();
    const [foto] = await prisma.allegato.findMany({ where: { schedaId: id } });
    const reply = await salva(browser, id, {
      fotoMostrate: foto!.id,
      fotoStampa: foto!.id,
      fotoOrdine: foto!.id,
      fotoDimensione: 'ENORMI',
    });
    assert.equal(reply.status, 422);
    assert.equal(
      (await prisma.scheda.findUniqueOrThrow({ where: { id } })).fotoDimensione,
      'MEDIE',
    );
    assert.equal(
      (await prisma.allegato.findUniqueOrThrow({ where: { id: foto!.id } })).inStampa,
      false,
    );
  });
});
