// A HEIC upload recognised and measured from its boxes before anything decodes it (round 50, src/lib/allegati/heic.ts):
// the brands of a HEIF file; the primary image among the top-level ones in libheif's order (by item id, thumbnails,
// auxiliary and hidden items left out); every `ispe` of the file within 40 megapixels and 12 000 px a side (a forged
// `ispe` refused before decoding, an item's or none's); AVIF, and an item of another codec beside a HEVC primary unless
// hidden, refused as another type; a box running past its parent,
// a missing `pitm` or `iinf`, a primary that is not a top-level image refused as malformed. The fixtures are made here
// (fixtures/schizzi/README.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HEIC_MAX_IMAGES, isHeif, sniffHeic } from '@/lib/allegati/heic';
import { magicType } from '@/lib/allegati/sniff';

const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(new URL(`./fixtures/schizzi/${name}`, import.meta.url)));
const SCHIZZO = fixture('schizzo.heic'), DUE = fixture('due-immagini.heic');

const u32 = (b: Uint8Array, i: number): number => ((b[i] ?? 0) << 24 >>> 0) + (((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0));
const put32 = (b: Uint8Array, i: number, v: number): void => { b[i] = v >>> 24; b[i + 1] = (v >>> 16) & 0xff; b[i + 2] = (v >>> 8) & 0xff; b[i + 3] = v & 0xff; };
const find = (b: Uint8Array, type: string, from = 0): number => {
  const t = Buffer.from(type, 'latin1');
  return Buffer.from(b).indexOf(t, from) - 4;
};

test('heic: i file veri — un’immagine con miniatura ed EXIF; due immagini con la principale seconda', () => {
  assert.equal(magicType(SCHIZZO), null, 'not a type the product stores');
  assert.ok(isHeif(SCHIZZO) && isHeif(DUE));
  // the primary's coded size (96 × 64: the rotation is applied by the decoder), one top-level image (the thumbnail is not)
  assert.deepEqual(sniffHeic(SCHIZZO), { ok: true, width: 96, height: 64, images: 1, primary: 0 });
  // two top-level images, the primary is item 2: the second heif-convert writes (coded 64 × 64, cropped to 40 × 30)
  assert.deepEqual(sniffHeic(DUE), { ok: true, width: 64, height: 64, images: 2, primary: 1 });
});

test('heic: non HEIF → null (PDF, JPEG, PNG e un MP4 restano agli altri controlli)', () => {
  assert.equal(sniffHeic(new Uint8Array(Buffer.from('%PDF-1.7\n%%EOF\n'))), null);
  assert.equal(sniffHeic(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16])), null);
  const mp4 = Uint8Array.from(SCHIZZO);
  mp4.set(Buffer.from('isom'), 8);
  mp4.set(Buffer.from('isomiso2'), 16);
  mp4.set(Buffer.from('mp41'), 24);
  assert.equal(sniffHeic(mp4), null, 'an ISO media file without a HEIF brand');
  // the brand only among the compatible ones is enough (an iPhone writes heic as the major brand, others mif1)
  const compat = Uint8Array.from(SCHIZZO);
  compat.set(Buffer.from('xxxx'), 8);
  assert.equal(sniffHeic(compat)?.ok, true);
});

test('heic: un ispe oltre 12 000 px o 40 megapixel è rifiutato prima di decodificare (anche di una miniatura)', () => {
  const ispe = find(SCHIZZO, 'ispe');
  for (const [w, h] of [[12_001, 100], [100, 12_001], [7000, 6000], [0, 64]] as const) {
    const big = Uint8Array.from(SCHIZZO);
    put32(big, ispe + 12, w);
    put32(big, ispe + 16, h);
    assert.deepEqual(sniffHeic(big), { ok: false, reason: 'dimensions' }, `${w}×${h}`);
  }
  // the thumbnail's own ispe (the second one) is checked too
  const second = find(SCHIZZO, 'ispe', ispe + 8);
  assert.ok(second > ispe);
  const thumb = Uint8Array.from(SCHIZZO);
  put32(thumb, second + 12, 20_000);
  assert.deepEqual(sniffHeic(thumb), { ok: false, reason: 'dimensions' });
  // at the limits: 12 000 px a side within 40 megapixels passes
  const edge = Uint8Array.from(SCHIZZO);
  put32(edge, ispe + 12, 12_000);
  put32(edge, ispe + 16, 3333);
  assert.equal(sniffHeic(edge)?.ok, true);
});

test('heic: struttura — un box oltre il suo contenitore, pitm o iinf mancanti, la principale nascosta', () => {
  const cut = SCHIZZO.subarray(0, 300);
  assert.deepEqual(sniffHeic(cut), { ok: false, reason: 'structure' }, 'cut short inside meta');
  const long = Uint8Array.from(SCHIZZO);
  const meta = find(long, 'meta');
  put32(long, meta, u32(long, meta) + 4096);
  assert.deepEqual(sniffHeic(long), { ok: false, reason: 'structure' }, 'meta past the end');
  for (const box of ['pitm', 'iinf', 'ipma']) {
    const gone = Uint8Array.from(SCHIZZO);
    gone.set(Buffer.from('free'), find(gone, box) + 4);
    assert.deepEqual(sniffHeic(gone), { ok: false, reason: 'structure' }, box);
  }
  // the primary item hidden (flags bit 0 of its infe): libheif has no primary to decode
  const hidden = Uint8Array.from(SCHIZZO);
  const infe = find(hidden, 'infe');
  hidden[infe + 11] = 1;
  assert.deepEqual(sniffHeic(hidden), { ok: false, reason: 'structure' });
  // the primary pointing at the EXIF item (not an image)
  const exif = Uint8Array.from(SCHIZZO);
  exif[find(exif, 'pitm') + 13] = 2;
  assert.deepEqual(sniffHeic(exif), { ok: false, reason: 'structure' });
});

