// The bounds of report/pdf-tool.mjs after the round 49 red team: a page's content decodes under one /FlateDecode or none
// (a chain of two Flates — kilobytes that decode to hundreds of megabytes — is refused at once, so are LZW, RunLength and
// decode parameters), at most 64 MiB a page and 256 MiB a file; the pages of a file share what they share (a resource on
// 200 pages is copied once); a file weighs at most twice its size and 4 MiB in the fascicolo; a PNG without
// transparency is passed through (its pixels never decoded) and the TypeScript reading of the issue agrees with the
// tool's; a control character in a stamped line never stops a fascicolo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { PDFDict, PDFDocument, PDFName, PDFRawStream, StandardFonts } from 'pdf-lib';

process.env.DATABASE_URL ??= 'postgresql://pdf-tool-test/none';
process.env.AUTH_SECRET ??= 'pdf-tool-test-secret-that-is-long-enough';
const { inspectFile, assembleFascicolo } = await import('../../src/lib/report/pdf-tool');
const { pngWay } = await import('../../src/lib/allegati/png');
const pass: { pngPlan: (b: Uint8Array) => { pass: boolean } | null } = await import(new URL('../../report/png-pass.mjs', import.meta.url).href);

const FONT = path.join(process.env.REPORT_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu', 'DejaVuSans.ttf');
const A4: [number, number] = [595.28, 841.89];

/** A PDF of `n` A4 pages whose content each page gets from `content` (a stream registered with its dictionary). */
async function withContent(n: number, content: (doc: PDFDocument, i: number) => PDFRawStream): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage(A4).node.set(PDFName.of('Contents'), doc.context.register(content(doc, i)));
  return doc.save();
}
const raw = (doc: PDFDocument, bytes: Uint8Array, dict: Record<string, unknown>): PDFRawStream =>
  PDFRawStream.of(doc.context.obj({ Length: bytes.length, ...dict } as never) as unknown as PDFDict, bytes);

test('inspect: due Flate in catena (3 KB → 200 MiB) rifiutato subito; LZW, RunLength e parametri di decodifica rifiutati', async () => {
  const twice = deflateSync(deflateSync(Buffer.alloc(200 << 20, 0x20)));
  assert.ok(twice.length < 4096, `${twice.length} byte`);
  const bomb = await withContent(1, (doc) => raw(doc, twice, { Filter: ['FlateDecode', 'FlateDecode'] }));
  const t0 = Date.now();
  assert.deepEqual(await inspectFile(bomb, 'pdf'), { ok: false, reason: 'invalid' });
  assert.ok(Date.now() - t0 < 2000, `${Date.now() - t0} ms`);
  const ops = Buffer.from('0 0 m 10 10 l S\n');
  for (const dict of [{ Filter: 'LZWDecode' }, { Filter: 'RunLengthDecode' }, { Filter: 'ASCIIHexDecode' }, { Filter: 'FlateDecode', DecodeParms: { Predictor: 12 } }]) {
    const file = await withContent(1, (doc) => raw(doc, dict.Filter === 'FlateDecode' ? deflateSync(ops) : ops, dict));
    assert.deepEqual(await inspectFile(file, 'pdf'), { ok: false, reason: 'invalid' }, JSON.stringify(dict));
  }
  // a plain stream and one Flate are read as ever
  for (const flate of [false, true]) {
    const file = await withContent(2, (doc) => raw(doc, flate ? deflateSync(ops) : ops, flate ? { Filter: 'FlateDecode' } : {}));
    assert.deepEqual(await inspectFile(file, 'pdf'), { ok: true, pages: 2 }, String(flate));
  }
});

test('inspect: al più 64 MiB di contenuto per pagina e 256 MiB per file', async () => {
  const mib = (n: number): Buffer => deflateSync(Buffer.alloc(n << 20, 0x20));
  const fifty = mib(50);
  assert.deepEqual(await inspectFile(await withContent(5, (doc) => raw(doc, fifty, { Filter: 'FlateDecode' })), 'pdf'), { ok: true, pages: 5 }, '250 MiB in tutto');
  assert.deepEqual(await inspectFile(await withContent(6, (doc) => raw(doc, fifty, { Filter: 'FlateDecode' })), 'pdf'), { ok: false, reason: 'invalid' }, '300 MiB');
  assert.deepEqual(await inspectFile(await withContent(1, (doc) => raw(doc, mib(65), { Filter: 'FlateDecode' })), 'pdf'), { ok: false, reason: 'invalid' }, 'una pagina da 65 MiB');
});

