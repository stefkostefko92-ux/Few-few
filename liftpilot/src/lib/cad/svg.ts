// The paper shapes of the drawing kernel as a standalone SVG 1.1 file: the same painting as the screen's
// (components/drawing/ShapesSvg.tsx — y turned upward, the arcs, the turned lettering, each text as wide as the kernel
// measured it with DejaVu Sans through textLength), written as a string, because a route handler cannot render React
// to markup. What a file needs and a page does not: the sheet's size in millimetres (it prints at its scale), its title
// and description (the drawing's number, revision and hash where the CAD files carry them), every text escaped and
// cleared of the characters XML forbids, the halos as a paper-coloured stroked copy under the letters (programs that
// ignore paint-order would paint the halo over them), the logos with both href and xlink:href, the concrete pattern only
// when a shape fills with it, no class or data attributes, and the font itself: DejaVu Sans cut to the sheet's glyphs
// (svg-font.ts), in an @font-face of the file's own style, the usual fonts after it. Pure: no clock, no I/O.
import { textWidth, type DrawingDoc, type Fill, type Shape, type Stroke, type TextShape } from '@/drawing';

export const SVG_MIME = 'image/svg+xml';

/** The family of the embedded subset, before the fonts a viewer may have. */
export const FONT_FAMILY = 'LiftPilotDejaVu';
const FALLBACK = "'DejaVu Sans', Verdana, 'Segoe UI', Arial, sans-serif";

/** The line under the frame of every sheet of the PDF (report/tavole.py NOTICE), outside the drawing and its hash. */
export const NOTICE = 'Elaborato generato con LiftPilot (software di Carbon Stealth VCC): da verificare e firmare dal tecnico incaricato, che ne risponde; quote e dati da confermare in sito e sui documenti dei costruttori.';
/** Where and how the PDF writes it: 8 mm from the left, 3,2 mm over the bottom edge, DejaVu Sans 5,2 pt, grey 0,38. */
const NOTICE_AT = [8, 3.2] as const, NOTICE_SIZE = (5.2 * 25.4) / 72, NOTICE_INK = '#616161';

/** What a sheet is painted with besides its shapes: the document's palette, patterns and logos. */
export type SvgArt = Pick<DrawingDoc, 'palette' | 'patterns' | 'images'>;

/** The subsets of DejaVu Sans the sheet embeds (regular and bold), each its glyphs only. */
export interface SvgFonts {
  regular?: Uint8Array;
  bold?: Uint8Array;
}

export interface SvgHead {
  /** prefix of the ids inside the file (the pattern's) */
  id: string;
  title: string;
  /** the lines of the description: what the drawing is, its number, revision and hash */
  desc: readonly string[];
  /** the PDF's line under the frame (the sheets of a set; not a view alone) */
  notice?: boolean;
}

const f2 = (x: number): string => (Math.round(x * 100) / 100).toString();

/** A text as XML 1.0 takes it: only the characters it allows (a control character or a lone surrogate dropped). */
export const xmlChars = (s: string): string => s.replace(/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu, '');

