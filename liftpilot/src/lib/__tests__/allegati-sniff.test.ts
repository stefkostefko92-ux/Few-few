// What an uploaded file is, by its bytes only (src/lib/allegati/sniff.ts, plan §6.1 and §11.7): a PDF from byte 0 to a
// clean «%%EOF», a JPEG walked to its end with one frame, a PNG chunk by chunk with its CRCs; the size of a picture from
// its header, never decoded (≤ 40 MP, ≤ 12 000 px a side); everything else — a renamed program, a page, a
// file cut short, a polyglot, a JPEG with two frames, a forged header — refused. No input makes the reader throw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exifOrientation, magicType, pdfComplete, sniff } from '@/lib/allegati/sniff';
import { ALLEGATI_LIMITS } from '@/lib/allegati/limits';
import { JPEG, PNG_SIGNATURE, cat, chunk, exif, idat, ihdr, jpegSized, pdf, phoneJpeg, png, segment, withSegments } from './allegati-fixtures';

const bytes = (s: string): Uint8Array => Uint8Array.from(Buffer.from(s, 'latin1'));

test('PDF: intestazione al byte 0 (1.x o 2.0) e «%%EOF» alla fine; altrimenti rifiutato', async () => {
  const doc = await pdf(2);
  assert.deepEqual(sniff(doc), { ok: true, type: 'pdf' });
  assert.deepEqual(sniff(await pdf(1, '2.0')), { ok: true, type: 'pdf' });
  assert.deepEqual(sniff(cat(doc, bytes('\r\n\0\0  '))), { ok: true, type: 'pdf' }, 'line ends and padding after %%EOF');
  // «%PDF» not at the first byte: a page or a picture that holds a PDF further on
  assert.deepEqual(sniff(cat(bytes('\n'), doc)), { ok: false, reason: 'type' });
  assert.deepEqual(sniff(cat(bytes('<html><body>'), doc)), { ok: false, reason: 'type' });
  assert.deepEqual(sniff(bytes('%PDF-3.0\n%%EOF')), { ok: false, reason: 'type' });
  // cut short: no «%%EOF» at the end
  assert.deepEqual(sniff(doc.subarray(0, doc.length - 200)), { ok: false, reason: 'structure' });
  // a polyglot: the PDF with a JPEG glued after it (it opens as a PDF here and as a picture elsewhere)
  assert.deepEqual(sniff(cat(doc, JPEG)), { ok: false, reason: 'structure' });
  // «%%EOF» more than a KiB before the end
  assert.deepEqual(sniff(cat(doc, new Uint8Array(ALLEGATI_LIMITS.pdfTailBytes + 10).fill(0x41))), { ok: false, reason: 'structure' });
  assert.equal(pdfComplete(bytes('%PDF-1.4\n%%EOF')), true);
});

test('tipi che non si accettano: programma rinominato, pagina, SVG, ZIP, GIF, vuoto', () => {
  for (const [name, b] of [['exe', bytes('MZ\x90\0\x03\0\0\0\x04\0\0\0PE\0\0')], ['html', bytes('<!doctype html><script>alert(1)</script>')],
    ['svg', bytes('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')], ['zip', bytes('PK\x03\x04docx')], ['gif', bytes('GIF89a\x01\0\x01\0')],
    ['vuoto', new Uint8Array(0)], ['un byte', Uint8Array.from([0xff])]] as const) {
    assert.deepEqual(sniff(b), { ok: false, reason: 'type' }, name);
    assert.equal(magicType(b), null, name);
  }
});

test('JPEG: dimensioni dall’intestazione, orientamento EXIF (II e MM), un solo fotogramma', () => {
  const j = sniff(JPEG);
  assert.ok(j.ok && j.type === 'jpeg');
  assert.deepEqual([j.width, j.height, j.orientation], [24, 12, null]);
  for (const o of [1, 3, 6, 8]) {
    for (const order of ['II', 'MM'] as const) {
      const r = sniff(withSegments(JPEG, segment(0xe1, exif(o, order))));
      assert.ok(r.ok && r.type === 'jpeg' && r.orientation === o, `${order} ${o}`);
    }
  }
  const phone = sniff(phoneJpeg());
  assert.ok(phone.ok && phone.type === 'jpeg' && phone.orientation === 6);
  // an orientation out of 1..8 is no orientation; an APP1 that is not EXIF neither
  const nine = sniff(withSegments(JPEG, segment(0xe1, exif(9))));
  assert.ok(nine.ok && nine.type === 'jpeg' && nine.orientation === null);
  assert.equal(exifOrientation(bytes('XMP...'), 0, 6), null);
});

