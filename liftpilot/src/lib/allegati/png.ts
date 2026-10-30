// How a stored PNG goes into a fascicolo, read from its first bytes (round 49 fix step): passed through — its data copied
// as a PDF image (report/png-pass.mjs: not interlaced, grey or RGB at 8 or 16 bits or a palette, without transparency) —
// or decoded and compressed again by pdf-lib, the slow path. The same rules as png-pass.mjs (pdf-tool.test.ts checks
// both on the same files). The issue of a relazione bounds the slow path's pixels (RT_ALLEGATI_LIMITS.maxSlowPixels),
// so an issued RT is always assembled within the tool's time. Pure.

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const COLOR_TYPES = new Set([0, 2, 3, 4, 6]);

/** What the fascicolo does with a PNG: `pass` (copied) or `slow` (decoded), with its pixels; null: not a PNG header. */
export interface PngWay { way: 'pass' | 'slow'; pixels: number }

/**
 * The way of a PNG from its first bytes: the chunks before the image data are walked (header, palette, transparency);
 * when they run past `head` before the image data starts, the way is not known and taken as slow (the cautious side).
 */
export function pngWay(head: Uint8Array): PngWay | null {
  if (head.length < 33 || SIGNATURE.some((x, i) => head[i] !== x)) return null;
  const v = new DataView(head.buffer, head.byteOffset, head.byteLength);
  if (v.getUint32(8) !== 13 || String.fromCharCode(...head.subarray(12, 16)) !== 'IHDR') return null;
  const width = v.getUint32(16), height = v.getUint32(20), depth = head[24], colorType = head[25], interlace = head[28];
  if (!width || !height || !COLOR_TYPES.has(colorType)) return null;
  const pixels = width * height;
  let at = 33, palette = false, transparency = false;
  for (;;) {
    if (at + 8 > head.length) return { way: 'slow', pixels };
    const len = v.getUint32(at), type = String.fromCharCode(...head.subarray(at + 4, at + 8));
    if (type === 'IDAT') break;
    if (type === 'IEND') return null;
    if (type === 'PLTE') palette = len >= 3 && len % 3 === 0;
    if (type === 'tRNS') transparency = true;
    at += 12 + len;
  }
  const grey = colorType === 0 || colorType === 2;
  const pass = interlace === 0 && !transparency && ((grey && (depth === 8 || depth === 16)) || (colorType === 3 && [1, 2, 4, 8].includes(depth) && palette));
  return { way: pass ? 'pass' : 'slow', pixels };
}

/** The bytes read from a stored PNG to know its way: its header and the chunks before the image data. */
export const PNG_HEAD_BYTES = 64 * 1024;
