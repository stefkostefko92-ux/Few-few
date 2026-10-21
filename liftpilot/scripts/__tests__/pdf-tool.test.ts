// report/pdf-tool.mjs through its typed side (src/lib/report/pdf-tool.ts → runPdfTool): inspect refuses what the
// fascicolo cannot carry (protected, XFA, a form that cannot be flattened, too many pages, a page too small or too
// large, unreadable bytes); assemble appends every page after the body — pages = B + Σ, landscape for what is wider
// than tall, the same bytes twice, no action or JavaScript left —; the upright matrices for /Rotate and EXIF; the body
// of relazione.py with its signatures, meta.extraPages and the fascicolo line, and without them the bytes of before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFString, StandardFonts, degrees } from 'pdf-lib';
import type { PdfBlock, ReportDoc } from '../../src/lib/report/model';

process.env.DATABASE_URL ??= 'postgresql://pdf-tool-test/none';
process.env.AUTH_SECRET ??= 'pdf-tool-test-secret-that-is-long-enough';
const { inspectFile, assembleFascicolo, appendedPages } = await import('../../src/lib/report/pdf-tool');
const { runPdfTool } = await import('../../src/lib/report/render');
const place: { uprightMatrix: (w: number, h: number, turn: number, mirror: boolean) => number[]; exifTurn: (o: number) => { turn: number; mirror: boolean } } =
  await import(new URL('../../report/pdf-place.mjs', import.meta.url).href);

const FONT = path.join(process.env.REPORT_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu', 'DejaVuSans.ttf');
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
const A4: [number, number] = [595.28, 841.89];
const MM = 72 / 25.4;

async function pdf(pages: [number, number][], build?: (doc: PDFDocument) => Promise<void> | void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  pages.forEach((size, i) => doc.addPage(size).drawText(`pagina ${i + 1}`, { x: 20, y: size[1] - 40, size: 14, font }));
  await build?.(doc);
  return doc.save();
}

/** A filled form with JavaScript on the field, on the page and at opening, and a link that launches a program. */
const hostileForm = (): Promise<Uint8Array> => pdf([A4, A4], (doc) => {
  const form = doc.getForm();
  const field = form.createTextField('costruttore');
  field.setText('Ascensori Rossi S.p.A.');
  field.addToPage(doc.getPage(0), { x: 40, y: 600, width: 300, height: 24 });
  const action = (js: string) => doc.context.register(doc.context.obj({ S: 'JavaScript', JS: PDFString.of(js) }));
  field.acroField.dict.set(PDFName.of('AA'), doc.context.obj({ K: action('1') }));
  doc.getPage(0).node.set(PDFName.of('AA'), doc.context.obj({ O: action('2') }));
  doc.catalog.set(PDFName.of('OpenAction'), action('3'));
  doc.getPage(1).node.addAnnot(doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [40, 400, 300, 420], A: { S: 'Launch', F: PDFString.of('calc.exe') } })));
});

/** An RGB PNG w × h, one colour, made here (signature, IHDR, IDAT, IEND). */
function png(w: number, h: number): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer): number => { let c = 0xffffffff; for (const x of b) c = (crcTable[(c ^ x) & 0xff] ?? 0) ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x80)]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array<Buffer>(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}

// 24 × 12 px, made once with Pillow (pdf-lib writes no JPEG)
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAMABgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDo9E8Gf2Tq0F9/aHneVu+TyducqR13H1rq6KKmMFFWRtXxFSvLmqO7CiiiqMT/2Q==', 'base64');

