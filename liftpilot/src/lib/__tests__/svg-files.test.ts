// The SVG files (round 50): the embedded font is DejaVu Sans with only the sheet's glyphs (a well-formed TrueType file:
// its tables, checksums, a character map of exactly the letters used, the advances the kernel measures with), the same
// glyphs give the same bytes; a set's pages in a ZIP (stored, its entries in order with their CRC, dated as the record),
// one page alone as an .svg; two downloads of a record are the same bytes, in any time zone of the host; a shaft's plan
// on a paper of its size at 1:20 with every text of its DXF view and the lines under it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PALETTE, concreteTile, type Shape } from '@/drawing';
import { BOLD, REGULAR } from '@/drawing/metrics-data';
import { defaultInputs, layout } from '@/shaft';
import { laidOut, shaftPlanView } from '../cad/export';
import { fontSubset } from '../cad/svg-font';
import { ZIP_MIME, docSvgFile, sheetSvg, viewSvgFile } from '../cad/svg-files';
import { SVG_MIME, type SvgArt } from '../cad/svg';
import { crc32 } from '../order/zip';
import { buildTavole } from '../tavole/build';
import { SAMPLE_AT, svgSample } from './svg-fixture';
import { elements, parseXml, textOf } from './xml-check';

const dir = process.env.REPORT_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const FONTS = { regular: new Uint8Array(readFileSync(`${dir}/DejaVuSans.ttf`)), bold: new Uint8Array(readFileSync(`${dir}/DejaVuSans-Bold.ttf`)) };
const ART: SvgArt = { palette: PALETTE, patterns: { concrete: concreteTile() }, images: {} };
const HEAD = { id: 'x', title: 'Prova', desc: ['Prova'] };
const doc = buildTavole(svgSample()).doc;

/** The tables of a TrueType file, its checksums checked (each table's and the whole file's, head's adjustment). */
function sfnt(b: Uint8Array): Map<string, DataView> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength), n = v.getUint16(4), out = new Map<string, DataView>();
  const sum = (o: number, len: number): number => {
    let s = 0;
    for (let i = 0; i < len; i += 4) s = (s + (o + i + 4 <= b.length ? v.getUint32(o + i) : 0)) >>> 0;
    return s;
  };
  assert.equal(v.getUint32(0), 0x00010000);
  for (let i = 0; i < n; i++) {
    const r = 12 + 16 * i, tag = String.fromCharCode(...b.subarray(r, r + 4)), off = v.getUint32(r + 8), len = v.getUint32(r + 12);
    out.set(tag, new DataView(b.buffer, b.byteOffset + off, len));
    if (tag !== 'head') assert.equal(sum(off, (len + 3) & ~3), v.getUint32(r + 4), `checksum ${tag}`);
  }
  assert.equal(sum(0, b.length), 0xb1b0afba, 'checkSumAdjustment');
  return out;
}

/** The characters a format-4 character map maps, with their glyphs. */
function cmap(t: DataView): Map<number, number> {
  const sub = t.getUint32(8), segX2 = t.getUint16(sub + 6), out = new Map<number, number>();
  for (let i = 0; i < segX2 / 2; i++) {
    const end = t.getUint16(sub + 14 + 2 * i), start = t.getUint16(sub + 16 + segX2 + 2 * i), delta = t.getUint16(sub + 16 + 2 * segX2 + 2 * i);
    assert.equal(t.getUint16(sub + 16 + 3 * segX2 + 2 * i), 0);
    if (start === 0xffff) continue;
    for (let c = start; c <= end; c++) out.set(c, (c + delta) & 0xffff);
  }
  return out;
}

/** The embedded fonts of an SVG file by weight. */
const faces = (svg: string): Map<string, Uint8Array> =>
  new Map([...svg.matchAll(/font-weight:(\d+);src:url\(data:font\/ttf;base64,([A-Za-z0-9+/=]+)\)/g)].map((m) => [m[1] ?? '', new Uint8Array(Buffer.from(m[2] ?? '', 'base64'))]));