test('heic: AVIF e altri codec → tipo non accettato', () => {
  const avif = Uint8Array.from(SCHIZZO);
  let at = find(avif, 'infe');
  while (at >= 0) {
    if (Buffer.from(avif.subarray(at + 16, at + 20)).toString('latin1') === 'hvc1') avif.set(Buffer.from('av01'), at + 16);
    at = find(avif, 'infe', at + 8);
  }
  assert.deepEqual(sniffHeic(avif), { ok: false, reason: 'type' });
});

// A HEIF file made box by box: ftyp heic/mif1, meta with pitm, iinf (infe v2) and iprp (an ispe per item, `extra` ispe
// properties tied to no item)
const cat = (parts: Uint8Array[]): Uint8Array => new Uint8Array(Buffer.concat(parts));
const n16 = (v: number): Uint8Array => Uint8Array.of(v >> 8, v & 0xff);
const n32 = (v: number): Uint8Array => { const b = new Uint8Array(4); put32(b, 0, v); return b; };
const box = (type: string, ...parts: Uint8Array[]): Uint8Array => { const body = cat(parts); return cat([n32(8 + body.length), Buffer.from(type, 'latin1'), body]); };
const full = (type: string, flags: number, ...parts: Uint8Array[]): Uint8Array => box(type, Uint8Array.of(type === 'infe' ? 2 : 0, 0, 0, flags), ...parts);
interface ItemSpec { id: number; type: string; hidden?: boolean; w: number; h: number }
function heif(items: ItemSpec[], primary: number, extra: [number, number][] = []): Uint8Array {
  const ftyp = box('ftyp', Buffer.from('heic'), n32(0), Buffer.from('mif1'), Buffer.from('heic'));
  const iinf = full('iinf', 0, n16(items.length), ...items.map((x) => full('infe', x.hidden ? 1 : 0, n16(x.id), n16(0), Buffer.from(x.type, 'latin1'), Uint8Array.of(0))));
  const ispe = [...items.map((x): [number, number] => [x.w, x.h]), ...extra].map(([w, h]) => full('ispe', 0, n32(w), n32(h)));
  const ipma = full('ipma', 0, n32(items.length), ...items.map((x, i) => cat([n16(x.id), Uint8Array.of(1, 0x80 | (i + 1))])));
  const meta = full('meta', 0, full('hdlr', 0, n32(0), Buffer.from('pict'), new Uint8Array(13)), full('pitm', 0, n16(primary)), iinf, box('iprp', box('ipco', ...ispe), ipma));
  return cat([ftyp, meta]);
}

test('heic: un’immagine di un altro codec accanto a una HEVC principale → tipo; ogni ispe del file entro i limiti', () => {
  const hevc: ItemSpec = { id: 1, type: 'hvc1', w: 100, h: 100 };
  assert.deepEqual(sniffHeic(heif([hevc], 1)), { ok: true, width: 100, height: 100, images: 1, primary: 0 }, 'the builder makes a HEIC');
  // the probe of the review: an AV1 item of 60 000 × 60 000 next to the HEVC primary, not hidden — libheif decodes it as a
  // top-level image before the count check refuses the file
  assert.deepEqual(sniffHeic(heif([hevc, { id: 2, type: 'av01', w: 60_000, h: 60_000 }], 1)), { ok: false, reason: 'type' });
  assert.deepEqual(sniffHeic(heif([hevc, { id: 2, type: 'jpeg', w: 50, h: 50 }], 1)), { ok: false, reason: 'type' }, 'a small JPEG item too');
  // hidden, it is not decoded on its own: taken, but its size still counts
  assert.deepEqual(sniffHeic(heif([hevc, { id: 2, type: 'av01', hidden: true, w: 50, h: 50 }], 1))?.ok, true);
  assert.deepEqual(sniffHeic(heif([hevc, { id: 2, type: 'av01', hidden: true, w: 60_000, h: 60_000 }], 1)), { ok: false, reason: 'dimensions' });
  // an ispe tied to no item is checked as well
  assert.deepEqual(sniffHeic(heif([hevc], 1, [[20_000, 10]])), { ok: false, reason: 'dimensions' });
  assert.equal(sniffHeic(heif([hevc], 1, [[12_000, 3333]]))?.ok, true);
});

test(`heic: più di ${HEIC_MAX_IMAGES} immagini di primo livello (una raffica) → rifiutato`, () => {
  assert.equal(HEIC_MAX_IMAGES, 4);
  assert.deepEqual(sniffHeic(fixture('cinque-immagini.heic')), { ok: false, reason: 'structure' });
});
