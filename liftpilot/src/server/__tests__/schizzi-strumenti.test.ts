// The image tools of the survey sketches (round 50, src/lib/report/image-tool.ts) with the real programs — heif-convert
// (libheif-examples), pdftoppm (poppler-utils), Pillow (report/schizzo.py) — and the upload of a HEIC through the real
// route over the in-memory database: the primary image as a JPEG, upright (libheif's rotation applied, so stored without
// an orientation), its metadata gone (an EXIF with a GPS-like text and a name); the second of two top-level images when
// it is the primary; a burst or a forged size refused before decoding; the previews made by us (turned, scaled, a PDF's
// page as a PNG), the pictures for the model (JPEG within 2576 px and 3.75 megapixels, a PDF's first four pages).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BASE, as, reset, state } from './allegati-db';
import { JPEG, includes, pdf, png } from '../../lib/__tests__/allegati-fixtures';

const { heicToJpeg, modelImages, previewOf, ImageToolError, MODEL_PIXELS } = await import('../../lib/report/image-tool');
const { sniffHeic } = await import('../../lib/allegati/heic');
const { sniff } = await import('../../lib/allegati/sniff');
const { POST } = await import('../../app/api/projects/[id]/allegati/route');

const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(new URL(`../../lib/__tests__/fixtures/schizzi/${name}`, import.meta.url)));
const SCHIZZO = fixture('schizzo.heic'), DUE = fixture('due-immagini.heic'), CINQUE = fixture('cinque-immagini.heic');
const dir = mkdtempSync(path.join(os.tmpdir(), 'schizzi-test-'));

/** A picture's size by its header (sniff), and one pixel decoded by Pillow. */
function size(b: Uint8Array): [string, number, number] {
  const s = sniff(b);
  if (!s.ok || s.type === 'pdf') return assert.fail('a picture');
  return [s.type, s.width, s.height];
}
function pixel(b: Uint8Array, x: number, y: number): number[] {
  const f = path.join(dir, `px-${Math.random().toString(36).slice(2)}.img`);
  writeFileSync(f, b);
  const out = execFileSync('python3', ['-I', '-c', 'import sys; from PIL import Image; print(list(Image.open(sys.argv[1]).convert("RGB").getpixel((int(sys.argv[2]), int(sys.argv[3])))))', f, String(x), String(y)]);
  return JSON.parse(out.toString()) as number[];
}
const near = (a: number[], b: number[]): boolean => a.every((v, i) => Math.abs(v - (b[i] ?? 0)) < 40);
const stored = (data: Uint8Array, type: 'pdf' | 'jpeg' | 'png', orientation: number | null = null) => ({ load: async () => data, type, orientation });

test('heif-convert: l’immagine principale in JPEG, girata, con l’EXIF che prepareFile poi toglie', async () => {
  const info = sniffHeic(SCHIZZO);
  assert.ok(info?.ok);
  const jpeg = await heicToJpeg(SCHIZZO, info);
  assert.deepEqual(size(jpeg), ['jpeg', 64, 96], 'the irot of 270° applied');
  // libheif writes the EXIF into the JPEG (orientation reset to 1): the upload's strip removes it (below)
  assert.ok(includes(jpeg, 'Mario Rossi'));
  // two top-level images, the primary the second: the blue one
  const due = sniffHeic(DUE);
  assert.ok(due?.ok);
  const blue = await heicToJpeg(DUE, due);
  assert.deepEqual(size(blue).slice(1), [40, 30]);
  assert.ok(near(pixel(blue, 20, 15), [30, 30, 220]), 'the primary (blue), not the first (red)');
  // a count that differs from what the boxes said refuses the file
  await assert.rejects(heicToJpeg(DUE, { ...due, images: 1 }), ImageToolError);
});

test('anteprima: JPEG girato secondo l’orientamento, PNG ridotto a 1600 px, pagina di un PDF in PNG', async () => {
  const j = await previewOf(stored(JPEG, 'jpeg', 6), 1);
  assert.equal(j.mime, 'image/jpeg');
  assert.deepEqual(size(j.bytes), ['jpeg', 12, 24], '24 × 12 turned upright');
  const p = await previewOf(stored(png(3200, 40), 'png'), 1);
  assert.equal(p.mime, 'image/png');
  assert.deepEqual(size(p.bytes), ['png', 1600, 20]);
  const doc = await pdf(3);
  const page = await previewOf(stored(doc, 'pdf'), 2);
  assert.equal(page.mime, 'image/png');
  const [, w, h] = size(page.bytes);
  assert.equal(Math.max(w, h), 1600);
  assert.ok(h > w, 'an A4 page standing');
  await assert.rejects(previewOf(stored(doc, 'pdf'), 4), 'no fourth page');
});

