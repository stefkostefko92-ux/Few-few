import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import sharp from 'sharp';
import { Browser, makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

async function pngWithAlpha(width = 1600, height = 500): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 10, g: 40, b: 90, alpha: 0.6 } },
  })
    .png()
    .toBuffer();
}

async function jpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 400, height: 160, channels: 3, background: '#1d4ed8' } })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'Dato-Segreto-GPS' } })
    .toBuffer();
}

async function newAzienda(master: Browser, name: string, logo?: Buffer, type = 'image/png') {
  return master.upload(
    '/aziende/nuova',
    '/aziende',
    { name },
    logo ? { field: 'logo', name: 'logo.png', type, bytes: logo } : undefined,
  );
}

const idFrom = (location: string) => /^\/aziende\/([a-z0-9]+)$/.exec(location)?.[1] ?? '';

async function newScheda(browser: Browser, form: Record<string, string>): Promise<string> {
  const reply = await browser.submit('/schede/nuova', '/schede', form);
  assert.equal(reply.status, 303, `create failed with ${reply.status}`);
  return reply.location.split('/').pop()!;
}

describe('companies', () => {
  it('belong to the MASTER alone', async () => {
    const { browser } = await signedIn('ADMIN');
    assert.equal((await browser.get('/aziende')).status, 403);
    assert.equal((await browser.get('/aziende/nuova')).status, 403);
    assert.doesNotMatch((await browser.get('/schede')).body, /href="\/aziende"/);
  });

  it('are created with a name and a logo that is re-encoded and resized', async () => {
    const { browser: master } = await signedIn('MASTER');
    const reply = await newAzienda(master, 'Ascensori Rossi Srl', await pngWithAlpha());
    assert.equal(reply.status, 303);
    const azienda = await prisma.azienda.findUniqueOrThrow({
      where: { id: idFrom(reply.location) },
    });
    assert.equal(azienda.name, 'Ascensori Rossi Srl');
    assert.equal(azienda.logoType, 'image/png', 'transparency keeps PNG');
    assert.ok(azienda.logoWidth! <= 1200 && azienda.logoHeight! <= 600, 'fits 1200×600');
    const page = await master.get(`/aziende/${azienda.id}`);
    assert.match(page.body, /Ascensori Rossi Srl/);
    assert.match(page.body, new RegExp(`/aziende/${azienda.id}/logo\\?v=`));
  });

  it('refuse a duplicate name, whatever the case', async () => {
    const { browser: master } = await signedIn('MASTER');
    assert.equal((await newAzienda(master, 'Elevatori Bianchi')).status, 303);
    const again = await newAzienda(master, 'ELEVATORI BIANCHI');
    assert.equal(again.status, 409);
    assert.equal(
      await prisma.azienda.count({
        where: { name: { equals: 'elevatori bianchi', mode: 'insensitive' } },
      }),
      1,
    );
  });

  it('refuse a logo that is not PNG, JPEG or WebP, is too big or is broken', async () => {
    const { browser: master } = await signedIn('MASTER');
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    assert.equal((await newAzienda(master, 'Logo Svg', svg, 'image/svg+xml')).status, 400);
    const huge = Buffer.concat([await pngWithAlpha(10, 10), Buffer.alloc(1100 * 1024, 7)]);
    const tooBig = await newAzienda(master, 'Logo Enorme', huge);
    assert.equal(tooBig.status, 400);
    assert.match(tooBig.body, /1 MB/);
    const broken = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(400, 1),
    ]);
    assert.equal((await newAzienda(master, 'Logo Rotto', broken)).status, 400);
    assert.equal(await prisma.azienda.count({ where: { name: { startsWith: 'Logo ' } } }), 0);
  });

  it('strip the metadata of a new logo and can remove it again', async () => {
    const { browser: master } = await signedIn('MASTER');
    const created = await newAzienda(master, 'Metadati Spa');
    const id = idFrom(created.location);
    const replaced = await master.upload(
      `/aziende/${id}`,
      `/aziende/${id}/logo`,
      {},
      {
        field: 'logo',
        name: 'logo.jpg',
        type: 'image/jpeg',
        bytes: await jpegWithExif(),
      },
    );
    assert.equal(replaced.status, 303);
    const stored = await prisma.azienda.findUniqueOrThrow({ where: { id } });
    assert.equal(stored.logoType, 'image/jpeg');
    assert.equal((await sharp(Buffer.from(stored.logo!)).metadata()).exif, undefined, 'EXIF gone');
    assert.ok(!Buffer.from(stored.logo!).toString('latin1').includes('Dato-Segreto-GPS'));
    const removed = await master.submit(`/aziende/${id}`, `/aziende/${id}/logo/rimuovi`, {});
    assert.equal(removed.status, 303);
    assert.equal((await prisma.azienda.findUniqueOrThrow({ where: { id } })).logo, null);
    assert.equal((await master.get(`/aziende/${id}/logo`)).status, 404);
  });

  it('show their logo to their own people and the MASTER only', async () => {
    const { browser: master } = await signedIn('MASTER');
    const id = idFrom(
      (await newAzienda(master, 'Logo Privato', await pngWithAlpha(300, 100))).location,
    );
    const other = await makeAzienda('Azienda Curiosa');
    const { browser: member } = await signedIn('CLIENTE', id);
    const { browser: stranger } = await signedIn('ADMIN', other.id);
    const mine = await member.get(`/aziende/${id}/logo`);
    assert.equal(mine.status, 200);
    assert.equal(mine.headers.get('content-type'), 'image/png');
    assert.equal(mine.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await master.get(`/aziende/${id}/logo`)).status, 200);
    assert.equal((await stranger.get(`/aziende/${id}/logo`)).status, 404);
    assert.equal((await new Browser().get(`/aziende/${id}/logo`)).status, 302, 'sign in first');
  });
});

