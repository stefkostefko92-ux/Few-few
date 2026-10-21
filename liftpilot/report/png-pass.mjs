// @ts-check
// A PNG appended to a fascicolo without decoding its pixels (report/pdf-tool.mjs): a PDF image whose data are the PNG's
// own IDAT bytes under /FlateDecode with the PNG predictors (/Predictor 15) — the same picture, its bytes copied, the
// time of the copy. Only for what a PDF image says the same way: not interlaced, grey or RGB at 8 or 16 bits, or a palette
// (1, 2, 4 or 8 bits), without transparency (no tRNS, no alpha channel). Any other PNG goes through pdf-lib's embedPng,
// which decodes and compresses its pixels again: the slow path, whose cost the issue of a relazione bounds
// (src/lib/allegati/png.ts — the same rules in TypeScript, checked against these by scripts/__tests__/pdf-tool.test.ts).
import { Buffer } from 'node:buffer';
import { createInflate } from 'node:zlib';
import { PDFHexString, PDFRawStream } from 'pdf-lib';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Channels by colour type: grey, RGB, palette, grey + alpha, RGB + alpha. */
const CHANNELS = /** @type {Record<number, number>} */ ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 });

/**
 * @typedef {{ width: number, height: number, depth: number, colorType: number, interlace: number, palette: Uint8Array | null,
 *   transparency: boolean, idat: Uint8Array[], pass: boolean }} PngPlan
 */

/**
 * The PNG's header, palette, transparency and image data, and whether it can be passed through; null when the bytes are
 * not a PNG with a well-formed header and image data.
 * @param {Uint8Array} b
 * @returns {PngPlan | null}
 */
export function pngPlan(b) {
  if (b.length < 33 || SIGNATURE.some((x, i) => b[i] !== x)) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  /** @type {Uint8Array[]} */
  const idat = [];
  let at = 8, width = 0, height = 0, depth = 0, colorType = -1, interlace = 0, transparency = false;
  /** @type {Uint8Array | null} */
  let palette = null;
  while (at + 12 <= b.length) {
    const len = v.getUint32(at), type = String.fromCharCode(b[at + 4], b[at + 5], b[at + 6], b[at + 7]);
    if (at + 12 + len > b.length) return null;
    const data = b.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      if (len !== 13) return null;
      width = v.getUint32(at + 8); height = v.getUint32(at + 12); depth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') transparency = true;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    at += 12 + len;
  }
  if (!width || !height || !(colorType in CHANNELS) || !idat.length) return null;
  const grey = colorType === 0 || colorType === 2;
  const pass = interlace === 0 && !transparency && ((grey && (depth === 8 || depth === 16))
    || (colorType === 3 && [1, 2, 4, 8].includes(depth) && palette !== null && palette.length >= 3 && palette.length % 3 === 0));
  return { width, height, depth, colorType, interlace, palette, transparency, idat, pass };
}

/** The bytes of one row of the image after the PNG filter byte. @param {PngPlan} p */
const rowBytes = (p) => Math.ceil((p.width * (CHANNELS[p.colorType] ?? 1) * p.depth) / 8);

/**
 * Whether the image data inflate to exactly the rows the header says, each starting with a PNG filter (0–4): read as a
 * stream, never held whole (the inspection of an upload; the fascicolo trusts what the upload checked).
 * @param {PngPlan} p
 * @returns {Promise<boolean>}
 */
export function pngDataComplete(p) {
  const row = rowBytes(p) + 1, expected = row * p.height;
  return new Promise((resolve) => {
    const z = createInflate();
    let n = 0, ok = true;
    z.on('data', (/** @type {Buffer} */ c) => {
      // the first byte of each row in this piece: a filter type
      for (let i = (row - (n % row)) % row; i < c.length; i += row) if (c[i] > 4) ok = false;
      n += c.length;
      if (n > expected || !ok) { ok = false; z.destroy(); }
    });
    z.on('error', () => resolve(false));
    z.on('close', () => resolve(ok && n === expected));
    z.on('end', () => resolve(ok && n === expected));
    for (const d of p.idat) z.write(d);
    z.end();
  });
}

/**
 * The image XObject of a PNG that can be passed through, registered in the document: its IDAT bytes as they are.
 * @param {import('pdf-lib').PDFDocument} doc
 * @param {PngPlan} p
 * @returns {{ ref: import('pdf-lib').PDFRef, width: number, height: number }}
 */
export function embedPngPass(doc, p) {
  const colors = CHANNELS[p.colorType] ?? 1;
  const space = p.colorType === 0 ? 'DeviceGray' : p.colorType === 2 ? 'DeviceRGB'
    : ['Indexed', 'DeviceRGB', (p.palette?.length ?? 3) / 3 - 1, PDFHexString.of(Buffer.from(p.palette ?? []).toString('hex'))];
  const total = p.idat.reduce((s, d) => s + d.length, 0), data = new Uint8Array(total);
  let at = 0;
  for (const d of p.idat) { data.set(d, at); at += d.length; }
  const dict = doc.context.obj({
    Type: 'XObject', Subtype: 'Image', Width: p.width, Height: p.height, BitsPerComponent: p.depth, ColorSpace: space, Filter: 'FlateDecode',
    DecodeParms: { Predictor: 15, Colors: colors, BitsPerComponent: p.depth, Columns: p.width },
  });
  return { ref: doc.context.register(PDFRawStream.of(dict, data)), width: p.width, height: p.height };
}
