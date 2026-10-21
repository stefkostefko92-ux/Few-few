// @ts-check
// The appended pages of a fascicolo (report/pdf-tool.mjs): an A4 page in the orientation of what it carries, the content
// upright and scaled into the frame of the relazione's body (report/relazione.py: margins 16 mm left and right, 17 mm top
// and bottom), and the body's header and footer lines in the same places, DejaVu Sans 7,2 pt. Also what keeps an
// attachment's page from carrying anything but its drawing: only the keys drawing needs survive, every action the copy
// would bring along is emptied, and what embedding will decode is bounded (one Flate or none, 64 MiB a page, 256 MiB an
// attachment). Geometry and pdf-lib calls; no I/O.
import { Buffer } from 'node:buffer';
import { inflateSync } from 'node:zlib';
import {
  PDFArray,
  PDFContentStream,
  PDFDict,
  PDFName,
  PDFNull,
  PDFRawStream,
  PDFStream,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  rgb,
} from 'pdf-lib';

/** @typedef {[number, number, number, number, number, number]} Matrix  a b c d e f: (x, y) → (a·x + c·y + e, b·x + d·y + f) */
/** @typedef {import('pdf-lib').PDFPage} PDFPage */
/** @typedef {import('pdf-lib').PDFFont} PDFFont */
/** @typedef {import('pdf-lib').PDFDocument} PDFDocument */

export const MM = 72 / 25.4;
const A4 = /** @type {const} */ ([210 * MM, 297 * MM]);
const MARGIN = 16 * MM;
const FRAME_TB = 17 * MM;
const SIZE = 7.2;
const MUTED = rgb(0x5a / 255, 0x64 / 255, 0x80 / 255);
const RULE = rgb(0xd6 / 255, 0xdc / 255, 0xe6 / 255);
export const CREDIT = 'Created and Designed by Carbon Stealth VCC · carbonstealth.eu';

/**
 * The clockwise turn and the mirror that show a picture upright for its EXIF orientation (1..8; anything else: as stored).
 * @param {number | null | undefined} o
 * @returns {{ turn: 0 | 90 | 180 | 270, mirror: boolean }}
 */
export function exifTurn(o) {
  switch (o) {
    case 2: return { turn: 0, mirror: true };
    case 3: return { turn: 180, mirror: false };
    case 4: return { turn: 180, mirror: true };
    case 5: return { turn: 270, mirror: true };
    case 6: return { turn: 90, mirror: false };
    case 7: return { turn: 90, mirror: true };
    case 8: return { turn: 270, mirror: false };
    default: return { turn: 0, mirror: false };
  }
}

/**
 * The matrix that takes content lying in [0, w] × [0, h] to its upright place: mirrored left to right first when asked,
 * then turned clockwise by `turn` (a page's /Rotate, a picture's EXIF turn) into [0, W] × [0, H] — W × H is w × h, or
 * h × w after a quarter turn.
 * @param {number} w
 * @param {number} h
 * @param {number} turn
 * @param {boolean} mirror
 * @returns {Matrix}
 */
export function uprightMatrix(w, h, turn, mirror) {
  /** @type {Matrix} */
  let m;
  switch (((turn % 360) + 360) % 360) {
    case 90: m = [0, -1, 1, 0, 0, w]; break;
    case 180: m = [-1, 0, 0, -1, w, h]; break;
    case 270: m = [0, 1, -1, 0, h, 0]; break;
    default: m = [1, 0, 0, 1, 0, 0];
  }
  if (!mirror) return m;
  const [a, b, c, d, e, f] = m;
  return [-a, -b, c, d, a * w + e, b * w + f];
}

/**
 * The new page for content shown W × H points: A4, landscape when wider than tall; the content scaled into the body's
 * frame — never enlarged unless `grow` (pictures, which have no size of their own) — and centred in it.
 * @param {number} W
 * @param {number} H
 * @param {boolean} grow
 */
export function layout(W, H, grow) {
  const [pw, ph] = W > H ? [A4[1], A4[0]] : [A4[0], A4[1]];
  const fw = pw - 2 * MARGIN, fh = ph - 2 * FRAME_TB;
  const s = Math.min(fw / W, fh / H, grow ? Infinity : 1);
  return { size: /** @type {[number, number]} */ ([pw, ph]), s, x: MARGIN + (fw - W * s) / 2, y: FRAME_TB + (fh - H * s) / 2, w: W * s, h: H * s };
}

