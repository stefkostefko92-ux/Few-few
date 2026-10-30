// A company logo as uploaded: PNG or JPEG recognised by its magic bytes (never by the name or the declared type), at
// most 300 KB, with sensible dimensions read from the image header. Nothing else is accepted: the bytes end up in
// the PDF of the drawing sets and in data: URIs of the previews. The pixels are bounded too: a small file can hold a
// huge flat image, which the renderers decode whole (a 6000 × 6000 PNG of 150 KB takes about half a gigabyte).

export const LOGO_MAX_BYTES = 300 * 1024;
const MIN_SIDE = 16, MAX_SIDE = 4000, MAX_PIXELS = 4_000_000;

export type LogoMime = 'image/png' | 'image/jpeg';

export interface LogoInfo {
  mime: LogoMime;
  width: number;
  height: number;
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// The end of the file within its last bytes (some writers pad after it): a file cut short has none (audit 2026-10-06 —
// a truncated JPEG passed the header check, then the renderer failed on it and the issued drawing set could not be
// downloaded any more).
const TAIL = 64;
function endsWith(b: Uint8Array, mark: readonly number[]): boolean {
  for (let i = Math.max(0, b.length - TAIL); i + mark.length <= b.length; i++) if (mark.every((x, j) => b[i + j] === x)) return true;
  return false;
}
const IEND = [0x49, 0x45, 0x4e, 0x44], EOI = [0xff, 0xd9];

function pngSize(b: Uint8Array): [number, number] | null {
  // the IHDR chunk comes first: length (4), "IHDR" (4), width (4), height (4); the IEND chunk closes the file
  if (b.length < 24 || String.fromCharCode(b[12], b[13], b[14], b[15]) !== 'IHDR' || !endsWith(b, IEND)) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return [v.getUint32(16), v.getUint32(20)];
}

const isFrame = (m: number): boolean => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc; // SOF0…15 but DHT, JPG, DAC

function jpegSize(b: Uint8Array): [number, number] | null {
  // walk the markers to the start of scan: exactly one frame before it, none after it (a second frame header is a file
  // made to fool this reader), and the end-of-image marker at the end
  let i = 2, size: [number, number] | null = null;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
    if (marker === 0xda) break; // start of scan
    if (len < 2) return null;
    if (isFrame(marker)) {
      if (size) return null;
      size = [(b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]];
    }
    i += 2 + len;
  }
  if (!size || !endsWith(b, EOI)) return null; // a scan before any frame, or a file cut short
  // in the coded data 0xFF is followed by 0x00 or a restart marker; a frame marker there is a second image
  for (let j = i + 2; j + 1 < b.length; j++) if (b[j] === 0xff && isFrame(b[j + 1])) return null;
  return size;
}

/** The logo's type and size, or null when the bytes are not a PNG or JPEG of acceptable size. */
export function readLogo(b: Uint8Array): LogoInfo | null {
  if (b.length === 0 || b.length > LOGO_MAX_BYTES) return null;
  let mime: LogoMime, size: [number, number] | null;
  if (PNG.every((x, i) => b[i] === x)) {
    mime = 'image/png';
    size = pngSize(b);
  } else if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    mime = 'image/jpeg';
    size = jpegSize(b);
  } else return null;
  if (!size) return null;
  const [width, height] = size;
  if (width < MIN_SIDE || height < MIN_SIDE || width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) return null;
  return { mime, width, height };
}

/** A stored logo as the documents may embed it: one that passes today's rules (an older upload above the bounds is
 *  left out of the document rather than decoded). */
export function usableLogo(l: { mime: string; data: Uint8Array } | null | undefined): { mime: LogoMime; data: Uint8Array } | null {
  if (!l) return null;
  const info = readLogo(l.data);
  return info && info.mime === l.mime ? { mime: info.mime, data: l.data } : null;
}
