import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';
import { primitiviFoglio } from '../../src/schizzi/forme.js';
import { foglioSchema } from '../../src/schizzi/model.js';
import { Browser, makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';
import { newScheda } from './media.js';

before(startApp);
after(stopApp);

// The elements of the sketch pad beyond the pen and the text: ellipses, arrows and callouts,
// dimensions (and a radius), symbols, dashes — saved with the sheet, drawn the same in the page, the
// print and the PDF; the texts escaped everywhere; a tampered sheet refused but its valid elements kept
// on the returned form; the weight budget; a sheet this version cannot read left where it is.

type Elemento = Record<string, unknown>;
const foglio = (...e: Elemento[]) => JSON.stringify({ e });
const TUTTI: Elemento[] = [
  { t: 'p', c: 'r', s: 1, k: 1, d: 'M100 100l200 0' },
  { t: 'x', c: 'k', s: 1, x: 100, y: 300, v: 'Vano 1600 × 1400' },
  { t: 'e', c: 'k', s: 2, x: 700, y: 400, rx: 150, ry: 150 },
  { t: 'e', c: 'b', s: 1, k: 1, x: 1100, y: 800, rx: 120, ry: 60 },
  { t: 'a', c: 'b', s: 1, x1: 700, y1: 400, x2: 1000, y2: 250, v: 'Pistone' },
  { t: 'a', c: 'k', s: 2, k: 1, x1: 200, y1: 900, x2: 400, y2: 800 },
  { t: 'q', c: 'k', s: 1, x1: 500, y1: 700, x2: 900, y2: 700, o: 80, v: '1600' },
  { t: 'q', c: 'k', s: 1, x1: 700, y1: 400, x2: 850, y2: 400, o: 0, v: 'R 150', m: 'r' },
  { t: 's', c: 'k', s: 1, n: 'cabina', x: 300, y: 600, w: 400, h: 300, r: 1, f: 1 },
  { t: 's', c: 'r', s: 2, k: 1, n: 'pistone', x: 1200, y: 300, w: 120, h: 120, r: 0 },
  { t: 'q', c: 'r', s: 2, x1: 1300, y1: 200, x2: 1300, y2: 600, o: -50, v: '400' },
];

/** Saves the sheet with the minimum it needs and `form` on top (the page's own `base`). */
async function salva(browser: Browser, id: string, form: Record<string, string | string[]>) {
  const edit = await browser.get(`/schede/${id}/modifica`);
  const base = /name="base" value="([^"]+)"/.exec(edit.body)![1]!;
  return browser.submit(`/schede/${id}/modifica`, `/schede/${id}`, {
    base,
    data: '2026-10-22',
    indirizzo: 'Via Roma 1, Milano',
    matricola: '0012345',
    'schizzi-_': '1',
    ...form,
  });
}

const fogli = async (schedaId: string) =>
  (await prisma.schizzo.findMany({ where: { schedaId }, orderBy: { ordine: 'asc' } })).map(
    (row) => row.elementi,
  );

/** The sheets in the hidden fields of a form page, as JSON (not the template of a new sheet). */
const nelForm = (body: string) =>
  [
    ...body
      .replace(/<template data-foglio-modello>[\s\S]*?<\/template>/, '')
      .matchAll(/name="schizzo" value="([^"]*)"/g),
  ].map(
    (m) =>
      JSON.parse(
        m[1]!
          .replaceAll('&#34;', '"')
          .replaceAll('&#39;', "'")
          .replaceAll('&lt;', '<')
          .replaceAll('&gt;', '>')
          .replaceAll('&amp;', '&'),
      ) as { e: Elemento[] },
  );

async function pronta() {
  const azienda = await makeAzienda();
  await prisma.azienda.update({ where: { id: azienda.id }, data: { schizzi: true } });
  const { browser } = await signedIn('TECNICO', azienda.id);
  return { browser, id: await newScheda(browser) };
}