test('inspect: pagine di un PDF, di una foto; rifiuta protetti, XFA, moduli non appiattibili, troppe pagine, formati fuori misura, byte illeggibili', async () => {
  assert.deepEqual(await inspectFile(await hostileForm(), 'pdf'), { ok: true, pages: 2 });
  assert.deepEqual(await inspectFile(JPEG, 'jpeg'), { ok: true, pages: 1 });
  assert.deepEqual(await inspectFile(png(30, 20), 'png'), { ok: true, pages: 1 });
  const encrypted = await pdf([A4], (doc) => {
    doc.context.trailerInfo.Encrypt = doc.context.register(doc.context.obj({ Filter: 'Standard', V: 1, R: 2, P: -4, O: PDFString.of('o'), U: PDFString.of('u') }));
  });
  assert.deepEqual(await inspectFile(encrypted, 'pdf'), { ok: false, reason: 'encrypted' });
  const xfa = await pdf([A4], (doc) => { doc.catalog.set(PDFName.of('AcroForm'), doc.context.obj({ Fields: [], XFA: [PDFString.of('template')] })); });
  assert.deepEqual(await inspectFile(xfa, 'pdf'), { ok: false, reason: 'xfa' });
  // a field whose widget no page holds: pdf-lib cannot flatten it
  const orphan = await pdf([A4], (doc) => {
    const field = doc.getForm().createTextField('orfano');
    field.setText('x');
    field.addToPage(doc.getPage(0), { x: 10, y: 10, width: 50, height: 20 });
    const widget = field.acroField.getWidgets()[0];
    if (!widget) throw new Error('no widget');
    widget.dict.delete(PDFName.of('P'));
    doc.getPage(0).node.delete(PDFName.of('Annots'));
  });
  assert.deepEqual(await inspectFile(orphan, 'pdf'), { ok: false, reason: 'form' });
  assert.deepEqual(await inspectFile(await pdf(Array<[number, number]>(201).fill(A4)), 'pdf'), { ok: false, reason: 'pages' });
  assert.deepEqual(await inspectFile(await pdf([[40 * MM, 40 * MM]]), 'pdf'), { ok: false, reason: 'pageSize' });
  assert.deepEqual(await inspectFile(await pdf([[600 * MM, 1300 * MM]]), 'pdf'), { ok: false, reason: 'pageSize' });
  assert.deepEqual(await inspectFile(await pdf([[841 * MM, 1189 * MM]]), 'pdf'), { ok: true, pages: 1 });
  // 70 MiB of content in a few kilobytes: refused before pdf-lib inflates it
  const bomb = await pdf([A4], (doc) => {
    doc.getPage(0).node.set(PDFName.of('Contents'), doc.context.register(doc.context.stream(deflateSync(Buffer.alloc(70 << 20, 0x20)), { Filter: 'FlateDecode' })));
  });
  assert.ok(bomb.length < 1 << 20);
  assert.deepEqual(await inspectFile(bomb, 'pdf'), { ok: false, reason: 'invalid' });
  for (const [bytes, type] of [[Buffer.from('%PDF-1.7\nnot really\n%%EOF'), 'pdf'], [Buffer.from('not a jpeg'), 'jpeg'], [png(30, 20).subarray(0, 40), 'png']] as const) {
    const r = await inspectFile(bytes, type);
    assert.equal(r.ok, false, type);
    assert.equal(r.ok === false && r.reason, 'invalid', type);
  }
});