/**
 * Draws the XObject `name` on the page through `m` (its content → upright), scaled by s and moved to (x, y); a hairline
 * frames it.
 * @param {PDFPage} page
 * @param {import('pdf-lib').PDFName} name
 * @param {Matrix} m
 * @param {{ s: number, x: number, y: number, w: number, h: number }} at
 */
export function drawPlaced(page, name, m, at) {
  const [a, b, c, d, e, f] = m, { s, x, y } = at;
  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(s * a, s * b, s * c, s * d, s * e + x, s * f + y),
    drawObject(name),
    popGraphicsState(),
  );
  page.drawRectangle({ x: at.x, y: at.y, width: at.w, height: at.h, borderColor: RULE, borderWidth: 0.4 });
}

/**
 * The text cut with an ellipsis to fit `width` at 7,2 pt.
 * @param {PDFFont} font
 * @param {string} text
 * @param {number} width
 */
function cut(font, text, width) {
  if (font.widthOfTextAtSize(text, SIZE) <= width) return text;
  let s = text;
  while (s.length > 1 && font.widthOfTextAtSize(`${s}…`, SIZE) > width) s = s.slice(0, -1);
  return `${s}…`;
}

/**
 * The body's header and footer on an appended page (geometry of relazione.py's NumberedCanvas.draw_frame): the header
 * and «Pagina k di N» 10 mm from the top over a rule; the footer's first line — here the attachment's — with the credit
 * beside it, smaller when the line leaves it less room, then the document's code and its notice, when given.
 * @param {PDFPage} page
 * @param {PDFFont} font
 * @param {{ header: string, pageNo: number, total: number, footer: string, code?: string, notice?: string }} t
 */
export function stamp(page, font, t) {
  const pw = page.getWidth(), top = page.getHeight() - 10 * MM, right = pw - MARGIN, frameW = pw - 2 * MARGIN;
  page.setFont(font);
  const write = (/** @type {string} */ text, /** @type {number} */ x, /** @type {number} */ y, size = SIZE) =>
    page.drawText(text, { x, y, size, color: MUTED });
  const line = (/** @type {number} */ y) =>
    page.drawLine({ start: { x: MARGIN, y }, end: { x: right, y }, thickness: 0.4, color: RULE });
  const pageText = `Pagina ${t.pageNo} di ${t.total}`, pageW = font.widthOfTextAtSize(pageText, SIZE);
  write(cut(font, t.header, frameW - pageW - 6 * MM), MARGIN, top);
  write(pageText, right - pageW, top);
  line(top - 2.2 * MM);
  const y = (t.notice ? [11.6, 8.5, 5.4] : [9, 5.8]).map((v) => v * MM);
  line(y[0] + 3.3 * MM);
  const footer = cut(font, t.footer, frameW - 6 * MM - font.widthOfTextAtSize(CREDIT, 5.6));
  write(footer, MARGIN, y[0]);
  let size = SIZE;
  const room = frameW - 6 * MM - font.widthOfTextAtSize(footer, SIZE);
  while (size > 5.6 && font.widthOfTextAtSize(CREDIT, size) > room) size -= 0.2;
  write(CREDIT, right - font.widthOfTextAtSize(CREDIT, size), y[0], size);
  if (t.code) write(cut(font, t.code, frameW), MARGIN, y[1]);
  if (t.notice) write(cut(font, t.notice, frameW), MARGIN, y[2]);
}

const KEEP = new Set(['Type', 'Parent', 'Contents', 'Resources', 'MediaBox', 'CropBox', 'Rotate'].map((k) => PDFName.of(k)));
const INHERITED = ['Resources', 'MediaBox', 'CropBox', 'Rotate'].map((k) => PDFName.of(k));

/**
 * Leaves on an attachment's page only what drawing it needs (its inherited attributes made its own first): the
 * annotations, links, actions, thumbnails and the rest stay out of the copy pdf-lib makes when the page is embedded.
 * @param {PDFPage} page
 */
export function barePage(page) {
  const node = page.node;
  for (const key of INHERITED) {
    const value = node.getInheritableAttribute(key);
    if (value && !node.get(key)) node.set(key, value);
  }
  for (const key of node.keys()) if (!KEEP.has(key)) node.delete(key);
}