test('il carattere incorporato: DejaVu Sans con i soli glifi usati, file TrueType corretto, larghezze della metrica', async () => {
  const shapes: Shape[] = [
    { t: 'text', at: [5, 5], text: 'Già 1:20 — Ø 2,5 mm² 😀', size: 3 },
    { t: 'text', at: [5, 10], text: 'TAVOLE', size: 3, bold: true },
  ];
  const svg = await sheetSvg(shapes, 50, 20, ART, HEAD, FONTS), f = faces(svg);
  assert.deepEqual([...f.keys()], ['400', '700']);
  assert.ok(svg.includes('font-family="LiftPilotDejaVu, &apos;DejaVu Sans&apos;, Verdana'));
  for (const [w, text, metric] of [['400', 'Già 1:20 — Ø 2,5 mm² ', REGULAR], ['700', 'TAVOLE', BOLD]] as const) {
    const t = sfnt(f.get(w) ?? new Uint8Array());
    for (const tag of ['cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name', 'OS/2', 'post']) assert.ok(t.has(tag), `${w} ${tag}`);
    const map = cmap(t.get('cmap') ?? new DataView(new ArrayBuffer(0)));
    // exactly the letters used (the emoji is not in DejaVu Sans: left to the fallback fonts)
    assert.deepEqual([...map.keys()].sort((a, b) => a - b), [...new Set(text)].map((c) => c.codePointAt(0) ?? 0).sort((a, b) => a - b), w);
    const glyphs = t.get('maxp')?.getUint16(4) ?? 0;
    assert.ok(glyphs > map.size && glyphs < 40, `${w}: ${glyphs} glifi`);
    // each letter as wide as the kernel measures it (metrics-data, per 1000 units of the size)
    const upm = t.get('head')?.getUint16(18) ?? 0, hmtx = t.get('hmtx'), metrics = t.get('hhea')?.getUint16(34) ?? 0;
    for (const [c, g] of map) {
      const adv = hmtx?.getUint16(4 * Math.min(g, metrics - 1)) ?? 0;
      assert.ok(Math.abs((adv * 1000) / upm - (metric[c] ?? -1)) < 1, `${w} ${String.fromCodePoint(c)}`);
    }
  }
  // a sheet without bold letters embeds no bold face; without letters, no font at all
  assert.deepEqual([...faces(await sheetSvg([shapes[0] as Shape], 50, 20, ART, HEAD, FONTS)).keys()], ['400']);
  assert.ok(!(await sheetSvg([], 50, 20, ART, HEAD, FONTS)).includes('@font-face'));
  // without the font files: the usual fonts only
  assert.ok(!(await sheetSvg(shapes, 50, 20, ART, HEAD, null)).includes('LiftPilotDejaVu'));
  // the same glyphs, whatever their order: the same bytes
  const a = await fontSubset(FONTS.regular, [0x41, 0x7a, 0xe0]), b = await fontSubset(FONTS.regular, [0xe0, 0x41, 0x7a, 0x41]);
  assert.ok(Buffer.from(a).equals(Buffer.from(b)));
});

/** The entries of a stored ZIP: name, data, CRC and DOS date as its local headers have them. */
function unzip(z: Uint8Array): { name: string; data: Uint8Array; crc: number; time: number; date: number }[] {
  const v = new DataView(z.buffer, z.byteOffset, z.byteLength), out = [];
  for (let at = 0; v.getUint32(at, true) === 0x04034b50;) {
    assert.equal(v.getUint16(at + 8, true), 0, 'stored');
    const size = v.getUint32(at + 18, true), n = v.getUint16(at + 26, true), start = at + 30 + n;
    out.push({ name: new TextDecoder().decode(z.subarray(at + 30, start)), data: z.subarray(start, start + size), crc: v.getUint32(at + 14, true), time: v.getUint16(at + 10, true), date: v.getUint16(at + 12, true) });
    at = start + size;
  }
  return out;
}