test('assemble: una risorsa condivisa da 200 pagine si copia una volta (fascicolo sotto 5 MB)', async (t) => {
  if (!existsSync(FONT)) { t.skip('DejaVu Sans non disponibile'); return; }
  const doc = await PDFDocument.create();
  const shared = doc.context.register(PDFRawStream.of(doc.context.obj({ Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 100] }),
    Uint8Array.from(Buffer.concat([Buffer.from('0 0 m 10 10 l S\n'), Buffer.alloc(1 << 20, 0x20)]))));
  for (let i = 0; i < 200; i++) {
    const p = doc.addPage(A4);
    p.node.setXObject(PDFName.of('X1'), shared);
    p.node.set(PDFName.of('Contents'), doc.context.register(doc.context.flateStream('q /X1 Do Q')));
  }
  const file = await doc.save();
  assert.deepEqual(await inspectFile(file, 'pdf'), { ok: true, pages: 200 });
  const b = await PDFDocument.create();
  b.addPage(A4).drawText('corpo', { x: 40, y: 800, font: await b.embedFont(StandardFonts.Helvetica) });
  const body = await b.save();
  const out = await assembleFascicolo({ body, header: 'H', info: { title: 't', author: 'a', subject: 's', created: new Date('2026-10-21T08:00:00Z') },
    attachments: [{ data: file, type: 'pdf', pages: 200, footer: 'Allegato 1 (p. {i}/{m})' }] });
  assert.ok(out.length < 5 * 1024 * 1024, `${out.length} byte`);
  assert.equal((await PDFDocument.load(out)).getPageCount(), 201);
});

/** A PNG w × h of colour type `ct` (8 bits), one colour, with the chunks given before the image data. */
function png(w: number, h: number, ct: number, extra: [string, Buffer][] = [], interlace = 0, filter = 0): Uint8Array {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer): number => { let c = 0xffffffff; for (const x of b) c = (crcT[(c ^ x) & 0xff] ?? 0) ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]), out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = ct; ihdr[12] = interlace;
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[ct] ?? 1;
  const row = Buffer.concat([Buffer.from([filter]), Buffer.alloc(w * channels, ct === 3 ? 0 : 0x80)]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), ...extra.map(([t, d]) => chunk(t, d)),
    chunk('IDAT', deflateSync(Buffer.concat(Array<Buffer>(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}

test('PNG: senza trasparenza i dati passano così come sono; la lettura dell’emissione e quella dello strumento coincidono', async (t) => {
  const plte: [string, Buffer] = ['PLTE', Buffer.from([255, 0, 0, 0, 255, 0])];
  const cases: [string, Uint8Array, 'pass' | 'slow'][] = [
    ['RGB', png(30, 20, 2), 'pass'], ['grigio', png(30, 20, 0), 'pass'], ['tavolozza', png(30, 20, 3, [plte]), 'pass'],
    ['RGBA', png(30, 20, 6), 'slow'], ['grigio + alfa', png(30, 20, 4), 'slow'], ['interlacciato', png(30, 20, 2, [], 1), 'slow'],
    ['tRNS', png(30, 20, 2, [['tRNS', Buffer.from([0, 1, 0, 2, 0, 3])]]), 'slow'], ['tavolozza + tRNS', png(30, 20, 3, [plte, ['tRNS', Buffer.from([0])]]), 'slow'],
  ];
  for (const [name, bytes, way] of cases) {
    assert.equal(pngWay(bytes)?.way, way, `${name}: emissione`);
    assert.equal(pass.pngPlan(bytes)?.pass, way === 'pass', `${name}: strumento`);
    assert.equal(pngWay(bytes)?.pixels, 600);
    assert.deepEqual(await inspectFile(bytes, 'png'), { ok: true, pages: 1 }, name);
  }
  // a row with a filter that does not exist: refused at the upload, never appended as garbage
  assert.deepEqual(await inspectFile(png(30, 20, 2, [], 0, 7), 'png'), { ok: false, reason: 'invalid' });
  if (!existsSync(FONT)) { t.skip('DejaVu Sans non disponibile'); return; }
  const b = await PDFDocument.create();
  b.addPage(A4);
  const out = await assembleFascicolo({ body: await b.save(), header: 'H', info: { title: 't', author: 'a', subject: 's', created: new Date('2026-10-21T08:00:00Z') },
    attachments: [{ data: png(300, 100, 2), type: 'png', pages: 1, footer: 'Allegato 1' }] });
  assert.match(Buffer.from(out).toString('latin1'), /\/Predictor 15/, 'i dati del PNG copiati con il loro predittore');
});

test('righe del timbro: un carattere di controllo nel nome dell’impianto o nel titolo di un file non ferma il fascicolo', async (t) => {
  if (!existsSync(FONT)) { t.skip('DejaVu Sans non disponibile'); return; }
  const b = await PDFDocument.create();
  b.addPage(A4);
  const out = await assembleFascicolo({ body: await b.save(), header: 'LiftPilot · RT 26-001 R0 · Impianto\tVia Roma', code: 'RT\u0085 26-001',
    info: { title: 'RT 26-001 — Impianto\tVia Roma', author: 'Ditta\u0000 Rossi', subject: 's', created: new Date('2026-10-21T08:00:00Z') },
    attachments: [{ data: png(30, 20, 2), type: 'png', pages: 1, footer: 'Allegato 1 — Dichiarazione\tUE\u0085 (p. {i}/{m})' }] });
  const doc = await PDFDocument.load(out);
  assert.equal(doc.getPageCount(), 2);
  assert.equal(doc.getTitle(), 'RT 26-001 — Impianto Via Roma');
  assert.equal(doc.getAuthor(), 'Ditta  Rossi', 'il carattere di controllo diventa uno spazio');
});