/** What one page's content may decode to, and a whole attachment's: a few kilobytes of Flate could ask for gigabytes. */
export const MAX_PAGE_CONTENT = 64 * 1024 * 1024;
export const MAX_DOC_CONTENT = 256 * 1024 * 1024;
const FLATE = PDFName.of('FlateDecode');
const FILTER = PDFName.of('Filter');
const DECODE_PARMS = PDFName.of('DecodeParms');
const NEWLINE = Uint8Array.of(0x0a);

/**
 * The bytes of a page's content streams as stored, each unfiltered or under one /FlateDecode without parameters (what a
 * page writer makes); null for any other filter, a chain of filters (two Flates make a bomb the size check would not
 * see), parameters, or a content that is not a stream — the attachment is refused, never measured at its stored size.
 * @param {PDFPage} page
 * @returns {{ bytes: Uint8Array, flate: boolean }[] | null}
 */
function contentStreams(page) {
  const context = page.doc.context, contents = page.node.Contents();
  const list = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  /** @type {{ bytes: Uint8Array, flate: boolean }[]} */
  const out = [];
  for (const item of list) {
    const stream = context.lookup(item);
    // what pdf-lib itself wrote on the page (the flattened form's widgets): plain operators
    if (stream instanceof PDFContentStream) { out.push({ bytes: stream.getUnencodedContents(), flate: false }); continue; }
    if (!(stream instanceof PDFRawStream)) return null;
    const filter = stream.dict.lookup(FILTER), parms = stream.dict.get(DECODE_PARMS);
    const filters = filter instanceof PDFArray ? filter.asArray().map((f) => context.lookup(f)) : filter ? [filter] : [];
    if (filters.length > 1 || (filters.length === 1 && filters[0] !== FLATE) || (parms !== undefined && parms !== PDFNull)) return null;
    out.push({ bytes: stream.contents, flate: filters.length === 1 });
  }
  return out;
}

/**
 * A page's content decoded — its streams joined by a newline, as pdf-lib's page embedder joins them — when it is at most
 * `limit` bytes; null when a stream cannot be read (contentStreams) or the content is longer. zlib stops at the limit, so
 * nothing larger is ever held; a truncated stream is read as far as it goes, as viewers do.
 * @param {PDFPage} page
 * @param {number} limit
 * @returns {Uint8Array | null}
 */
export function pageContent(page, limit) {
  const streams = contentStreams(page);
  if (!streams) return null;
  /** @type {Uint8Array[]} */
  const parts = [];
  let total = 0;
  for (const s of streams) {
    let bytes = s.bytes;
    if (s.flate) {
      try {
        bytes = inflateSync(s.bytes, { maxOutputLength: Math.max(1, limit - total + 1), finishFlush: 2 /* Z_SYNC_FLUSH */ });
      } catch {
        return null;
      }
    }
    total += bytes.length + 1;
    if (total > limit) return null;
    parts.push(bytes, NEWLINE);
  }
  return Buffer.concat(parts);
}

const ACTION_KEYS = ['AA', 'OpenAction', 'JS', 'JavaScript'].map((k) => PDFName.of(k));
const ACTIONS = new Set(['JavaScript', 'Launch', 'SubmitForm', 'ImportData', 'ResetForm', 'GoToR', 'GoToE', 'URI', 'Rendition',
  'Sound', 'Movie', 'RichMediaExecute', 'Hide', 'Named', 'SetOCGState', 'Trans', 'GoTo3DView', 'Thread'].map((k) => PDFName.of(k)));
const S = PDFName.of('S');

/**
 * Empties every action an attachment carries, before its pages are copied: the trigger keys go, and a dictionary that
 * is itself an action keeps nothing. What the pages draw is untouched.
 * @param {PDFDocument} doc
 */
export function scrubActions(doc) {
  /** @param {unknown} o */
  const walk = (o) => {
    const dict = o instanceof PDFStream ? o.dict : o;
    if (dict instanceof PDFDict) {
      const s = dict.get(S);
      if (s instanceof PDFName && ACTIONS.has(s)) {
        for (const key of dict.keys()) dict.delete(key);
        return;
      }
      for (const key of ACTION_KEYS) dict.delete(key);
      for (const [, value] of dict.entries()) walk(value);
    } else if (o instanceof PDFArray) {
      for (const value of o.asArray()) walk(value);
    }
  };
  for (const [, object] of doc.context.enumerateIndirectObjects()) walk(object);
}
