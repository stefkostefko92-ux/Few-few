// The copy of an uploaded file the product keeps (round 49, plan §0 row 7 and §6.1): a picture without its metadata —
// privacy by design: a phone photo carries the place it was taken (GPS), the camera, the owner's name, a thumbnail that
// may show what was cropped out. The JPEG keeps only what draws the picture (the JFIF header without its thumbnail, the
// ICC colour profile, Adobe's colour transform, tables, frame, scans); EXIF, XMP, IPTC/Photoshop, the JFXX extension (a
// thumbnail), every other application segment and the comments go, and so does whatever followed its end. The PNG keeps its image and colour chunks; text (tEXt, iTXt, zTXt), EXIF
// (eXIf), the time (tIME) and every other ancillary chunk go. A PDF is kept as uploaded (its pages are flattened and
// stripped of actions when appended, report/pdf-tool.mjs). The SHA-256 the product stores and prints is the kept copy's.
// Pure.
import { MIME_OF, type AllegatoMime, type AllegatoType } from './limits';
import { sniff, type JpegPiece, type PngChunk, type SniffRefusal } from './sniff';

const ascii = (b: Uint8Array, from: number, n: number): string => String.fromCharCode(...b.subarray(from, Math.min(b.length, from + n)));

/** An application segment that only describes how to draw the picture: JFIF (APP0; its thumbnail is cut, jfifHeader),
 *  ICC profile (APP2), Adobe (APP14). The JFXX extension of APP0 carries only a thumbnail: never kept. */
function drawingApp(b: Uint8Array, p: JpegPiece): boolean {
  const id = ascii(b, p.start + 4, 12);
  if (p.marker === 0xe0) return id.startsWith('JFIF\0');
  if (p.marker === 0xe2) return id.startsWith('ICC_PROFILE\0');
  if (p.marker === 0xee) return id.startsWith('Adobe');
  return false;
}

/** The JPEG segments kept: every piece but the application segments other than drawingApp and the comments (COM). */
export function keptJpegPieces(b: Uint8Array, pieces: readonly JpegPiece[]): JpegPiece[] {
  return pieces.filter((p) => {
    if (p.marker === null) return true;
    if (p.marker === 0xfe) return false;
    if (p.marker >= 0xe0 && p.marker <= 0xef) return drawingApp(b, p);
    return true;
  });
}

/** The PNG chunks that draw the picture or its colours; any other is metadata (or animation) and is left out. */
export const PNG_KEPT = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'bKGD', 'pHYs']);
export const keptPngChunks = (chunks: readonly PngChunk[]): PngChunk[] => chunks.filter((c) => PNG_KEPT.has(c.type));

/** The JFIF header's length without a thumbnail: marker (2), length (2), «JFIF\0» (5), version (2), units (1), densities
 *  (4), thumbnail width and height (2). */
const JFIF_HEADER = 18;

/** A JFIF APP0 segment as kept: the header with the thumbnail's size set to 0 × 0 and its pixels left out (a copy when
 *  there is a thumbnail; the segment as it is when there is none). */
export function jfifHeader(b: Uint8Array, p: JpegPiece): Uint8Array {
  if (p.end - p.start <= JFIF_HEADER) return b.subarray(p.start, p.end);
  const h = b.slice(p.start, p.start + JFIF_HEADER);
  h[2] = 0;
  h[3] = JFIF_HEADER - 2;
  h[16] = 0;
  h[17] = 0;
  return h;
}

/** The bytes of a kept piece: the JFIF header cut to itself, any other piece as it is. */
const bytesOf = (b: Uint8Array, p: JpegPiece): Uint8Array => (p.marker === 0xe0 ? jfifHeader(b, p) : b.subarray(p.start, p.end));

function join(head: Uint8Array | null, parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array((head?.length ?? 0) + parts.reduce((s, x) => s + x.length, 0));
  let at = 0;
  if (head) {
    out.set(head, 0);
    at = head.length;
  }
  for (const x of parts) {
    out.set(x, at);
    at += x.length;
  }
  return out;
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A file ready to keep: its kind, the bytes to store, and what the fascicolo needs to place it. */
export interface PreparedFile {
  ok: true;
  type: AllegatoType;
  mime: AllegatoMime;
  data: Uint8Array<ArrayBuffer>;
  width: number | null;
  height: number | null;
  /** the JPEG's EXIF orientation (1..8) read before the metadata went; null when absent or not a JPEG */
  orientation: number | null;
  /** how many bytes of metadata (or trailing data) were removed */
  removed: number;
}
export type Preparation = PreparedFile | { ok: false; reason: SniffRefusal };

/**
 * The upload as the product keeps it: recognised (sniff), its metadata removed, and the result recognised again with the
 * same kind and size (what is stored always passes the same reader). Refused: not a PDF, JPEG or PNG; malformed; a
 * picture out of size.
 */
export function prepareFile(b: Uint8Array<ArrayBuffer>): Preparation {
  const s = sniff(b);
  if (!s.ok) return s;
  if (s.type === 'pdf') return { ok: true, type: 'pdf', mime: MIME_OF.pdf, data: b, width: null, height: null, orientation: null, removed: 0 };
  const data = s.type === 'jpeg' ? join(null, keptJpegPieces(b, s.pieces).map((p) => bytesOf(b, p)))
    : join(PNG_SIGNATURE, keptPngChunks(s.chunks).map((c) => b.subarray(c.start, c.end)));
  const again = sniff(data);
  if (!again.ok || again.type !== s.type || again.width !== s.width || again.height !== s.height) return { ok: false, reason: 'structure' };
  return {
    ok: true, type: s.type, mime: MIME_OF[s.type], data, width: s.width, height: s.height,
    orientation: s.type === 'jpeg' ? s.orientation : null, removed: b.length - data.length,
  };
}
