// Files made here for the attachment tests (src/lib/allegati, the upload route): a 24 × 12 JPEG made once with Pillow
// (pdf-lib writes no JPEG) and the segments a phone or an editor adds to one — EXIF with the orientation, a GPS position
// and an author, XMP, IPTC, a comment, a vendor segment —; PNGs written chunk by chunk with their CRC (text, EXIF, time,
// a private chunk); PDFs from pdf-lib. Markers of personal data are plain strings, so a test can look for them in bytes.
import { deflateSync } from 'node:zlib';
import { PDFDocument, StandardFonts } from 'pdf-lib';

export const PERSONAL = { gps: 'GPS-45.4642N-9.1900E', author: 'Mario Rossi fotografo', xmp: 'xmp:CreatorTool=TelefonoDiMario', iptc: 'IPTC-Via-Roma-12', comment: 'scattata in Via Roma 12', vendor: 'Ducky-Serial-0042' } as const;

export const JPEG = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAMABgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDo9E8Gf2Tq0F9/aHneVu+TyducqR13H1rq6KKmMFFWRtXxFSvLmqO7CiiiqMT/2Q==', 'base64'));

export const cat = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => Uint8Array.from(Buffer.concat(parts));
const latin1 = (s: string): Uint8Array => Uint8Array.from(Buffer.from(s, 'latin1'));

/** A JPEG marker segment: FF, the marker, the length (2 + body), the body. */
export function segment(marker: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + body.length);
  out.set([0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff]);
  out.set(body, 4);
  return out;
}

/** The JPEG with these segments right after its APP0 (SOI 2 bytes + APP0 18 bytes). */
export const withSegments = (jpeg: Uint8Array, ...segs: Uint8Array[]): Uint8Array<ArrayBuffer> => cat(jpeg.subarray(0, 20), ...segs, jpeg.subarray(20));

/** An EXIF APP1 body: IFD0 with the orientation, an ASCII artist and a pointer to a GPS IFD with a latitude text. */
export function exif(orientation: number, order: 'II' | 'MM' = 'II'): Uint8Array {
  const le = order === 'II';
  const w16 = (v: number): number[] => (le ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
  const w32 = (v: number): number[] => (le ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24] : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]);
  const artist = latin1(`${PERSONAL.author}\0`), gps = latin1(`${PERSONAL.gps}\0`);
  // TIFF header 8, IFD0: count 2 + 3 entries × 12 + next 4 = 42, then the artist, then the GPS IFD (2 + 12 + 4), then its text
  const ifd0 = 8, artistAt = ifd0 + 42, gpsIfd = artistAt + artist.length, gpsText = gpsIfd + 18;
  const bytes = [
    ...latin1(order), ...w16(42), ...w32(ifd0),
    ...w16(3),
    ...w16(0x0112), ...w16(3), ...w32(1), ...w16(orientation), 0, 0,
    ...w16(0x013b), ...w16(2), ...w32(artist.length), ...w32(artistAt),
    ...w16(0x8825), ...w16(4), ...w32(1), ...w32(gpsIfd),
    ...w32(0),
    ...artist,
    ...w16(1), ...w16(0x0002), ...w16(2), ...w32(gps.length), ...w32(gpsText), ...w32(0),
    ...gps,
  ];
  return cat(latin1('Exif\0\0'), Uint8Array.from(bytes));
}

/** A JPEG as a phone or an editor leaves it: EXIF (orientation 6, author, GPS), XMP, IPTC, a comment, a vendor segment,
 *  and the segments that draw the picture (ICC profile, Adobe) kept by the strip. */
export const phoneJpeg = (orientation = 6): Uint8Array<ArrayBuffer> => withSegments(JPEG,
  segment(0xe1, exif(orientation)),
  segment(0xe1, latin1(`http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>${PERSONAL.xmp}</x:xmpmeta>`)),
  segment(0xe2, latin1('ICC_PROFILE\0\x01\x01fake-profile-bytes')),
  segment(0xed, latin1(`Photoshop 3.0\x008BIM\x04\x04${PERSONAL.iptc}`)),
  segment(0xec, latin1(`Ducky\0${PERSONAL.vendor}`)),
  segment(0xee, latin1('Adobe\0\x64\0\0\0\0\x01')),
  segment(0xfe, latin1(PERSONAL.comment)));

/** The JPEG's frame header with another size (a forged header: the scan stays 24 × 12). */
export function jpegSized(w: number, h: number): Uint8Array<ArrayBuffer> {
  const b = cat(JPEG), at = Buffer.from(b).indexOf(Buffer.from([0xff, 0xc0]));
  b.set([h >> 8, h & 0xff, w >> 8, w & 0xff], at + 5);
  return b;
}

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Uint8Array): number => { let c = 0xffffffff; for (const x of b) c = (CRC[(c ^ x) & 0xff] ?? 0) ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** A PNG chunk with its length and CRC (`badCrc` spoils the CRC). */
export function chunk(type: string, data: Uint8Array, badCrc = false): Uint8Array {
  const body = cat(latin1(type), data), out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  out.set(body, 4);
  out.writeUInt32BE((crc(body) ^ (badCrc ? 1 : 0)) >>> 0, body.length + 4);
  return Uint8Array.from(out);
}

export const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function ihdr(w: number, h: number): Uint8Array {
  const d = Buffer.alloc(13);
  d.writeUInt32BE(w, 0); d.writeUInt32BE(h, 4); d[8] = 8; d[9] = 2;
  return chunk('IHDR', Uint8Array.from(d));
}

/** The image data of an RGB picture w × h of one grey. */
export const idat = (w: number, h: number): Uint8Array => {
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x80)]);
  return chunk('IDAT', Uint8Array.from(deflateSync(Buffer.concat(Array<Buffer>(h).fill(row)))));
};

/** An RGB PNG w × h with `extra` chunks between IHDR and IDAT. */
export const png = (w: number, h: number, ...extra: Uint8Array[]): Uint8Array<ArrayBuffer> =>
  cat(PNG_SIGNATURE, ihdr(w, h), ...extra, idat(w, h), chunk('IEND', new Uint8Array(0)));

/** A PNG as an editor leaves it: text, international text with XMP, compressed text, EXIF, time, a private chunk. */
export const editorPng = (): Uint8Array<ArrayBuffer> => png(30, 20,
  chunk('gAMA', Uint8Array.from([0, 0, 0xb1, 0x8f])),
  chunk('tEXt', latin1(`Author\0${PERSONAL.author}`)),
  chunk('iTXt', latin1(`XML:com.adobe.xmp\0\0\0\0\0${PERSONAL.xmp}`)),
  chunk('zTXt', cat(latin1('Comment\0\0'), Uint8Array.from(deflateSync(Buffer.from(PERSONAL.comment))))),
  chunk('eXIf', exif(1).subarray(6)),
  chunk('tIME', Uint8Array.from([0x07, 0xea, 10, 21, 12, 0, 0])),
  chunk('prVt', latin1(PERSONAL.vendor)),
  chunk('pHYs', Uint8Array.from([0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1])));

/** A PDF of `pages` A4 pages, one line of text each. */
export async function pdf(pages = 1, version?: string): Promise<Uint8Array<ArrayBuffer>> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) doc.addPage([595.28, 841.89]).drawText(`pagina ${i + 1}`, { x: 40, y: 800, size: 12, font });
  const bytes = cat(await doc.save());
  if (version) bytes.set(latin1(`%PDF-${version}`), 0);
  return bytes;
}

export const includes = (hay: Uint8Array, needle: string): boolean => Buffer.from(hay).includes(Buffer.from(needle, 'latin1'));