test('runPdfTool: nomi di file solo nostri, cartella privata rimossa anche dopo un errore', async () => {
  // a temporary directory of this test only: other runs of the suite may use the system one at the same time
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pdf-tool-test-')), saved = process.env.TMPDIR;
  process.env.TMPDIR = tmp;
  try {
    await assert.rejects(runPdfTool('inspect', { file: 'x.pdf', type: 'pdf' }, { '../x.pdf': new Uint8Array([1]) }), /refused/);
    await assert.rejects(runPdfTool('assemble', { body: 'body.pdf' }, { 'body.pdf': new Uint8Array([1]) }), /renderer failed \(1\)/);
    assert.ok((await inspectFile(JPEG, 'jpeg')).ok);
    assert.deepEqual(readdirSync(tmp), []);
  } finally {
    if (saved === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = saved;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('matrici: /Rotate e orientamento EXIF portano il contenuto dritto nel riquadro', () => {
  const apply = (m: number[], x: number, y: number): [number, number] => [(m[0] ?? 0) * x + (m[2] ?? 0) * y + (m[4] ?? 0), (m[1] ?? 0) * x + (m[3] ?? 0) * y + (m[5] ?? 0)];
  const [w, h] = [40, 30];
  // where the stored picture's top-left corner (0, h) is shown, for each EXIF orientation (exiftool's descriptions)
  const topLeftTo: Record<number, 'TL' | 'TR' | 'BL' | 'BR'> = { 1: 'TL', 2: 'TR', 3: 'BR', 4: 'BL', 5: 'TL', 6: 'TR', 7: 'BR', 8: 'BL' };
  for (let o = 1; o <= 8; o++) {
    const { turn, mirror } = place.exifTurn(o);
    const m = place.uprightMatrix(w, h, turn, mirror);
    const [W, H] = turn % 180 === 0 ? [w, h] : [h, w];
    const corners = [apply(m, 0, 0), apply(m, w, 0), apply(m, 0, h), apply(m, w, h)];
    assert.deepEqual(corners.map(([x]) => x).sort((a, b) => a - b), [0, 0, W, W], `x ${o}`);
    assert.deepEqual(corners.map(([, y]) => y).sort((a, b) => a - b), [0, 0, H, H], `y ${o}`);
    const [x, y] = apply(m, 0, h);
    assert.equal(`${y === H ? 'T' : 'B'}${x === 0 ? 'L' : 'R'}`, topLeftTo[o], `orientamento ${o}`);
  }
  // /Rotate 90: the page turns clockwise, its top-left corner goes to the top right
  assert.deepEqual(apply(place.uprightMatrix(w, h, 90, false), 0, h), [h, w]);
  assert.deepEqual(place.exifTurn(0), { turn: 0, mirror: false });
});

test('assemble: corpo + ogni pagina degli allegati, orizzontale se più larga, stessi byte due volte, niente azioni', async (t) => {
  if (!existsSync(FONT)) { t.skip('DejaVu Sans non disponibile'); return; }
  const body = await pdf([A4, A4]);
  const a3 = await pdf([[420 * MM, 297 * MM]]);
  const turned = await pdf([A4], (doc) => { doc.getPage(0).setRotation(degrees(90)); });
  const attachments = [
    { data: await hostileForm(), type: 'pdf' as const, pages: 2, footer: 'Allegato 1 — Dichiarazione UE (p. {i}/{m})' },
    { data: a3, type: 'pdf' as const, pages: 1, footer: 'Allegato 2 — Schema elettrico (p. {i}/{m})' },
    { data: turned, type: 'pdf' as const, pages: 1, footer: 'Allegato 3 — Pagina ruotata (p. {i}/{m})' },
    { data: JPEG, type: 'jpeg' as const, pages: 1, orientation: 6, footer: 'Allegato 4 — Foto (p. {i}/{m})' },
    { data: png(300, 100), type: 'png' as const, pages: 1, footer: 'Allegato 5 — Schema (p. {i}/{m})' },
  ];
  const input = { body, header: 'LiftPilot · Relazione tecnica di modifica RT 26-004 R0 · Prova', code: 'RT 26-004 R0', notice: 'Valida solo con le firme in calce',
    info: { title: 'RT 26-004 R0', author: 'Prova', subject: 'Relazione tecnica di modifica', created: new Date('2026-10-21T08:00:00Z') }, attachments };
  const a = await assembleFascicolo(input), b = await assembleFascicolo(input);
  assert.equal(sha(a), sha(b), 'deterministico');
  const out = await PDFDocument.load(a);
  assert.equal(appendedPages(attachments), 6);
  assert.equal(out.getPageCount(), 2 + 6);
  const sizes = out.getPages().map((p) => (p.getWidth() > p.getHeight() ? 'L' : 'P')).join('');
  // body, the form's 2 pages, A3 landscape, the page turned 90° (landscape), the photo turned 90° (portrait), the wide PNG
  assert.equal(sizes, 'PPPPLLPL');
  assert.equal(out.getForm().getFields().length, 0, 'modulo appiattito');
  const text = Buffer.from(a).toString('latin1');
  for (const token of ['/JavaScript', '/JS', '/OpenAction', '/AA', '/Launch', '/AcroForm']) {
    assert.ok(!new RegExp(`${token}(?![A-Za-z0-9+])`).test(text), `${token} nel PDF`);
  }
  assert.ok(!/\/Annots \[ [^\]]/.test(text), 'nessuna annotazione');
  assert.equal(out.getTitle(), 'RT 26-004 R0');
  assert.equal(out.getCreationDate()?.toISOString(), '2026-10-21T08:00:00.000Z');
  // the pages declared at upload must be the file's
  const [form] = attachments;
  if (form) await assert.rejects(assembleFascicolo({ ...input, attachments: [{ ...form, pages: 3 }] }), /renderer failed/);
});

test('relazione.py: firme, meta.extraPages e riga del fascicolo; senza, gli stessi byte di prima', (t) => {
  const python = process.env.PYTHON_BIN ?? 'python3';
  if (spawnSync(python, ['-c', 'import reportlab'], { encoding: 'utf8' }).status !== 0) { t.skip('python3 con reportlab non disponibile'); return; }
  const render = (doc: ReportDoc<PdfBlock>): Buffer => {
    const r = spawnSync(python, [path.join(process.cwd(), 'report', 'relazione.py')], {
      input: JSON.stringify({ ...doc, meta: { ...doc.meta, created: '2026-10-21T08:00:00Z' } }), maxBuffer: 1 << 26,
      env: { ...process.env, REPORT_FONT_DIR: process.env.REPORT_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu' },
    });
    assert.equal(r.status, 0, r.stderr?.toString());
    return r.stdout;
  };
  const meta = { title: 'Prova', subject: 'Prova', author: 'Prova', header: 'LiftPilot · Prova', footer: 'Prova', code: 'RT —' };
  const blocks: ReportDoc['blocks'] = [{ t: 'h1', text: 'Relazione tecnica di modifica' }, { t: 'p', text: 'Testo.' }];
  const plain = render({ meta, blocks });
  assert.equal(sha(render({ meta: { ...meta, extraPages: 0 }, blocks })), sha(plain), 'extraPages 0 = come prima');
  assert.notEqual(sha(render({ meta: { ...meta, extraPages: 3 }, blocks })), sha(plain), 'il totale conta gli allegati');
  assert.notEqual(sha(render({ meta: { ...meta, fascicolo: 'Fascicolo di {N} pagine' }, blocks })), sha(plain), 'la riga del fascicolo');
  const firme: PdfBlock = { t: 'firme', cols: [
    { title: 'Redatto da', lines: ['Mario Rossi', 'Data ________'], box: { label: 'Firma', w: 70, h: 28 } },
    { title: 'Verificato da', lines: ['Ing. Giulia Bianchi', 'Ordine degli Ingegneri della Provincia di MI, n. 12345'], box: { label: 'Timbro e firma', w: 45, h: 45 } },
  ] };
  const signed = render({ meta: { ...meta, extraPages: 2, fascicolo: 'Fascicolo di {N} pagine: relazione {B}, allegati {A}' }, blocks: [...blocks, firme] });
  assert.equal(signed.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(signed.length > plain.length);
  // the list bullet: in DejaVu in a document with signatures (the RT), in Helvetica as before in the others (S9)
  const list: PdfBlock = { t: 'list', items: ['uno', 'due'] };
  assert.ok(textFonts(render({ meta, blocks: [list] })).includes('Helvetica'), 'i documenti di prima: stessi byte, punto in Helvetica');
  assert.deepEqual(textFonts(render({ meta, blocks: [list, firme] })).filter((f) => !f.includes('DejaVu')), [], 'la relazione tecnica: solo DejaVu');
});

/** The base fonts a ReportLab PDF shows text with: each page stream (Flate, or ASCII85 then Flate) read for the font of
 *  every BT…ET that draws a string. */
function textFonts(pdfBytes: Buffer): string[] {
  const s = pdfBytes.toString('latin1'), base = new Map<string, string>();
  for (const [, name, obj] of s.matchAll(/\/(F\d+(?:\+\d+)?) (\d+) 0 R/g)) {
    const m = new RegExp(`\\n${obj} 0 obj\\s*<<[^]*?/BaseFont /([A-Za-z+-]+)`).exec(s);
    if (name && m?.[1]) base.set(name, m[1]);
  }
  const a85 = (t: string): Buffer => {
    const out: number[] = [], c = t.replace(/\s/g, '').replace(/~>$/, '');
    for (let i = 0; i < c.length;) {
      if (c[i] === 'z') { out.push(0, 0, 0, 0); i++; continue; }
      const g = c.slice(i, i + 5); i += 5;
      const v = [...g.padEnd(5, 'u')].reduce((n, ch) => n * 85 + ch.charCodeAt(0) - 33, 0);
      out.push(...[2 ** 24, 2 ** 16, 2 ** 8, 1].map((d) => Math.floor(v / d) % 256).slice(0, g.length - 1));
    }
    return Buffer.from(out);
  };
  const used = new Set<string>();
  for (const m of s.matchAll(/\/Length (\d+)\s*>>\s*stream\r?\n/g)) {
    const raw = pdfBytes.subarray((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + Number(m[1]));
    let text: string;
    try { text = inflateSync(raw[0] === 0x78 ? raw : a85(raw.toString('latin1'))).toString('latin1'); } catch { continue; }
    for (const [, bt] of text.matchAll(/BT([^]*?)ET/g)) {
      const f = /\/(F\d+(?:\+\d+)?) [\d.]+ Tf/.exec(bt ?? '')?.[1];
      if (f && /T[jJ]/.test(bt ?? '')) used.add(base.get(f) ?? f);
    }
  }
  return [...used];
}
