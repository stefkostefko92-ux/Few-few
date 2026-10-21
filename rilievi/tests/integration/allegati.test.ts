import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import {
  BASE,
  Browser,
  makeAzienda,
  PORT,
  prisma,
  signedIn,
  startApp,
  stopApp,
  type UploadFile,
} from './harness.js';

const { elabora, prendiProssimo, verificaStrumenti } = await import('../../src/allegati/coda.js');

before(startApp);
after(stopApp);

const XP = { 'x-partial': '1' };
const media = () => process.env.MEDIA_DIR!;
const folder = (id: string) => join(media(), 'schede', id);

const photo = async (name = 'quadro.jpg', width = 640, height = 480): Promise<UploadFile> => ({
  field: 'file',
  name,
  type: 'image/jpeg',
  bytes: await sharp({ create: { width, height, channels: 3, background: '#3060a0' } })
    .withExif({ IFD0: { Make: 'TestPhone', Model: 'Model 9' } })
    .jpeg()
    .toBuffer(),
});

async function newScheda(browser: Browser): Promise<string> {
  const reply = await browser.submit('/schede/nuova', '/schede', {
    data: '2026-10-21',
    indirizzo: 'Via Roma 1, Milano',
    matricola: '0012345',
  });
  assert.equal(reply.status, 303, `create failed with ${reply.status}`);
  return /^\/schede\/([a-z0-9]+)$/.exec(reply.location)![1]!;
}

function upload(
  browser: Browser,
  id: string,
  sezione: string,
  files: UploadFile | UploadFile[],
  headers: Record<string, string> = XP,
) {
  return browser.upload(
    `/schede/${id}`,
    `/schede/${id}/allegati`,
    { sezione, ritorno: 'scheda' },
    files,
    headers,
  );
}

interface Answer {
  html: string;
  avvisi: string[];
  ok: string | null;
}
const answer = (body: string) => JSON.parse(body) as Answer;