test('modello: un PDF dà le prime quattro pagine in JPEG entro 2576 px e 3,75 MP; un PNG trasparente su bianco', async () => {
  const pics = await modelImages(stored(await pdf(6), 'pdf'), 6);
  assert.equal(pics.length, 4);
  for (const b of pics) {
    const [type, w, h] = size(b);
    assert.equal(type, 'jpeg');
    assert.ok(Math.max(w, h) <= 2576 && w * h <= MODEL_PIXELS, `${w}×${h}`);
  }
  // an RGBA PNG all transparent: white once flattened
  const rgba = path.join(dir, 'alpha.png');
  execFileSync('python3', ['-I', '-c', 'import sys; from PIL import Image; Image.new("RGBA", (50, 40), (0, 0, 0, 0)).save(sys.argv[1])', rgba]);
  const [white] = await modelImages(stored(new Uint8Array(readFileSync(rgba)), 'png'), 1);
  assert.ok(white);
  assert.deepEqual(size(white), ['jpeg', 50, 40]);
  assert.ok(near(pixel(white, 10, 10), [255, 255, 255]));
  const [turned] = await modelImages(stored(JPEG, 'jpeg', 8), 1);
  assert.ok(turned);
  assert.deepEqual(size(turned).slice(1), [12, 24]);
});

// --- the upload route ---------------------------------------------------------------------------------------------------

const OWN = { origin: BASE, host: 'liftpilot.example', 'sec-fetch-site': 'same-origin' };
async function upload(file: Uint8Array, name: string, fields: Record<string, string>) {
  const fd = new FormData();
  fd.set('file', new File([Buffer.from(file)], name, { type: 'image/heic' }));
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const res = await POST(new Request(`${BASE}/api/projects/p1/allegati`, { method: 'POST', headers: OWN, body: fd }), { params: Promise.resolve({ id: 'p1' }) });
  return { status: res.status, body: (await res.json()) as { ok: boolean; error?: string; duplicate?: boolean; attachment?: { id: string; kind: string; mime: string; width: number; height: number; component: string | null } } };
}

test('caricamento: un HEIC diventa il JPEG della sua immagine principale, dritto e senza metadati', async () => {
  reset();
  as('TECHNICIAN');
  const r = await upload(SCHIZZO, 'IMG_0042.HEIC', { kind: 'SCHIZZO', component: 'vano' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual([r.body.attachment?.kind, r.body.attachment?.mime, r.body.attachment?.width, r.body.attachment?.height, r.body.attachment?.component],
    ['SCHIZZO', 'image/jpeg', 64, 96, 'vano']);
  const row = state.files[0];
  assert.ok(row);
  assert.deepEqual([row.mime, row.orientation, row.pages], ['image/jpeg', null, 1]);
  assert.ok(!includes(row.data, 'Mario Rossi') && !includes(row.data, 'Exif') && !includes(row.data, 'GPS-45'), 'the EXIF removed');
  assert.deepEqual(size(row.data), ['jpeg', 64, 96]);
  // the activity log: the kind, never the name
  assert.equal(state.audits.length, 1);
  assert.ok(!JSON.stringify(state.audits).includes('IMG_0042'));
  // the same HEIC again: the same JPEG, the row already there
  const again = await upload(SCHIZZO, 'copia.heic', { kind: 'FOTO' });
  assert.deepEqual([again.status, again.body.duplicate, again.body.attachment?.kind], [200, true, 'SCHIZZO']);
  // the primary of two: the blue one, for the machine room
  const due = await upload(DUE, 'due.heic', { kind: 'SCHIZZO', component: 'locale' });
  assert.equal(due.status, 201);
  const blue = state.files.find((f) => f.id === due.body.attachment?.id);
  assert.ok(blue && near(pixel(blue.data, 20, 15), [30, 30, 220]));
});

test('caricamento: HEIC rifiutati prima di decodificarli — raffica, dimensioni false, file tronco, AVIF', async () => {
  reset();
  as('ENGINEER');
  const forged = Uint8Array.from(SCHIZZO);
  const ispe = Buffer.from(forged).indexOf(Buffer.from('ispe')) - 4;
  forged.set([0, 0, 0x4e, 0x20], ispe + 12); // 20 000 px wide
  for (const [name, bytes] of [['raffica', CINQUE], ['ispe', forged], ['tronco', SCHIZZO.subarray(0, 400)]] as const) {
    const r = await upload(bytes, `${name}.heic`, { kind: 'SCHIZZO' });
    assert.deepEqual([r.status, r.body], [415, { ok: false, error: 'fileInvalid' }], name);
  }
  // the mdat cut: the boxes are whole, the decoder fails in its child process
  const noData = Uint8Array.from(SCHIZZO.subarray(0, SCHIZZO.length - 200));
  const mdat = Buffer.from(noData).indexOf(Buffer.from('mdat')) - 4;
  noData.set([0, 0, 0, 0], mdat); // size 0: to the end of the file
  const r = await upload(noData, 'rotto.heic', { kind: 'SCHIZZO' });
  assert.deepEqual([r.status, r.body.error], [415, 'fileInvalid']);
  assert.equal(state.files.length, 0);
});
