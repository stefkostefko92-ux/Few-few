// A HEIC/HEIF picture (an iPhone's photo, round 50) recognised by its bytes before anything decodes it: the `ftyp` box
// first, with a HEIF brand (heic, heix, hevc, hevx, heim, heis, mif1, msf1), then the `meta` box walked for what the
// decoder would do — the image items (HEVC coded, a grid, a derived identity or overlay; AVIF and the others are not
// taken), their sizes (`ispe`, every image item's, tiles and thumbnails too: none past 40 megapixels or 12 000 px a
// side), the primary item (`pitm`) and the top-level images libheif lists: not hidden, not a thumbnail (`thmb`), not an
// auxiliary image (`auxl`), in the order of their item ids (libheif's map of the `infe` boxes; heif-convert writes them
// as out-1, out-2 … in that order). The product never stores the HEIC: heif-convert turns its primary image into a JPEG
// (src/lib/report/image-tool.ts), which then goes through prepareFile like any upload. Pure, no dependency.
import { ALLEGATI_LIMITS } from './limits';

export type HeicRefusal = 'structure' | 'dimensions' | 'type';
export interface HeicInfo {
  ok: true;
  /** the primary image's coded size (its `ispe`; a crop or a rotation may change what the decoder gives) */
  width: number;
  height: number;
  /** top-level images heif-convert writes, and which of them (0-based) is the primary */
  images: number;
  primary: number;
}
export type HeicSniff = HeicInfo | { ok: false; reason: HeicRefusal };

/** The brands of a HEIF image file (ISO/IEC 23008-12) the upload takes. */
export const HEIF_BRANDS: ReadonlySet<string> = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);
/** The image item types decoded with HEVC (or derived from such items). */
const IMAGE_TYPES: ReadonlySet<string> = new Set(['hvc1', 'grid', 'iden', 'iovl']);
/** Item types of another codec (AVIF, JPEG in HEIF, JPEG 2000, VVC, uncompressed): refused as another type. */
const OTHER_IMAGES: ReadonlySet<string> = new Set(['av01', 'jpeg', 'j2k1', 'vvc1', 'unci', 'mski']);
/** More top-level images than this (a burst saved in one file) are refused: each is decoded. */
export const HEIC_MAX_IMAGES = 4;
/** At most this many items, properties and references are read (a real photo has a few dozen to a few hundred). */
const MAX_ENTRIES = 4096;

const ascii = (b: Uint8Array, from: number, n: number): string => String.fromCharCode(...b.subarray(from, from + n));
const u16 = (b: Uint8Array, i: number): number => (b[i] << 8) | b[i + 1];
const u32 = (b: Uint8Array, i: number): number => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);

interface Box { type: string; start: number; body: number; end: number }

/** The boxes between `from` and `to`, or null when one runs past `to` (or a 64-bit size is past 2^53). */
function boxes(b: Uint8Array, from: number, to: number): Box[] | null {
  const out: Box[] = [];
  let i = from;
  while (i < to) {
    if (i + 8 > to) return null;
    let size = u32(b, i), body = i + 8;
    const type = ascii(b, i + 4, 4);
    if (size === 1) {
      if (i + 16 > to) return null;
      const hi = u32(b, i + 8);
      if (hi > 0x1fffff) return null;
      size = hi * 2 ** 32 + u32(b, i + 12);
      body = i + 16;
    } else if (size === 0) size = to - i;
    if (size < body - i || i + size > to) return null;
    out.push({ type, start: i, body, end: i + size });
    if (out.length > MAX_ENTRIES) return null;
    i += size;
  }
  return out;
}

class Bad extends Error {
  constructor(readonly reason: HeicRefusal) {
    super(reason);
  }
}
const need = (ok: boolean): void => {
  if (!ok) throw new Bad('structure');
};

/** Whether the bytes start as a HEIF image file: an `ftyp` box first whose major or a compatible brand is a HEIF one. */
export function isHeif(b: Uint8Array): boolean {
  if (b.length < 16 || ascii(b, 4, 4) !== 'ftyp') return false;
  const size = u32(b, 0);
  if (size < 16 || size > b.length || size % 4 !== 0 || size > 1024) return false;
  for (let i = 8; i + 4 <= size; i += 4) if (i !== 12 && HEIF_BRANDS.has(ascii(b, i, 4))) return true;
  return false;
}

interface Item { id: number; type: string; hidden: boolean }

/** The `infe` entries of an `iinf` box (versions 2 and 3: the ones with an item type). */
function items(b: Uint8Array, iinf: Box): Item[] {
  const v = b[iinf.body];
  const start = iinf.body + 4 + (v === 0 ? 2 : 4);
  need(start <= iinf.end);
  const list = boxes(b, start, iinf.end);
  need(list !== null);
  const out: Item[] = [];
  for (const e of list ?? []) {
    if (e.type !== 'infe') continue;
    const ev = b[e.body], hidden = (b[e.body + 3] & 1) === 1;
    if (ev < 2) continue; // no item type: never an image
    const idLen = ev === 2 ? 2 : 4, at = e.body + 4;
    need(at + idLen + 6 <= e.end);
    out.push({ id: ev === 2 ? u16(b, at) : u32(b, at), type: ascii(b, at + idLen + 2, 4), hidden });
  }
  return out;
}