const ESC: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
/** A text escaped for an attribute or an element's content. */
export const esc = (s: string): string => xmlChars(s).replace(/[&<>"']/g, (c) => ESC[c] ?? c);

/** An id as XML takes it: letters, digits, '-' and '_', after a letter. */
const idOf = (s: string): string => `s${s.replace(/[^A-Za-z0-9_-]/g, '')}`;

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Bytes in base64 (btoa: the same in Node and the browser). */
function base64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The characters a sheet letters, regular and bold (as the file writes them), `notice` with the PDF's line. */
export function lettering(shapes: readonly Shape[], notice = false): { regular: Set<number>; bold: Set<number> } {
  const out = { regular: new Set<number>(), bold: new Set<number>() };
  const add = (text: string, bold: boolean): void => {
    for (const ch of xmlChars(text)) out[bold ? 'bold' : 'regular'].add(ch.codePointAt(0) ?? 32);
  };
  for (const s of shapes) if (s.t === 'text') add(s.text, s.bold === true);
  if (notice) add(NOTICE, false);
  return out;
}

const attrs = (a: Readonly<Record<string, string | number | undefined>>): string =>
  Object.entries(a).flatMap(([k, v]) => (v === undefined ? [] : [` ${k}="${esc(String(v))}"`])).join('');

/** The SVG text of a sheet `w` × `h` mm with `shapes` (paper millimetres, y up), standalone. */
export function shapesSvg(shapes: readonly Shape[], w: number, h: number, art: SvgArt, head: SvgHead, fonts: SvgFonts = {}): string {
  const P = art.palette, Y = (y: number): number => h - y, id = idOf(head.id), pattern = `${id}-concrete`;
  const pts = (p: readonly (readonly [number, number])[]): string => p.map(([x, y]) => `${f2(x)},${f2(Y(y))}`).join(' ');
  const stroke = (s?: Stroke) => (s ? { stroke: P[s.ink], 'stroke-width': s.w, 'stroke-dasharray': s.dash?.join(' ') } : { stroke: 'none' });
  const fill = (f?: Fill): string => (!f ? 'none' : f.k === 'solid' ? P[f.ink] : `url(#${pattern})`);
  const usesPattern = shapes.some((s) => (s.t === 'path' || s.t === 'circle') && s.fill?.k === 'pattern');
  const text = (s: TextShape, x: number, y: number, a: Readonly<Record<string, string | number | undefined>>): string =>
    `<text${attrs({
      x: f2(x), y: f2(y), 'font-size': f2(s.size), 'font-weight': s.bold ? 700 : 400, 'text-anchor': s.align === 'c' ? 'middle' : s.align === 'r' ? 'end' : 'start',
      textLength: f2(textWidth(s.text, { size: s.size, bold: s.bold, cond: s.cond })), lengthAdjust: 'spacingAndGlyphs',
      transform: s.angle ? `rotate(${-s.angle} ${f2(x)} ${f2(y)})` : undefined, ...a,
    })}>${esc(s.text)}</text>`;
  const one = (s: Shape): string => {
    switch (s.t) {
      case 'line':
        return `<line${attrs({ x1: f2(s.a[0]), y1: f2(Y(s.a[1])), x2: f2(s.b[0]), y2: f2(Y(s.b[1])), ...stroke(s.s) })}/>`;
      case 'path':
        return `<${s.closed ? 'polygon' : 'polyline'}${attrs({ points: pts(s.pts), fill: fill(s.fill), ...stroke(s.s) })}/>`;
      case 'circle':
        return `<circle${attrs({ cx: f2(s.c[0]), cy: f2(Y(s.c[1])), r: f2(s.r), fill: fill(s.fill), ...stroke(s.s) })}/>`;
      case 'arc': {
        const a0 = (s.a0 * Math.PI) / 180, a1 = (s.a1 * Math.PI) / 180, large = ((s.a1 - s.a0 + 360) % 360) > 180 ? 1 : 0;
        const p0 = [s.c[0] + s.r * Math.cos(a0), Y(s.c[1] + s.r * Math.sin(a0))], p1 = [s.c[0] + s.r * Math.cos(a1), Y(s.c[1] + s.r * Math.sin(a1))];
        return `<path${attrs({ d: `M${f2(p0[0] ?? 0)} ${f2(p0[1] ?? 0)}A${f2(s.r)} ${f2(s.r)} 0 ${large} 0 ${f2(p1[0] ?? 0)} ${f2(p1[1] ?? 0)}`, fill: 'none', ...stroke(s.s) })}/>`;
      }
      case 'text': {
        const x = s.at[0], y = Y(s.at[1]), ink = P[s.ink ?? 'ink'];
        // the halo: a copy of the letters stroked in the paper's colour, under them
        const halo = s.halo ? text(s, x, y, { fill: P.paper, stroke: P.paper, 'stroke-width': 0.9, 'stroke-linejoin': 'round' }) : '';
        return halo + text(s, x, y, { fill: ink });
      }
      case 'image': {
        const img = art.images[s.ref];
        if (!img || !BASE64.test(img.data)) return '';
        const href = `data:${img.mime};base64,${img.data}`;
        return `<image${attrs({ href, 'xlink:href': href, x: f2(s.box.x0), y: f2(Y(s.box.y1)), width: f2(s.box.x1 - s.box.x0), height: f2(s.box.y1 - s.box.y0), preserveAspectRatio: 'xMidYMid meet' })}/>`;
      }
    }
  };
  const tile = art.patterns.concrete;
  // the tile in its own box, y up: aggregate triangles and dots
  const tileShapes = tile.shapes.map((s) => (s.t === 'path' ? `<polygon${attrs({ points: s.pts.map(([x, y]) => `${f2(x)},${f2(tile.h - y)}`).join(' '), fill: fill(s.fill) })}/>`
    : s.t === 'circle' ? `<circle${attrs({ cx: f2(s.c[0]), cy: f2(tile.h - s.c[1]), r: f2(s.r), fill: fill(s.fill) })}/>` : '')).join('');
  const faces = (['regular', 'bold'] as const).flatMap((k) => {
    const b = fonts[k];
    return b ? [`@font-face{font-family:${FONT_FAMILY};font-style:normal;font-weight:${k === 'bold' ? 700 : 400};src:url(data:font/ttf;base64,${base64(b)}) format('truetype')}`] : [];
  });
  const family = faces.length ? `${FONT_FAMILY}, ${FALLBACK}` : FALLBACK;
  const notice: TextShape = { t: 'text', at: [NOTICE_AT[0], NOTICE_AT[1]], text: NOTICE, size: NOTICE_SIZE };
  const defs = (faces.length ? `<style type="text/css">${faces.join('')}</style>` : '')
    // the tiles laid from the paper's bottom-left corner, as the PDF lays them (y = h: its origin in this y-down space)
    + (usesPattern ? `<pattern${attrs({ id: pattern, patternUnits: 'userSpaceOnUse', x: 0, y: f2(h), width: tile.w, height: tile.h })}>${tileShapes}</pattern>` : '');
  return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n'
    + `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1"${attrs({ width: `${f2(w)}mm`, height: `${f2(h)}mm`, viewBox: `0 0 ${f2(w)} ${f2(h)}`, preserveAspectRatio: 'xMidYMid meet' })}>\n`
    + `<title>${esc(head.title)}</title>\n<desc>${esc(head.desc.join('\n'))}</desc>\n`
    + (defs ? `<defs>${defs}</defs>\n` : '')
    + `<rect${attrs({ x: 0, y: 0, width: f2(w), height: f2(h), fill: P.paper })}/>\n`
    + `<g${attrs({ 'stroke-linejoin': 'round', 'font-family': family })}>\n${shapes.map(one).filter(Boolean).join('\n')}\n`
    + (head.notice ? `${text(notice, notice.at[0], Y(notice.at[1]), { fill: NOTICE_INK })}\n` : '')
    + '</g>\n</svg>\n';
}
