// What an uploaded file is, read from its bytes only (round 49, plan §6.1) — never from its name or the type the browser
// declares. Three kinds are taken: a PDF («%PDF-1.x» or «%PDF-2.0» at the first byte and «%%EOF» within the last KiB),
// a JPEG (walked marker by marker from SOI to its EOI: one frame, a scan after it, nothing a decoder would misread) and a
// PNG (signature, IHDR first, every chunk inside the file with a correct CRC, IDAT, IEND). A picture's size comes from
// its header, never from decoding it: at most 40 megapixels and 12 000 px a side. The walk also tells
// strip.ts which segments and chunks carry metadata, and the JPEG's EXIF orientation is read here, before it is
// removed. Pure, no dependency: the upload's server code and the tests use it.
import { ALLEGATI_LIMITS, type AllegatoType } from './limits';

/** A run of a JPEG's bytes [start, end): a marker segment (with its marker) or entropy-coded data (marker null). */
export interface JpegPiece { marker: number | null; start: number; end: number }
/** A PNG chunk [start, end): length, type, data and CRC. */
export interface PngChunk { type: string; start: number; end: number }

export type SniffRefusal = 'type' | 'structure' | 'dimensions';
export type Sniffed =
  | { ok: true; type: 'pdf' }
  | { ok: true; type: 'jpeg'; width: number; height: number; orientation: number | null; pieces: JpegPiece[] }
  | { ok: true; type: 'png'; width: number; height: number; chunks: PngChunk[] };
export type SniffResult = Sniffed | { ok: false; reason: SniffRefusal };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ascii = (b: Uint8Array, from: number, n: number): string => String.fromCharCode(...b.subarray(from, from + n));
const u16 = (b: Uint8Array, i: number): number => (b[i] << 8) | b[i + 1];
const u32 = (b: Uint8Array, i: number): number => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);

/** The kind by the first bytes alone (no structure checked yet). */
export function magicType(b: Uint8Array): AllegatoType | null {
  if (b.length >= 8 && /^%PDF-(?:1\.[0-7]|2\.0)$/.test(ascii(b, 0, 8))) return 'pdf';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && PNG_SIGNATURE.every((x, i) => b[i] === x)) return 'png';
  return null;
}

/** A PDF's two ends: the header at byte 0 (magicType) and «%%EOF» within its last KiB, followed only by line ends,
 *  spaces or padding zeros — a file cut short has none, a file with something else glued after it (a picture made to
 *  be read as a PDF and as a JPEG) has more. */
export function pdfComplete(b: Uint8Array): boolean {
  const tail = ascii(b, Math.max(0, b.length - ALLEGATI_LIMITS.pdfTailBytes), ALLEGATI_LIMITS.pdfTailBytes);
  const at = tail.lastIndexOf('%%EOF');
  return at >= 0 && /^[\0\t\n\f\r ]*$/.test(tail.slice(at + 5));
}

// SOF0…SOF15 but DHT (C4), JPG (C8) and DAC (CC): the markers that open a frame
const isFrame = (m: number): boolean => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
const isRst = (m: number): boolean => m >= 0xd0 && m <= 0xd7;

/** The EXIF orientation (1..8) in an APP1 segment's body [from, to), or null when there is none or it is malformed. */
export function exifOrientation(b: Uint8Array, from: number, to: number): number | null {
  if (to - from < 14 || ascii(b, from, 6) !== 'Exif\0\0') return null;
  const t = from + 6, le = ascii(b, t, 2) === 'II';
  if (!le && ascii(b, t, 2) !== 'MM') return null;
  const r16 = (i: number): number => (le ? b[i] | (b[i + 1] << 8) : u16(b, i));
  const r32 = (i: number): number => (le ? (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)) + b[i + 3] * 2 ** 24 : u32(b, i));
  if (r16(t + 2) !== 42) return null;
  const ifd = t + r32(t + 4);
  if (ifd + 2 > to) return null;
  const n = r16(ifd);
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + 12 * k;
    if (e + 12 > to) return null;
    if (r16(e) !== 0x0112) continue;
    // SHORT, one value, held in the first two bytes of the value field
    if (r16(e + 2) !== 3 || r32(e + 4) !== 1) return null;
    const v = r16(e + 8);
    return v >= 1 && v <= 8 ? v : null;
  }
  return null;
}

type JpegWalk = { width: number; height: number; orientation: number | null; pieces: JpegPiece[] } | null;

/**
 * A JPEG from SOI to its first EOI, piece by piece. Refused (null): a byte where a marker should be, a segment running
 * past the end, a second SOI, a restart marker outside a scan, a scan before the frame, a second frame (a file made to
 * show one picture to this reader and another to a decoder), a frame of zero size, no EOI. Whatever follows the EOI
 * (a phone's second picture, appended data) is not part of the picture and is left out.
 */
