// The lettering font of an SVG sheet: DejaVu Sans (the font the PDF is drawn with and the kernel measures with), cut to
// the glyphs the sheet uses, as a standalone TrueType file a browser takes from an @font-face. fontkit (the one pdf-lib
// embeds with) cuts the outlines — composite glyphs with their parts, the hinting kept — but writes only what a PDF
// needs (no cmap, OS/2, name or post): those are added here, the character map built for the subset, the others taken
// from the font (the names only those in Windows' Unicode records, the copyright and the licence among them: the
// Bitstream Vera licence of DejaVu wants its notice in every copy), and the file assembled again with its checksums.
// Pure and deterministic: the same glyphs give the same bytes; the font's bytes come from the caller (the server reads
// them from REPORT_FONT_DIR: server/svg-export.ts).
import fontkit, { type Font, type Subset } from '@pdf-lib/fontkit';

type Tables = Map<string, Uint8Array>;

/** The tables of a TrueType file by tag. */
function readTables(b: Uint8Array): Tables {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength), n = v.getUint16(4), out: Tables = new Map();
  for (let i = 0; i < n; i++) {
    const at = 12 + 16 * i, tag = String.fromCharCode(b[at] ?? 0, b[at + 1] ?? 0, b[at + 2] ?? 0, b[at + 3] ?? 0);
    const offset = v.getUint32(at + 8), length = v.getUint32(at + 12);
    if (offset + length > b.byteLength) throw new Error(`font table ${tag} out of the file`);
    out.set(tag, b.subarray(offset, offset + length));
  }
  return out;
}

const pad4 = (n: number): number => (n + 3) & ~3;

/** The sum of a table as big-endian 32-bit words (zero-padded to a word). */
function checksum(b: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < b.length; i += 4) sum = (sum + (((b[i] ?? 0) << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0))) >>> 0;
  return sum;
}

/** A TrueType file of `tables`, in the order of their tags, with its directory, checksums and head's adjustment. */
function writeFont(tables: Tables): Uint8Array {
  const tags = [...tables.keys()].sort(), n = tags.length;
  let pow = 1;
  while (pow * 2 <= n) pow *= 2;
  let size = 12 + 16 * n;
  for (const t of tags) size += pad4(tables.get(t)?.length ?? 0);
  const out = new Uint8Array(size), v = new DataView(out.buffer);
  v.setUint32(0, 0x00010000);
  v.setUint16(4, n);
  v.setUint16(6, pow * 16);
  v.setUint16(8, Math.log2(pow));
  v.setUint16(10, n * 16 - pow * 16);
  let at = 12 + 16 * n, head = -1;
  tags.forEach((tag, i) => {
    const data = tables.get(tag) ?? new Uint8Array(0), rec = 12 + 16 * i;
    for (let k = 0; k < 4; k++) out[rec + k] = tag.charCodeAt(k);
    out.set(data, at);
    // head's sum is taken with its adjustment at 0
    if (tag === 'head') { head = at; v.setUint32(at + 8, 0); }
    v.setUint32(rec + 4, checksum(out.subarray(at, at + pad4(data.length))));
    v.setUint32(rec + 8, at);
    v.setUint32(rec + 12, data.length);
    at += pad4(data.length);
  });
  if (head >= 0) v.setUint32(head + 8, (0xb1b0afba - checksum(out)) >>> 0);
  return out;
}

/** The character map of the subset: format 4 (the BMP), each run of characters with consecutive glyphs one segment,
 *  for Unicode (0, 3) and Windows (3, 1). */
function cmapTable(map: readonly (readonly [number, number])[]): Uint8Array {
  const segs: [number, number, number][] = [];
  for (const [cp, gid] of map) {
    const last = segs[segs.length - 1];
    if (last && cp === last[1] + 1 && gid - cp === last[2]) last[1] = cp;
    else segs.push([cp, cp, gid - cp]);
  }
  segs.push([0xffff, 0xffff, 1]);
  const segX2 = segs.length * 2, len = 16 + segs.length * 8, out = new Uint8Array(20 + len), v = new DataView(out.buffer);
  let pow = 1;
  while (pow * 2 <= segs.length) pow *= 2;
  v.setUint16(2, 2);
  v.setUint16(4, 0); v.setUint16(6, 3); v.setUint32(8, 20);
  v.setUint16(12, 3); v.setUint16(14, 1); v.setUint32(16, 20);
  v.setUint16(20, 4);
  v.setUint16(22, len);
  v.setUint16(26, segX2);
  v.setUint16(28, pow * 2);
  v.setUint16(30, Math.log2(pow));
  v.setUint16(32, segX2 - pow * 2);
  segs.forEach(([start, end, delta], i) => {
    v.setUint16(34 + 2 * i, end);
    v.setUint16(36 + segX2 + 2 * i, start);
    v.setUint16(36 + 2 * segX2 + 2 * i, delta & 0xffff);
  });
  return out;
}