test('JPEG rifiutati: troncato, due fotogrammi, scansione senza fotogramma, segmento oltre la fine, byte al posto di un marcatore', () => {
  assert.deepEqual(sniff(JPEG.subarray(0, JPEG.length - 2)), { ok: false, reason: 'structure' }, 'no EOI');
  assert.deepEqual(sniff(JPEG.subarray(0, 300)), { ok: false, reason: 'structure' }, 'cut in the tables');
  // a second frame header before the scan: one picture for this reader, another for a decoder
  const sof = JPEG.subarray(Buffer.from(JPEG).indexOf(Buffer.from([0xff, 0xc0])), Buffer.from(JPEG).indexOf(Buffer.from([0xff, 0xc0])) + 19);
  assert.deepEqual(sniff(withSegments(JPEG, sof)), { ok: false, reason: 'structure' }, 'two frames');
  // a frame marker inside the coded data
  const sos = Buffer.from(JPEG).indexOf(Buffer.from([0xff, 0xda]));
  assert.deepEqual(sniff(cat(JPEG.subarray(0, sos + 16), Uint8Array.from([0xff, 0xc2, 0, 8, 8, 0, 1, 0, 1, 1]), JPEG.subarray(sos + 16))), { ok: false, reason: 'structure' });
  // a scan before any frame
  const noFrame = cat(JPEG.subarray(0, 20), JPEG.subarray(sos));
  assert.deepEqual(sniff(noFrame), { ok: false, reason: 'structure' });
  // a segment longer than the file, a non-marker byte between segments, a second SOI, a frame of zero size
  assert.deepEqual(sniff(cat(JPEG.subarray(0, 20), Uint8Array.from([0xff, 0xe1, 0xff, 0xf0]), JPEG.subarray(20))), { ok: false, reason: 'structure' });
  assert.deepEqual(sniff(cat(JPEG.subarray(0, 20), Uint8Array.from([0x00]), JPEG.subarray(20))), { ok: false, reason: 'structure' });
  assert.deepEqual(sniff(cat(JPEG.subarray(0, 20), Uint8Array.from([0xff, 0xd8]), JPEG.subarray(20))), { ok: false, reason: 'structure' });
  assert.deepEqual(sniff(jpegSized(0, 12)), { ok: false, reason: 'structure' });
});

test('JPEG: ciò che segue la fine dell’immagine (seconda immagine del telefono, dati incollati) non ne fa parte', () => {
  const two = cat(JPEG, JPEG, bytes('%PDF-1.7 trailing'));
  const r = sniff(two);
  assert.ok(r.ok && r.type === 'jpeg');
  assert.equal(r.pieces.at(-1)?.end, JPEG.length, 'the picture ends at its own EOI');
});

test('dimensioni delle immagini dall’intestazione: 40 MP, 12 000 px per lato', () => {
  assert.deepEqual(sniff(jpegSized(10_000, 5_000)), { ok: false, reason: 'dimensions' }, 'JPEG 50 MP in a few hundred bytes');
  assert.deepEqual(sniff(jpegSized(12_001, 100)), { ok: false, reason: 'dimensions' });
  assert.equal(sniff(jpegSized(8_000, 5_000)).ok, true, '40 MP exactly');
  assert.equal(sniff(jpegSized(12_000, 16)).ok, true);
  const big = cat(PNG_SIGNATURE, ihdr(10_000, 5_000), idat(1, 1), chunk('IEND', new Uint8Array(0)));
  assert.deepEqual(sniff(big), { ok: false, reason: 'dimensions' }, 'PNG 50 MP: the header says it, nothing is decoded');
  const tall = cat(PNG_SIGNATURE, ihdr(1, 12_001), idat(1, 1), chunk('IEND', new Uint8Array(0)));
  assert.deepEqual(sniff(tall), { ok: false, reason: 'dimensions' });
});

test('PNG: IHDR per primo, ogni blocco con il suo CRC, IDAT, IEND; i blocchi critici sconosciuti rifiutati', () => {
  const p = sniff(png(30, 20));
  assert.ok(p.ok && p.type === 'png' && p.width === 30 && p.height === 20);
  assert.deepEqual(p.chunks.map((c) => c.type), ['IHDR', 'IDAT', 'IEND']);
  const end = chunk('IEND', new Uint8Array(0));
  for (const [name, b] of [
    ['CRC errato', cat(PNG_SIGNATURE, ihdr(30, 20), chunk('tEXt', bytes('a\0b'), true), idat(30, 20), end)],
    ['troncato', png(30, 20).subarray(0, 60)],
    ['senza IEND', cat(PNG_SIGNATURE, ihdr(30, 20), idat(30, 20))],
    ['IHDR non primo', cat(PNG_SIGNATURE, chunk('gAMA', Uint8Array.from([0, 0, 0xb1, 0x8f])), ihdr(30, 20), idat(30, 20), end)],
    ['due IHDR', cat(PNG_SIGNATURE, ihdr(30, 20), ihdr(30, 20), idat(30, 20), end)],
    ['senza IDAT', cat(PNG_SIGNATURE, ihdr(30, 20), end)],
    ['critico sconosciuto', cat(PNG_SIGNATURE, ihdr(30, 20), chunk('ABCD', bytes('x')), idat(30, 20), end)],
    ['tipo non lettere', cat(PNG_SIGNATURE, ihdr(30, 20), chunk('a1b2', bytes('x')), idat(30, 20), end)],
    ['profondità non valida', cat(PNG_SIGNATURE, (() => { const c = ihdr(30, 20); const d = c.slice(8, 21); d[8] = 3; return chunk('IHDR', d); })(), idat(30, 20), end)],
  ] as const) assert.deepEqual(sniff(b), { ok: false, reason: 'structure' }, name);
  // bytes after IEND are not part of the picture
  const tail = sniff(cat(png(30, 20), bytes('<script>')));
  assert.ok(tail.ok && tail.type === 'png' && tail.chunks.at(-1)?.type === 'IEND');
});

test('nessun input fa cadere il lettore: ogni taglio e 3000 byte alterati a caso', async () => {
  const samples = [JPEG, phoneJpeg(), png(30, 20), await pdf(1)];
  for (const s of samples) for (let n = 0; n <= s.length; n += Math.max(1, Math.floor(s.length / 300))) assert.doesNotThrow(() => sniff(s.subarray(0, n)));
  let seed = 49;
  const rnd = (): number => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
  for (let k = 0; k < 3000; k++) {
    const s = cat(samples[k % samples.length] ?? JPEG);
    for (let f = 0; f < 3; f++) s[Math.floor(rnd() * s.length)] = Math.floor(rnd() * 256);
    assert.doesNotThrow(() => sniff(s));
  }
});