describe('sheets across companies', () => {
  it('stay inside their company: no list, search, page, edit, print, PDF or delete for another', async () => {
    const a = await makeAzienda('Impianti Alfa');
    const b = await makeAzienda('Impianti Beta');
    const { browser: alfa } = await signedIn('RESPONSABILE', a.id);
    const { browser: beta } = await signedIn('ADMIN', b.id);
    const id = await newScheda(alfa, {
      data: '2026-10-12',
      matricola: '909090',
      indirizzo: 'Via Alfa 1',
    });
    assert.doesNotMatch((await beta.get('/schede')).body, new RegExp(id));
    assert.doesNotMatch((await beta.get('/schede?q=909090')).body, new RegExp(id));
    assert.doesNotMatch((await beta.get('/cestino')).body, new RegExp(id));
    for (const path of [
      `/schede/${id}`,
      `/schede/${id}/modifica`,
      `/schede/${id}/stampa`,
      `/schede/${id}/pdf`,
      `/schede/${id}/elimina`,
    ]) {
      assert.equal((await beta.get(path)).status, 404, path);
    }
    const _csrf = await beta.csrf('/account');
    const update = await beta.post(`/schede/${id}`, {
      _csrf,
      data: '2026-10-12',
      matricola: '1',
      base: new Date().toISOString(),
    });
    assert.equal(update.status, 404);
    assert.equal((await beta.post(`/schede/${id}/elimina`, { _csrf })).status, 404);
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.equal(row.matricola, '909090');
    assert.equal(row.deletedAt, null);
    assert.equal(row.aziendaId, a.id, 'written into the author’s company');
  });

  it('are all visible to the MASTER, with a company filter and column', async () => {
    const a = await makeAzienda('Gamma Ascensori');
    const b = await makeAzienda('Delta Ascensori');
    const { browser: gamma } = await signedIn('TECNICO', a.id);
    const { browser: delta } = await signedIn('TECNICO', b.id);
    const ga = await newScheda(gamma, { data: '2026-10-12', matricola: '515151' });
    const de = await newScheda(delta, { data: '2026-10-12', matricola: '515152' });
    const { browser: master } = await signedIn('MASTER');
    const all = await master.get('/schede?q=51515');
    assert.match(all.body, new RegExp(ga));
    assert.match(all.body, new RegExp(de));
    assert.match(all.body, /Gamma Ascensori/);
    const filtered = await master.get(`/schede?q=51515&azienda=${a.id}`);
    assert.match(filtered.body, new RegExp(ga));
    assert.doesNotMatch(filtered.body, new RegExp(de));
    assert.equal((await master.get(`/schede/${de}`)).status, 200);
  });

  it('need a company when the MASTER writes one, and get the company logo on the PDF', async () => {
    const { browser: master } = await signedIn('MASTER');
    const id = idFrom(
      (await newAzienda(master, 'Logo In Pdf', await pngWithAlpha(800, 240))).location,
    );
    const missing = await master.submit('/schede/nuova', '/schede', {
      data: '2026-10-12',
      matricola: '777001',
    });
    assert.equal(missing.status, 422);
    assert.match(missing.body, /Scegli l&#39;azienda della scheda|Scegli l'azienda della scheda/);
    const scheda = await newScheda(master, {
      data: '2026-10-12',
      matricola: '777001',
      azienda: id,
    });
    assert.equal((await prisma.scheda.findUniqueOrThrow({ where: { id: scheda } })).aziendaId, id);
    const pdf = await master.get(`/schede/${scheda}/pdf`);
    assert.equal(pdf.status, 200);
    assert.match(pdf.bytes.toString('latin1'), /\/Subtype \/Image/, 'the logo is in the PDF');
    const print = await master.get(`/schede/${scheda}/stampa`);
    assert.match(print.body, new RegExp(`class="paper__logo" src="/aziende/${id}/logo`));
  });

  it('keep each company’s audit log to itself', async () => {
    const a = await makeAzienda('Registro Uno');
    const b = await makeAzienda('Registro Due');
    const { browser: one } = await signedIn('ADMIN', a.id);
    const { browser: two } = await signedIn('ADMIN', b.id);
    const id = await newScheda(one, { data: '2026-10-12', matricola: '313131' });
    assert.match((await one.get('/registro')).body, new RegExp(`/schede/${id}`));
    assert.doesNotMatch((await two.get('/registro')).body, new RegExp(`/schede/${id}`));
    const { browser: master } = await signedIn('MASTER');
    const log = await master.get('/registro');
    assert.match(log.body, new RegExp(`/schede/${id}`));
    assert.match(log.body, /Registro Uno/);
  });
});
