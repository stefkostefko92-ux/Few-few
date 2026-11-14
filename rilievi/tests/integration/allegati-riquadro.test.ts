import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import sharp from 'sharp';
import { makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';
import { folder, newScheda, photo, processAll, upload } from './media.js';

before(startApp);
after(stopApp);

const size = async (bytes: Buffer) => {
  const meta = await sharp(bytes).metadata();
  return [meta.width, meta.height];
};

describe('the gallery tile of a photo', () => {
  it('is made with the photo, only as big as the box of the gallery, and only for those who see the sheet', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await newScheda(browser);
    await upload(browser, id, 'quadro', await photo('quadro.jpg', 1600, 1200));
    assert.deepEqual(await processAll(), ['PRONTO']);
    const row = await prisma.allegato.findFirstOrThrow({ where: { schedaId: id } });
    assert.ok(existsSync(join(folder(id), `${row.id}.riquadro.jpg`)));

    const tile = await browser.get(`/schede/${id}/allegati/${row.id}?riquadro=1`);
    assert.equal(tile.status, 200);
    assert.equal(tile.headers.get('content-type'), 'image/jpeg');
    assert.equal(tile.headers.get('cache-control'), 'private, no-cache');
    assert.deepEqual(await size(tile.bytes), [491, 368]);
    // The print and the PDF keep the larger thumbnail.
    const mini = await browser.get(`/schede/${id}/allegati/${row.id}?mini=1`);
    assert.deepEqual(await size(mini.bytes), [960, 720]);
    assert.ok(tile.bytes.length < mini.bytes.length, 'the tile weighs less than the thumbnail');

    const other = await makeAzienda();
    const stranger = (await signedIn('ADMIN', other.id)).browser;
    assert.equal((await stranger.get(`/schede/${id}/allegati/${row.id}?riquadro=1`)).status, 404);
  });

  it('is the thumbnail for a photo compressed before the tiles existed', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await newScheda(browser);
    await upload(browser, id, 'argano', await photo('argano.jpg', 1600, 1200));
    await processAll();
    const row = await prisma.allegato.findFirstOrThrow({ where: { schedaId: id } });
    await rm(join(folder(id), `${row.id}.riquadro.jpg`));

    const tile = await browser.get(`/schede/${id}/allegati/${row.id}?riquadro=1`);
    assert.equal(tile.status, 200);
    assert.equal(tile.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(await size(tile.bytes), [960, 720]);
  });
});