/** The references of an `iref` box: type → (from item, to items). */
function references(b: Uint8Array, iref: Box): { type: string; from: number; to: number[] }[] {
  const wide = b[iref.body] !== 0, idLen = wide ? 4 : 2, rd = (i: number): number => (wide ? u32(b, i) : u16(b, i));
  const list = boxes(b, iref.body + 4, iref.end);
  need(list !== null);
  return (list ?? []).map((r) => {
    need(r.body + idLen + 2 <= r.end);
    const n = u16(b, r.body + idLen);
    need(r.body + idLen + 2 + n * idLen <= r.end);
    return { type: r.type, from: rd(r.body), to: Array.from({ length: n }, (_, k) => rd(r.body + idLen + 2 + k * idLen)) };
  });
}

/** Each item's `ispe` (width, height) through `ipco` and `ipma`. */
function sizes(b: Uint8Array, iprp: Box): Map<number, [number, number]> {
  const kids = boxes(b, iprp.body, iprp.end);
  need(kids !== null);
  const ipco = kids?.find((k) => k.type === 'ipco'), ipmas = kids?.filter((k) => k.type === 'ipma') ?? [];
  need(ipco !== undefined && ipmas.length > 0);
  const props = ipco ? boxes(b, ipco.body, ipco.end) : null;
  need(props !== null);
  const out = new Map<number, [number, number]>();
  for (const ipma of ipmas) {
    const v = b[ipma.body], wideIndex = (b[ipma.body + 3] & 1) === 1;
    need(ipma.body + 8 <= ipma.end);
    const count = u32(b, ipma.body + 4);
    need(count <= MAX_ENTRIES);
    let i = ipma.body + 8;
    for (let k = 0; k < count; k++) {
      const idLen = v < 1 ? 2 : 4;
      need(i + idLen + 1 <= ipma.end);
      const id = v < 1 ? u16(b, i) : u32(b, i), n = b[i + idLen];
      i += idLen + 1;
      for (let a = 0; a < n; a++) {
        need(i + (wideIndex ? 2 : 1) <= ipma.end);
        const index = wideIndex ? u16(b, i) & 0x7fff : b[i] & 0x7f;
        i += wideIndex ? 2 : 1;
        const p = index > 0 ? props?.[index - 1] : undefined;
        if (p?.type !== 'ispe') continue;
        need(p.body + 12 <= p.end);
        out.set(id, [u32(b, p.body + 4), u32(b, p.body + 8)]);
      }
    }
  }
  return out;
}

const fits = (w: number, h: number): boolean => {
  const L = ALLEGATI_LIMITS;
  return w > 0 && h > 0 && w <= L.maxSidePx && h <= L.maxSidePx && w * h <= L.maxPixels;
};

/**
 * What a HEIF image file holds for the conversion, or why it is refused: 'type' (no image the product decodes: AVIF and
 * the other codecs), 'structure' (a box running past its parent, no `meta`/`pitm`/`iinf`/`ipma`, an image item without
 * its size, a primary that is not a top-level image, more than HEIC_MAX_IMAGES of them), 'dimensions' (an image item
 * past 40 megapixels or 12 000 px a side). Null when the bytes are not a HEIF file at all.
 */
export function sniffHeic(b: Uint8Array): HeicSniff | null {
  if (!isHeif(b)) return null;
  try {
    return walk(b);
  } catch (e) {
    if (e instanceof Bad) return { ok: false, reason: e.reason };
    throw e;
  }
}

function walk(b: Uint8Array): HeicSniff {
  const top = boxes(b, 0, b.length);
  need(top !== null && top[0]?.type === 'ftyp');
  const meta = top?.find((x) => x.type === 'meta');
  need(meta !== undefined);
  const kids = meta ? boxes(b, meta.body + 4, meta.end) : null;
  need(kids !== null);
  const pick = (t: string): Box | undefined => kids?.find((k) => k.type === t);
  const pitm = pick('pitm'), iinf = pick('iinf'), iprp = pick('iprp'), iref = pick('iref');
  need(pitm !== undefined && iinf !== undefined && iprp !== undefined);
  if (!pitm || !iinf || !iprp) throw new Bad('structure');
  need(pitm.body + 6 <= pitm.end);
  const primaryId = b[pitm.body] === 0 ? u16(b, pitm.body + 4) : u32(b, pitm.body + 4);
  const all = items(b, iinf);
  if (all.some((x) => OTHER_IMAGES.has(x.type)) && !all.some((x) => IMAGE_TYPES.has(x.type))) return { ok: false, reason: 'type' };
  const images = all.filter((x) => IMAGE_TYPES.has(x.type));
  if (images.length === 0) return { ok: false, reason: 'type' };
  // the primary of another codec (an AVIF with a HEVC thumbnail): not a HEIC
  if (all.some((x) => x.id === primaryId && OTHER_IMAGES.has(x.type))) return { ok: false, reason: 'type' };
  const size = sizes(b, iprp);
  for (const x of images) {
    const s = size.get(x.id);
    need(s !== undefined);
    if (s && !fits(s[0], s[1])) return { ok: false, reason: 'dimensions' };
  }
  const refs = iref ? references(b, iref) : [];
  const notTop = new Set(refs.filter((r) => r.type === 'thmb' || r.type === 'auxl').map((r) => r.from));
  const topLevel = images.filter((x) => !x.hidden && !notTop.has(x.id)).sort((p, q) => p.id - q.id);
  const primary = topLevel.findIndex((x) => x.id === primaryId);
  need(primary >= 0 && topLevel.length <= HEIC_MAX_IMAGES);
  const [width, height] = size.get(primaryId) ?? [0, 0];
  return { ok: true, width, height, images: topLevel.length, primary };
}