function walkJpeg(b: Uint8Array): JpegWalk {
  const pieces: JpegPiece[] = [{ marker: 0xd8, start: 0, end: 2 }];
  let i = 2, size: [number, number] | null = null, orientation: number | null = null;
  for (;;) {
    if (i + 1 >= b.length || b[i] !== 0xff) return null;
    let m = b[i + 1];
    while (m === 0xff && i + 2 < b.length) m = b[++i + 1]; // fill bytes before a marker
    if (m === 0xd9) {
      pieces.push({ marker: 0xd9, start: i, end: i + 2 });
      break;
    }
    if (m === 0xd8 || m === 0x00 || m === 0xff || isRst(m)) return null;
    if (m === 0x01) { // TEM: a marker without a length
      pieces.push({ marker: m, start: i, end: i + 2 });
      i += 2;
      continue;
    }
    if (i + 4 > b.length) return null;
    const len = u16(b, i + 2), end = i + 2 + len;
    if (len < 2 || end > b.length) return null;
    if (isFrame(m)) {
      if (size || len < 8) return null;
      size = [u16(b, i + 7), u16(b, i + 5)];
      if (size[0] === 0 || size[1] === 0) return null;
    }
    if (m === 0xe1 && orientation === null) orientation = exifOrientation(b, i + 4, end);
    pieces.push({ marker: m, start: i, end });
    i = end;
    if (m !== 0xda) continue;
    if (!size) return null;
    // the entropy-coded data after the scan's header: 0xFF is followed by 0x00 (a stuffed byte), a restart marker or
    // fill bytes; anything else is the next marker
    let j = i;
    for (; j + 1 < b.length; j++) {
      if (b[j] !== 0xff) continue;
      const n = b[j + 1];
      if (n === 0x00 || isRst(n)) j++;
      else if (n !== 0xff) break;
    }
    if (j + 1 >= b.length) return null;
    pieces.push({ marker: null, start: i, end: j });
    i = j;
  }
  if (!size) return null;
  return { width: size[0], height: size[1], orientation, pieces };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array, from: number, to: number): number {
  let c = 0xffffffff;
  for (let i = from; i < to; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// the bit depths each colour type allows (PNG specification, IHDR)
const DEPTHS: Readonly<Record<number, readonly number[]>> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };

type PngWalk = { width: number; height: number; chunks: PngChunk[] } | null;

/**
 * A PNG from its signature to IEND, chunk by chunk. Refused (null): IHDR not first or malformed, a chunk running past the
 * end, a wrong CRC, a type that is not four letters, a second IHDR, an unknown critical chunk, no IDAT, no IEND. Bytes
 * after IEND are left out.
 */
function walkPng(b: Uint8Array): PngWalk {
  const chunks: PngChunk[] = [];
  let i = 8, width = 0, height = 0, idat = false;
  for (;;) {
    if (i + 12 > b.length) return null;
    const len = u32(b, i), type = ascii(b, i + 4, 4), end = i + 12 + len;
    if (len > 0x7fffffff || end > b.length || !/^[A-Za-z]{4}$/.test(type)) return null;
    if (crc32(b, i + 4, i + 8 + len) !== u32(b, i + 8 + len)) return null;
    if (chunks.length === 0) {
      if (type !== 'IHDR' || len !== 13) return null;
      width = u32(b, i + 8);
      height = u32(b, i + 12);
      const depth = b[i + 16], colour = b[i + 17];
      if (!width || !height || !DEPTHS[colour]?.includes(depth) || b[i + 18] !== 0 || b[i + 19] !== 0 || b[i + 20] > 1) return null;
    } else if (type === 'IHDR') return null;
    else if (type === 'IDAT') idat = true;
    else if (/^[A-Z]/.test(type) && type !== 'PLTE' && type !== 'IEND') return null; // a critical chunk no decoder knows
    chunks.push({ type, start: i, end });
    i = end;
    if (type === 'IEND') break;
  }
  return idat ? { width, height, chunks } : null;
}

const fits = (w: number, h: number): boolean => {
  const L = ALLEGATI_LIMITS;
  return w <= L.maxSidePx && h <= L.maxSidePx && w * h <= L.maxPixels;
};

/** What the bytes are, with what strip.ts needs; or why they are refused. */
export function sniff(b: Uint8Array): SniffResult {
  const type = magicType(b);
  if (type === 'pdf') return pdfComplete(b) ? { ok: true, type } : { ok: false, reason: 'structure' };
  if (type === 'jpeg') {
    const j = walkJpeg(b);
    if (!j) return { ok: false, reason: 'structure' };
    return fits(j.width, j.height) ? { ok: true, type, ...j } : { ok: false, reason: 'dimensions' };
  }
  if (type === 'png') {
    const p = walkPng(b);
    if (!p) return { ok: false, reason: 'structure' };
    return fits(p.width, p.height) ? { ok: true, type, ...p } : { ok: false, reason: 'dimensions' };
  }
  return { ok: false, reason: 'type' };
}