/** What a refused upload left in `arrivi/` goes when the response closes — a moment later. */
async function arriviEmpty(): Promise<void> {
  let left: string[] = [];
  for (let i = 0; i < 40; i += 1) {
    left = await readdir(join(media(), 'arrivi'));
    if (left.length === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.deepEqual(left, [], 'nothing left behind in arrivi/');
}

/** The worker, until the queue is empty (photos need no ffmpeg). */
async function processAll(
  strumenti = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', zscale: false },
): Promise<string[]> {
  const done: string[] = [];
  for (let lavoro = await prendiProssimo(); lavoro; lavoro = await prendiProssimo()) {
    done.push(await elabora(lavoro, strumenti, new AbortController().signal));
  }
  return done;
}

describe('photos and videos of a sheet', () => {
  it('a photo goes into its section, waits for the worker, then is served compressed and without EXIF', async () => {
    const { user, browser } = await signedIn('TECNICO');
    const id = await newScheda(browser);
    const reply = await upload(browser, id, 'quadro', await photo());
    assert.equal(reply.status, 200);
    const sent = answer(reply.body);
    assert.deepEqual(sent.avvisi, []);
    assert.match(sent.ok ?? '', /File caricati: 1/);
    assert.match(sent.html, /data-stato="IN_CODA"/);

    const row = await prisma.allegato.findFirstOrThrow({ where: { schedaId: id } });
    assert.equal(row.sezione, 'quadro');
    assert.equal(row.stato, 'IN_CODA');
    assert.equal(row.caricatoDaId, user.id);
    assert.equal(row.nomeOriginale, 'quadro.jpg');
    assert.ok(existsSync(join(folder(id), `${row.id}.orig`)), 'the upload waits on the volume');
    await arriviEmpty();
    const audit = await prisma.auditLog.findFirst({ where: { action: 'ALLEGATO_UPLOAD' } });
    assert.deepEqual(audit?.meta, { sezione: 'quadro', foto: 1, video: 0 });
    // Not ready yet: nothing to serve.
    assert.equal((await browser.get(`/schede/${id}/allegati/${row.id}`)).status, 404);

    assert.deepEqual(await processAll(), ['PRONTO']);
    const ready = await prisma.allegato.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(ready.stato, 'PRONTO');
    assert.deepEqual([ready.larghezza, ready.altezza], [640, 480]);
    assert.ok(!existsSync(join(folder(id), `${row.id}.orig`)), 'the original is gone');

    const file = await browser.get(`/schede/${id}/allegati/${row.id}`);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'image/jpeg');
    assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(file.headers.get('cache-control'), 'private, no-cache');
    assert.match(file.headers.get('content-disposition') ?? '', /^inline; filename="quadro.jpg"/);
    assert.equal((await sharp(file.bytes).metadata()).exif, undefined, 'no EXIF is served');
    const mini = await browser.get(`/schede/${id}/allegati/${row.id}?mini=1`);
    assert.equal(mini.status, 200);
    assert.equal(mini.headers.get('content-type'), 'image/jpeg');
    const download = await browser.get(`/schede/${id}/allegati/${row.id}?scarica=1`);
    assert.match(download.headers.get('content-disposition') ?? '', /^attachment;/);

    const page = await browser.get(`/schede/${id}`);
    assert.match(page.body, new RegExp(`/schede/${id}/allegati/${row.id}\\?mini=1`));
    const gallery = await browser.get(`/schede/${id}/allegati/sezione/quadro?ritorno=scheda`);
    assert.equal(gallery.status, 200);
    assert.match(gallery.body, /data-stato="PRONTO"/);
  });

  it('only those who see the sheet see its files; only those who write add them', async () => {
    const { browser, user } = await signedIn('TECNICO');
    const id = await newScheda(browser);
    assert.equal((await upload(browser, id, 'argano', await photo())).status, 200);
    await processAll();
    const row = await prisma.allegato.findFirstOrThrow({ where: { schedaId: id } });

    const other = await makeAzienda();
    const stranger = (await signedIn('ADMIN', other.id)).browser;
    assert.equal((await stranger.get(`/schede/${id}/allegati/${row.id}`)).status, 404);
    assert.equal((await stranger.get(`/schede/${id}/allegati/sezione/argano`)).status, 404);
    const foreign = await stranger.upload(
      '/account',
      `/schede/${id}/allegati`,
      { sezione: 'argano' },
      await photo(),
      XP,
    );
    assert.equal(foreign.status, 404, 'a sheet of another company takes nothing');

    const reader = (await signedIn('CLIENTE', user.aziendaId!)).browser;
    assert.equal((await reader.get(`/schede/${id}/allegati/${row.id}`)).status, 200);
    const readerPage = await reader.get(`/schede/${id}`);
    assert.doesNotMatch(readerPage.body, /id="carica-argano"/, 'no upload for read-only');
    assert.doesNotMatch(readerPage.body, /data-elimina=/);
    const readerUpload = await reader.upload(
      '/account',
      `/schede/${id}/allegati`,
      { sezione: 'argano' },
      await photo(),
      XP,
    );
    assert.equal(readerUpload.status, 403);

    const forged = await upload(browser, id, 'argano', await photo(), {
      ...XP,
      origin: 'https://evil.example',
    });
    assert.equal(forged.status, 403, 'another site cannot post here');
    assert.equal(await prisma.allegato.count({ where: { schedaId: id } }), 1);
    await arriviEmpty();
  });

  it('refuses what is not a photo or a video, and says why', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await newScheda(browser);
    const heic = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypheic'),
      Buffer.alloc(64),
    ]);
    const big = await sharp({
      create: {
        width: 1600,
        height: 1600,
        channels: 3,
        background: '#808080',
        noise: { type: 'gaussian', mean: 128, sigma: 80 },
      },
    })
      .jpeg({ quality: 100 })
      .toBuffer();
    assert.ok(big.length > 1024 * 1024, 'the test photo is over the 1 MB cap of the tests');
    const reply = await upload(browser, id, 'serrature', [
      { field: 'file', name: 'IMG_0001.HEIC', type: 'image/heic', bytes: heic },
      {
        field: 'file',
        name: 'nota.jpg',
        type: 'image/jpeg',
        bytes: Buffer.from('not a photo at all'),
      },
      { field: 'file', name: 'grande.jpg', type: 'image/jpeg', bytes: big },
      await photo('buona.jpg'),
    ]);
    const sent = answer(reply.body);
    assert.equal(sent.avvisi.length, 3);
    assert.match(sent.avvisi[0]!, /IMG_0001\.HEIC.*HEIC/);
    assert.match(sent.avvisi[1]!, /nota\.jpg.*formato non supportato/);
    assert.match(sent.avvisi[2]!, /grande\.jpg.*massimo 1 MB/);
    assert.match(sent.ok ?? '', /File caricati: 1/, 'the good one goes in');
    assert.deepEqual(
      (await prisma.allegato.findMany({ where: { schedaId: id } })).map((a) => a.nomeOriginale),
      ['buona.jpg'],
    );

    const eleven = await Promise.all(
      Array.from({ length: 11 }, (_, i) => photo(`p${i}.jpg`, 16, 16)),
    );
    const many = answer((await upload(browser, id, 'serrature', eleven)).body);
    assert.match(many.avvisi.join(' '), /al massimo 10 file/);
    const none = answer((await upload(browser, id, 'serrature', [])).body);
    assert.match(none.avvisi.join(' '), /Scegli almeno una foto/);
    assert.equal((await upload(browser, id, 'nonEsiste', await photo())).status, 400);
    await arriviEmpty();
    await processAll();
  });

  // Without the 411 the server waits for the rest of the chunked body: the timeout makes that a failure.
  it(
    'stops a body over the cap, or of unknown size, before reading it',
    { timeout: 15_000 },
    async () => {
      const { browser } = await signedIn('TECNICO');
      const id = await newScheda(browser);
      const cookie = [...browser.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
      const send = (size: Record<string, string>) =>
        new Promise<number>((resolve, reject) => {
          const req = request(
            {
              port: PORT,
              host: '127.0.0.1',
              method: 'POST',
              path: `/schede/${id}/allegati`,
              headers: {
                cookie,
                origin: BASE,
                'x-partial': '1',
                'x-forwarded-for': browser.ip,
                'content-type': 'multipart/form-data; boundary=x',
                ...size,
              },
            },
            (res) => {
              res.resume();
              resolve(res.statusCode ?? 0);
              req.destroy();
            },
          );
          req.on('error', (error) => (req.destroyed ? undefined : reject(error)));
          req.write(Buffer.alloc(1024));
        });
      assert.equal(await send({ 'content-length': String(27 * 1024 * 1024) }), 413);
      // A chunked body says nothing of its size: no way to check the cap or the free space first.
      assert.equal(await send({ 'transfer-encoding': 'chunked' }), 411);
      await arriviEmpty();
    },
  );

  it('keeps room on the disk for the uploads still running', async () => {
    const { riservaSpazio, spazioLibero } = await import('../../src/allegati/archivio.js');
    const min = 100 * 1024 * 1024;
    const room = (await spazioLibero()) - min;
    assert.ok(room > 64 * 1024 * 1024, 'the test needs some free space');
    const first = await riservaSpazio(room - 32 * 1024 * 1024);
    assert.ok(first, 'one upload fits');
    assert.equal(
      await riservaSpazio(64 * 1024 * 1024),
      null,
      'a second one at the same time does not',
    );
    first();
    first();
    const second = await riservaSpazio(64 * 1024 * 1024);
    assert.ok(second, 'released once, and only once');
    second();
  });

  it('keeps the files of one upload in their order, and a sheet trashed meanwhile takes nothing', async () => {
    const { browser, user } = await signedIn('TECNICO');
    const id = await newScheda(browser);
    await upload(browser, id, 'note', [
      await photo('c.jpg'),
      await photo('a.jpg'),
      await photo('b.jpg'),
    ]);
    const order = (
      await prisma.allegato.findMany({
        where: { schedaId: id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
    ).map((a) => a.nomeOriginale);
    assert.deepEqual(order, ['c.jpg', 'a.jpg', 'b.jpg']);
    await processAll();

    // The upload ran for minutes and the sheet went to the trash meanwhile: no row, no file.
    const { aggiungiAllegati } = await import('../../src/allegati/service.js');
    const temp = join(media(), 'arrivi', 'late-upload');
    await writeFile(temp, (await photo()).bytes);
    const scheda = await prisma.scheda.update({ where: { id }, data: { deletedAt: new Date() } });
    const late = await aggiungiAllegati(
      scheda,
      'note',
      null,
      [{ temp, nome: 'tardi.jpg', byte: 10, tipo: 'FOTO' }],
      user.id,
    );
    assert.deepEqual(late, { ok: false, error: 'scheda' });
    assert.equal(await prisma.allegato.count({ where: { schedaId: id } }), 3);
    assert.ok(!existsSync(temp));
    assert.equal(
      (await readdir(folder(id))).filter((name) => name.endsWith('.orig')).length,
      0,
      'nothing waiting on the volume',
    );
  });

  it('saves only a changed caption, and deletes a file after asking, files included', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await newScheda(browser);
    await upload(browser, id, 'cavi', [await photo('a.jpg'), await photo('b.jpg')]);
    await processAll();
    const [a, b] = await prisma.allegato.findMany({
      where: { schedaId: id },
      orderBy: { nomeOriginale: 'asc' },
    });
    assert.ok(a && b);
    await prisma.allegato.update({ where: { id: b.id }, data: { didascalia: 'Scritta da altri' } });

    const csrf = await browser.csrf(`/schede/${id}`);
    const saved = await browser.post(
      `/schede/${id}/allegati/${a.id}/didascalia`,
      {
        _csrf: csrf,
        ritorno: 'scheda',
        [`didascalia-${a.id}`]: '  Morsettiera  ',
        [`prima-${a.id}`]: '',
        // The page was opened before someone else wrote this caption: untouched here, not saved.
        [`didascalia-${b.id}`]: '',
        [`prima-${b.id}`]: '',
      },
      XP,
    );
    assert.equal(saved.status, 200);
    assert.equal(answer(saved.body).ok, 'Didascalia salvata.');
    assert.equal(
      (await prisma.allegato.findUniqueOrThrow({ where: { id: a.id } })).didascalia,
      'Morsettiera',
    );
    assert.equal(
      (await prisma.allegato.findUniqueOrThrow({ where: { id: b.id } })).didascalia,
      'Scritta da altri',
    );

    const ask = await browser.get(`/schede/${id}/allegati/${a.id}/elimina?ritorno=modifica`);
    assert.equal(ask.status, 200);
    assert.match(ask.body, /Elimina definitivamente/);
    const gone = await browser.submit(`/schede/${id}`, `/schede/${id}/allegati/${a.id}/elimina`, {
      ritorno: 'modifica',
    });
    assert.equal(gone.status, 303);
    assert.equal(gone.location, `/schede/${id}/modifica#a-cavi`);
    assert.equal(await prisma.allegato.count({ where: { id: a.id } }), 0);
    assert.ok(!existsSync(join(folder(id), `${a.id}.jpg`)));
    assert.ok(!existsSync(join(folder(id), `${a.id}.mini.jpg`)));
    assert.ok(existsSync(join(folder(id), `${b.id}.jpg`)), 'the other file stays');
  });

  it('a sheet purged from the trash takes its folder with it', async () => {
    const { browser, user } = await signedIn('ADMIN');
    const id = await newScheda(browser);
    await upload(browser, id, 'quadro', await photo());
    await processAll();
    assert.ok(existsSync(folder(id)));
    const trashed = await browser.submit(`/schede/${id}/elimina`, `/schede/${id}/elimina`, {});
    assert.equal(trashed.status, 303);
    assert.ok(existsSync(folder(id)), 'the trash keeps everything');
    const purged = await browser.submit(`/cestino/${id}/elimina`, `/cestino/${id}/elimina`, {});
    assert.equal(purged.status, 303);
    assert.equal(await prisma.allegato.count({ where: { schedaId: id } }), 0);
    // The folder goes right after the rows (not awaited by the request).
    for (let i = 0; i < 20 && existsSync(folder(id)); i += 1)
      await new Promise((r) => setTimeout(r, 50));
    assert.ok(!existsSync(folder(id)));
    assert.ok(user);
  });

  it('puts the photos at the end of the print and the PDF only when the sheet asks for it', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await newScheda(browser);
    await upload(browser, id, 'impianto', await photo('ingresso.jpg'));
    await processAll();
    const row = await prisma.allegato.findFirstOrThrow({ where: { schedaId: id } });
    const pages = async () =>
      (await PDFDocument.load((await browser.get(`/schede/${id}/pdf`)).bytes)).getPageCount();
    const before = await pages();
    assert.doesNotMatch((await browser.get(`/schede/${id}/stampa`)).body, /paper__foto/);

    const save = async (form: Record<string, string>) => {
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
      return (await prisma.scheda.findUniqueOrThrow({ where: { id } })).fotoStampate;
    };
    assert.equal(await save({ 'stampaFoto-_': '1', stampaFoto: 'si' }), true);
    assert.equal(await save({}), true, 'a page without the tick leaves the choice alone');

    const print = await browser.get(`/schede/${id}/stampa`);
    assert.match(print.body, /class="paper__section paper__foto"/);
    assert.match(print.body, new RegExp(`/schede/${id}/allegati/${row.id}\\?mini=1`));
    assert.equal(await pages(), before + 1, 'the photos start on a page of their own');

    assert.equal(await save({ 'stampaFoto-_': '1' }), false);
    assert.doesNotMatch((await browser.get(`/schede/${id}/stampa`)).body, /paper__foto/);
    assert.equal(await pages(), before);
  });
});