/** The names the subset keeps: copyright, family, style, identifier, full name, version, PostScript name, licence and
 *  its address. */
const NAMES = new Set([0, 1, 2, 3, 4, 5, 6, 13, 14]);

/** The font's name records in Windows' Unicode encoding (3, 1, US English) among `NAMES`, as a name table. */
function nameTable(name: Uint8Array): Uint8Array {
  const v = new DataView(name.buffer, name.byteOffset, name.byteLength), count = v.getUint16(2), base = v.getUint16(4);
  const keep: { id: number; bytes: Uint8Array }[] = [];
  for (let i = 0; i < count; i++) {
    const r = 6 + 12 * i, id = v.getUint16(r + 6), length = v.getUint16(r + 8), offset = v.getUint16(r + 10);
    if (v.getUint16(r) === 3 && v.getUint16(r + 2) === 1 && v.getUint16(r + 4) === 0x409 && NAMES.has(id)) keep.push({ id, bytes: name.subarray(base + offset, base + offset + length) });
  }
  keep.sort((a, b) => a.id - b.id);
  const head = 6 + 12 * keep.length, out = new Uint8Array(head + keep.reduce((s, k) => s + k.bytes.length, 0)), w = new DataView(out.buffer);
  w.setUint16(2, keep.length);
  w.setUint16(4, head);
  let at = 0;
  keep.forEach((k, i) => {
    const r = 6 + 12 * i;
    w.setUint16(r, 3); w.setUint16(r + 2, 1); w.setUint16(r + 4, 0x409); w.setUint16(r + 6, k.id); w.setUint16(r + 8, k.bytes.length); w.setUint16(r + 10, at);
    out.set(k.bytes, head + at);
    at += k.bytes.length;
  });
  return out;
}

/** post version 3: the font's angle, underline and pitch, no glyph names. */
function postTable(post: Uint8Array): Uint8Array {
  const out = new Uint8Array(32);
  out.set(post.subarray(4, 16), 4);
  new DataView(out.buffer).setUint32(0, 0x00030000);
  return out;
}

/** OS/2 as the font has it, with the first and last character of the subset. */
function os2Table(os2: Uint8Array, first: number, last: number): Uint8Array {
  const out = os2.slice(), v = new DataView(out.buffer);
  v.setUint16(64, first);
  v.setUint16(66, last);
  return out;
}

/** The parsed fonts by their bytes: a font is read once (lazily, fontkit reads a table when asked). */
const parsed = new WeakMap<Uint8Array, Font>();

/** The subset's bytes as fontkit writes them (its stream ends on the next tick). */
const encoded = (s: Subset): Promise<Uint8Array> => new Promise((resolve) => {
  const parts: Uint8Array[] = [];
  s.encodeStream().on('data', (d) => { parts.push(d); }).on('end', () => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    resolve(out);
  });
});

/**
 * DejaVu Sans (`ttf`, a TrueType file with a cmap) cut to the characters `codePoints` (those of the Basic Multilingual
 * Plane the font has; the others are left to the fallback fonts), with the glyph for a missing character: a standalone
 * TrueType file. The glyphs in the order of their characters, so the same set gives the same bytes whatever the order.
 */
export async function fontSubset(ttf: Uint8Array, codePoints: Iterable<number>): Promise<Uint8Array> {
  let font = parsed.get(ttf);
  if (!font) { font = fontkit.create(ttf); parsed.set(ttf, font); }
  const sub = font.createSubset(), map: [number, number][] = [];
  for (const cp of [...new Set(codePoints)].sort((a, b) => a - b)) {
    if (cp > 0xfffe || !font.hasGlyphForCodePoint(cp)) continue;
    map.push([cp, sub.includeGlyph(font.glyphForCodePoint(cp))]);
  }
  const own = readTables(ttf), tables = readTables(await encoded(sub));
  const name = own.get('name'), os2 = own.get('OS/2'), post = own.get('post');
  if (!name || !os2 || !post) throw new Error('the font lacks name, OS/2 or post');
  tables.set('cmap', cmapTable(map));
  tables.set('name', nameTable(name));
  tables.set('OS/2', os2Table(os2, map[0]?.[0] ?? 0x20, map[map.length - 1]?.[0] ?? 0x20));
  tables.set('post', postTable(post));
  return writeFont(tables);
}
