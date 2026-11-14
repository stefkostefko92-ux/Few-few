// The queue of photos and videos when something goes wrong around it (audit, 4 November 2026):
// - a second worker that starts while the first is still working puts the file back in the queue and
//   takes it again; whichever finishes second must never delete what the first one finished;
// - an upload whose transaction fails must not leave its originals on the volume, rowless, forever.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { prisma, signedIn, startApp, stopApp } from './harness.js';
import { folder, media, newScheda, photo, upload } from './media.js';

// After the harness: the queue and the service read the media settings it puts in place.
const { elabora, prendiProssimo, ripristinaInterrotti } =
  await import('../../src/allegati/coda.js');
const { aggiungiAllegati } = await import('../../src/allegati/service.js');

before(startApp);
after(stopApp);

const strumenti = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', zscale: false };
const signal = () => new AbortController().signal;

describe('the queue of photos and videos', () => {
  it('never deletes the finished files when a second worker took the same file back', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await newScheda(browser);
    assert.equal((await upload(browser, id, 'quadro', await photo())).status, 200);

    const first = await prendiProssimo();
    assert.ok(first, 'the first worker takes the photo');
    // A second worker starts now: what is "being worked" goes back in the queue, and it takes it.
    assert.equal(await ripristinaInterrotti(), 1);
    const second = await prendiProssimo();
    assert.equal(second?.id, first.id);

    assert.equal(await elabora(first, strumenti, signal()), 'PRONTO');
    // The second one finds the original gone (the first removed it once done): it fails, quietly.
    await elabora(second, strumenti, signal());

    const row = await prisma.allegato.findUniqueOrThrow({ where: { id: first.id } });
    assert.equal(row.stato, 'PRONTO');
    for (const suffix of ['.jpg', '.mini.jpg', '.riquadro.jpg']) {
      const files = await readdir(folder(id));
      assert.ok(
        files.some((f) => f === `${first.id}${suffix}`),
        `${suffix} still there (${files.join(', ')})`,
      );
    }
    assert.equal((await browser.get(`/schede/${id}/allegati/${first.id}`)).status, 200);
  });

  it('removes the original of a file deleted while it was worked', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await newScheda(browser);
    assert.equal((await upload(browser, id, 'quadro', await photo())).status, 200);
    const lavoro = await prendiProssimo();
    assert.ok(lavoro);
    await prisma.allegato.delete({ where: { id: lavoro.id } });
    assert.equal(await elabora(lavoro, strumenti, signal()), 'ERRORE');
    assert.deepEqual(
      (await readdir(folder(id))).filter((f) => f.startsWith(lavoro.id)),
      [],
      'nothing of the deleted file stays',
    );
  });

  it('leaves no original on the volume when the upload transaction fails', async () => {
    const { user } = await signedIn('TECNICO');
    const scheda = await prisma.scheda.create({
      data: { aziendaId: user.aziendaId!, data: new Date('2026-11-04'), searchText: '' },
    });
    const temp = join(media(), 'arrivi', `orfano-${scheda.id}`);
    await writeFile(temp, (await photo()).bytes);
    // An author who is not there: the rows break their foreign key inside the transaction.
    await assert.rejects(
      aggiungiAllegati(
        { id: scheda.id, aziendaId: scheda.aziendaId },
        'quadro',
        null,
        [{ temp, nome: 'quadro.jpg', byte: 100, tipo: 'FOTO' }],
        'nessuno',
      ),
    );
    assert.ok(!existsSync(temp), 'the upload is not left in arrivi/');
    const left = existsSync(folder(scheda.id)) ? await readdir(folder(scheda.id)) : [];
    assert.deepEqual(left, [], 'no original without its row');
    assert.equal(await prisma.allegato.count({ where: { schedaId: scheda.id } }), 0);
  });
});
