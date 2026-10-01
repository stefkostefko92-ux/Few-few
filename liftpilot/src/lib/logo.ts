// A company logo as uploaded: PNG or JPEG recognised by its magic bytes (never by the name or the declared type), at
// most 300 KB, with sensible dimensions read from the image header. Nothing else is accepted: the bytes end up in
// the PDF of the drawing sets and in data: URIs of the previews.

export const LOGO_MAX_BYTES = 300 * 1024;
const MIN_SIDE = 16, MAX_SIDE = 6000;

export type LogoMime = 'image/png' | 'image/jpeg';

export interface LogoInfo {
  mime: LogoMime;
  width: number;
  height: number;
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngSize(b: Uint8Array): [number, number] | null {
  // the IHDR chunk comes first: length (4), "IHDR" (4), width (4), height (4)
  if (b.length < 24 || String.fromCharCode(b[12], b[13], b[14], b[15]) !== 'IHDR') return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return [v.getUint32(16), v.getUint32(20)];
}

function jpegSize(b: Uint8Array): [number, number] | null {
  // walk the markers to the first start of frame (SOF0…SOF15 but DHT, JPG and DAC)
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return [(b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]];
    }
    if (marker === 0xda || len < 2) return null; // start of scan before a frame: not an image we accept
    i += 2 + len;
  }
  return null;
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
  if (width < MIN_SIDE || height < MIN_SIDE || width > MAX_SIDE || height > MAX_SIDE) return null;
  return { mime, width, height };
}