let ffmpeg = false;
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  ffmpeg = true;
} catch {
  // Without ffmpeg (a laptop) the video test is skipped; CI installs it, so there it must run.
  if (process.env.CI) throw new Error('ffmpeg is required in CI for the video test');
}

describe('a video', { skip: !ffmpeg && 'ffmpeg is not installed here' }, () => {
  it('is compressed to H.264, starts while loading and is served by ranges', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await newScheda(browser);
    const clip = execFileSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=1280x720:rate=30:duration=2',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=2',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        '-f',
        'mp4',
        '-movflags',
        'frag_keyframe+empty_moov',
        'pipe:1',
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    const sent = answer(
      (
        await upload(browser, id, 'quadro', {
          field: 'file',
          name: 'giro.mp4',
          type: 'video/mp4',
          bytes: clip,
        })
      ).body,
    );
    assert.match(sent.ok ?? '', /File caricati: 1/);
    const strumenti = await verificaStrumenti(new AbortController().signal);
    assert.deepEqual(await processAll(strumenti), ['PRONTO']);
    const row = await prisma.allegato.findFirstOrThrow({ where: { schedaId: id } });
    assert.equal(row.tipo, 'VIDEO');
    assert.deepEqual([row.larghezza, row.altezza], [1280, 720]);
    assert.ok(row.durataMs! >= 1900 && row.durataMs! <= 2100, `duration ${row.durataMs}`);

    const whole = await browser.get(`/schede/${id}/allegati/${row.id}`);
    assert.equal(whole.headers.get('content-type'), 'video/mp4');
    const text = whole.bytes.toString('latin1');
    assert.ok(text.indexOf('moov') < text.indexOf('mdat'), 'faststart: the index comes first');
    const part = await browser.get(`/schede/${id}/allegati/${row.id}`, { range: 'bytes=0-99' });
    assert.equal(part.status, 206);
    assert.equal(part.bytes.length, 100);
    assert.match(part.headers.get('content-range') ?? '', /^bytes 0-99\//);
    const poster = await browser.get(`/schede/${id}/allegati/${row.id}?mini=1`);
    assert.equal(poster.headers.get('content-type'), 'image/jpeg');
  });
});