test('i fogli di una serie: un archivio ZIP con un SVG per foglio, in ordine, CRC giusti, datato come il record', async () => {
  const f = await docSvgFile(doc, { base: 'tavole-26-037-R1', desc: ['DIS. N° 26-037 R1'], date: SAMPLE_AT, fonts: FONTS });
  assert.equal(f.mime, ZIP_MIME);
  assert.equal(f.name, 'tavole-26-037-R1-svg.zip');
  const entries = unzip(f.body);
  assert.deepEqual(entries.map((e) => e.name), doc.pages.map((_, i) => `tavole-26-037-R1-foglio-${String(i + 1).padStart(2, '0')}.svg`));
  const n = doc.pages.length;
  for (const [i, e] of entries.entries()) {
    assert.equal(e.crc, crc32(e.data), e.name);
    // 10:00 UTC on 8 October 2026
    assert.deepEqual([e.time, e.date], [(10 << 11), ((2026 - 1980) << 9) | (10 << 5) | 8]);
    const root = parseXml(new TextDecoder().decode(e.data)), all = elements(root);
    assert.equal(textOf(all.find((x) => x.name === 'title') ?? root), `${doc.meta.title} · Foglio ${i + 1} di ${n}`);
    assert.ok(textOf(all.filter((x) => x.name === 'text').at(-1) ?? root).startsWith('Elaborato generato con LiftPilot (software'));
  }
  // one page: the file itself
  const page = doc.pages[0];
  assert.ok(page);
  const one = await docSvgFile({ ...doc, pages: [page] }, { base: 'b', desc: [], date: SAMPLE_AT, fonts: null });
  assert.deepEqual([one.mime, one.name], [SVG_MIME, 'b.svg']);
  assert.ok(new TextDecoder().decode(one.body).startsWith('<?xml'));
});

test('la pianta del vano: la vista del DXF a 1:20 su un foglio della sua misura, con i suoi testi e le righe sotto', async () => {
  const L = layout(defaultInputs(1600, 1750)), v = shaftPlanView(L, 'Rossi & C. · progetto del vano');
  const f = await viewSvgFile(v, ART, { name: 'vano.svg', under: [], fonts: FONTS }), svg = new TextDecoder().decode(f.body);
  const root = parseXml(svg), texts = elements(root).filter((e) => e.name === 'text').map(textOf);
  const { parts, notes } = laidOut(v);
  for (const s of [...parts.flat(), ...notes]) if (s.t === 'text') assert.ok(texts.includes(s.text), s.text);
  assert.ok(texts.includes('Rossi & C. · progetto del vano') && texts.includes('Scala di stampa 1:20'));
  assert.ok(!texts.some((t) => t.startsWith('Elaborato generato')));
  const [, , w, h] = (root.attrs.viewBox ?? '').split(' ').map(Number);
  assert.equal(root.attrs.width, `${w}mm`);
  assert.equal(root.attrs.height, `${h}mm`);
  assert.ok((w ?? 0) > 1600 / 20 && (h ?? 0) > 1750 / 20);
});

test('due scaricamenti dello stesso record: gli stessi byte, anche in un altro fuso orario della macchina', async () => {
  const make = async (): Promise<Uint8Array> => (await docSvgFile(doc, { base: 'b', desc: ['x'], date: SAMPLE_AT, fonts: FONTS })).body;
  const first = await make();
  await new Promise((r) => setTimeout(r, 1100));
  assert.ok(Buffer.from(first).equals(Buffer.from(await make())));
  // an ordinary instant, and 02:30 UTC on the night Italy moves to summer time
  const dates = ['2026-10-08T10:00:00Z', '2026-03-29T02:30:00Z'];
  const run = (tz: string): unknown => {
    const r = spawnSync(process.execPath, ['--import', 'tsx', path.join(process.cwd(), 'src/lib/__tests__/svg-tz-child.ts'), ...dates], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.equal(r.status, 0, `${tz}: ${r.stderr}`);
    return JSON.parse(r.stdout);
  };
  const utc = run('UTC');
  assert.ok(Array.isArray(utc) && utc.length === 3 && new Set(utc).size === 3);
  for (const tz of ['Europe/Rome', 'America/New_York']) assert.deepEqual(run(tz), utc, tz);
});