describe('the elements of the sketch pad', () => {
  it('saves every kind and draws it the same in the page, the print and the PDF', async () => {
    const { browser, id } = await pronta();
    // The sheets drawn in the PDF: each one is clipped to its frame (`W n` — the only clip there,
    // src/schede/pdf-schizzi.ts). Not the number of pages: a sheet fits on the last one when it has room.
    const pdfSheets = async () => {
      const reply = await browser.get(`/schede/${id}/pdf`);
      assert.equal(reply.status, 200);
      const pdf = await PDFDocument.load(reply.bytes);
      let content = '';
      for (const page of pdf.getPages()) {
        const contents = page.node.Contents();
        const streams =
          contents instanceof PDFArray
            ? contents.asArray().map((ref) => pdf.context.lookup(ref))
            : [contents];
        for (const stream of streams) {
          if (stream instanceof PDFRawStream)
            content += `${Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')}\n`;
        }
      }
      return (content.match(/^W n$/gm) ?? []).length;
    };
    assert.equal(await pdfSheets(), 0);
    const sent = foglio(...TUTTI);
    assert.equal((await salva(browser, id, { schizzo: sent })).status, 303);
    assert.deepEqual(await fogli(id), [JSON.parse(sent)]);

    const drawn = primitiviFoglio(foglioSchema.parse({ e: TUTTI }));
    const lines = drawn.filter((p) => p.p === 'l' || p.p === 'f');
    assert.ok(lines.length > TUTTI.length, 'the symbols, arrows and dimensions are several lines');
    for (const page of [`/schede/${id}`, `/schede/${id}/stampa`, `/schede/${id}/modifica`]) {
      const body = (await browser.get(page)).body;
      for (const p of lines) assert.ok(body.includes(`<path d="${p.d}"`), `${page}: ${p.d}`);
      assert.match(body, /<ellipse cx="700" cy="400" rx="150" ry="150" stroke="#000000"/);
      assert.match(body, /<ellipse cx="1100" cy="800" rx="120" ry="60"[^>]*stroke-dasharray/);
      for (const text of ['1600', 'R 150', '400', 'Pistone', 'Vano 1600 × 1400']) {
        assert.ok(body.includes(`>${text}</text>`), `${page}: ${text}`);
      }
      assert.match(body, /transform="rotate\(-90 /, `${page}: the upright dimension`);
    }
    assert.equal(await pdfSheets(), 1, 'the PDF has the sheet');
  });

  it('escapes the texts in the page, the print and the returned form', async () => {
    const { browser, id } = await pronta();
    const attacchi = [
      { t: 'x', c: 'k', s: 1, x: 100, y: 100, v: '<script>alert(1)</script>' },
      {
        t: 'q',
        c: 'k',
        s: 1,
        x1: 100,
        y1: 500,
        x2: 600,
        y2: 500,
        o: 50,
        v: '"><img src=x onerror=a()>',
      },
      { t: 'a', c: 'k', s: 1, x1: 700, y1: 700, x2: 900, y2: 600, v: "</text><svg onload='a()'>" },
    ];
    const sent = foglio(...attacchi);
    assert.equal((await salva(browser, id, { schizzo: sent })).status, 303);
    const returned = await salva(browser, id, { schizzo: sent, data: 'ieri' });
    assert.equal(returned.status, 422);
    const pages = [`/schede/${id}`, `/schede/${id}/stampa`, `/schede/${id}/modifica`];
    const bodies = [...(await Promise.all(pages.map((p) => browser.get(p)))), returned];
    for (const { body } of bodies) {
      assert.ok(!body.includes('<script>alert(1)'));
      assert.ok(!body.includes('<img src=x'));
      assert.ok(!body.includes('<svg onload'));
      assert.ok(body.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    }
    assert.deepEqual(nelForm(returned.body), [JSON.parse(sent)], 'the returned form keeps them');
  });

  it('refuses a tampered sheet and keeps its valid elements on the returned form', async () => {
    const { browser, id } = await pronta();
    const mio = foglio(TUTTI[0]!);
    assert.equal((await salva(browser, id, { schizzo: mio })).status, 303);
    const buoni = [TUTTI[2]!, TUTTI[6]!, TUTTI[8]!];
    const cattivi: Elemento[] = [
      { t: 'w', x: 1 },
      { ...TUTTI[2]!, rx: 0 },
      { ...TUTTI[4]!, x2: 700, y2: 400 },
      { ...TUTTI[6]!, v: '1'.repeat(41) },
      { ...TUTTI[6]!, o: 900 },
      { ...TUTTI[7]!, o: 10 },
      { ...TUTTI[8]!, n: 'ascensore' },
      { ...TUTTI[8]!, r: 4 },
      { ...TUTTI[6]!, k: 1 },
      { ...TUTTI[1]!, k: 1 },
      { ...TUTTI[8]!, extra: true },
    ];
    for (const cattivo of cattivi) {
      const reply = await salva(browser, id, {
        schizzo: foglio(buoni[0]!, cattivo, buoni[1]!, buoni[2]!),
      });
      assert.equal(reply.status, 422, JSON.stringify(cattivo));
      assert.match(reply.body, /id="err-schizzo"/);
      assert.deepEqual(nelForm(reply.body), [{ e: buoni }], JSON.stringify(cattivo));
    }
    assert.deepEqual(await fogli(id), [JSON.parse(mio)], 'nothing changed');
  });

  it('takes a sheet up to its weight and not over it', async () => {
    const { browser, id } = await pronta();
    // A dimension draws six things: a thousand of them are the whole budget.
    const quota = (i: number) => ({
      t: 'q',
      c: 'k',
      s: 1,
      x1: 100 + (i % 50) * 20,
      y1: 100 + Math.floor(i / 50) * 40,
      x2: 110 + (i % 50) * 20,
      y2: 100 + Math.floor(i / 50) * 40,
      o: 0,
      v: '?',
    });
    const quote = Array.from({ length: 1000 }, (_, i) => quota(i));
    assert.equal((await salva(browser, id, { schizzo: foglio(...quote) })).status, 303);
    assert.equal(((await fogli(id))[0] as { e: unknown[] }).e.length, 1000);
    const troppo = await salva(browser, id, { schizzo: foglio(...quote, TUTTI[1]!) });
    assert.equal(troppo.status, 422);
    assert.match(troppo.body, /id="err-schizzo"/);
    assert.equal(((await fogli(id))[0] as { e: unknown[] }).e.length, 1000, 'nothing changed');
  });

  it('leaves a sheet this version cannot read where it is, after the sheets sent', async () => {
    const { browser, id } = await pronta();
    const futuro = { e: [{ t: 'w', x: 1, y: 2 }] };
    await prisma.schizzo.create({ data: { schedaId: id, ordine: 0, elementi: futuro } });
    assert.doesNotMatch((await browser.get(`/schede/${id}/stampa`)).body, /paper__schizzo"/);
    assert.deepEqual(nelForm((await browser.get(`/schede/${id}/modifica`)).body), []);

    const nuovo = foglio(TUTTI[2]!);
    assert.equal((await salva(browser, id, { schizzo: nuovo })).status, 303);
    assert.deepEqual(await fogli(id), [JSON.parse(nuovo), futuro]);
    assert.equal((await salva(browser, id, {})).status, 303);
    assert.deepEqual(await fogli(id), [futuro], 'no sheets sent: the unreadable one stays');
  });
});
