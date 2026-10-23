// The drawings as SVG files to download: every page of a document (an issued set, a draft) one file, a single page as
// it is, more pages in a ZIP (stored, dated as the record: every download gives the same bytes); a view alone (the plan
// of a shaft design) on a paper of its own size at its scale, with the lines its DXF writes under it. Each file embeds
// the glyphs of DejaVu Sans it letters (svg-font.ts), from the font files the caller passes (the server's
// REPORT_FONT_DIR); without them the file names the usual fonts only. Pure: no clock, no I/O.
import { moveShapes, shapeBox, union, type DrawingDoc, type Shape } from '@/drawing';
import { zipStore } from '../order/zip';
import { laidOut, viewCaption, type CadView } from './export';
import { fontSubset } from './svg-font';
import { SVG_MIME, lettering, shapesSvg, type SvgArt, type SvgFonts, type SvgHead } from './svg';

export const ZIP_MIME = 'application/zip';

/** DejaVu Sans as its files are: regular and bold. */
export interface DejaVu {
  regular: Uint8Array;
  bold: Uint8Array;
}

export interface SvgFile {
  body: Uint8Array<ArrayBuffer>;
  mime: string;
  name: string;
}

/** The subsets a sheet needs: a weight it does not letter is left out. */
async function fontsFor(shapes: readonly Shape[], notice: boolean, fonts: DejaVu | null): Promise<SvgFonts> {
  if (!fonts) return {};
  const used = lettering(shapes, notice);
  return {
    ...(used.regular.size ? { regular: await fontSubset(fonts.regular, used.regular) } : {}),
    ...(used.bold.size ? { bold: await fontSubset(fonts.bold, used.bold) } : {}),
  };
}

/** A sheet as an SVG text with its fonts. */
export async function sheetSvg(shapes: readonly Shape[], w: number, h: number, art: SvgArt, head: SvgHead, fonts: DejaVu | null): Promise<string> {
  return shapesSvg(shapes, w, h, art, head, await fontsFor(shapes, head.notice === true, fonts));
}

const utf8 = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);

export interface DocSvgOptions {
  /** the file's name without its extension (`<base>.svg`, or `<base>-svg.zip` with `<base>-foglio-NN.svg` in it) */
  base: string;
  /** what the drawing is, its number, revision and hash: each sheet's description */
  desc: readonly string[];
  /** the record's date: the archive's entries are dated with it */
  date: Date;
  fonts: DejaVu | null;
}

/** Every page of `doc` as an SVG file (as its PDF draws them, with the PDF's line under the frame): one page, its file;
 *  more, a ZIP of them in their order. */
export async function docSvgFile(doc: DrawingDoc, o: DocSvgOptions): Promise<SvgFile> {
  const n = doc.pages.length, nn = (i: number): string => String(i + 1).padStart(2, '0');
  const pages = await Promise.all(doc.pages.map(async (p, i) => utf8(await sheetSvg(p.shapes, p.w, p.h, doc, {
    id: `f${nn(i)}`, title: `${doc.meta.title} · Foglio ${i + 1} di ${n}`, desc: o.desc, notice: true,
  }, o.fonts))));
  const [one] = pages;
  if (n === 1 && one) return { body: one, mime: SVG_MIME, name: `${o.base}.svg` };
  const zip = zipStore(pages.map((data, i) => ({ name: `${o.base}-foglio-${nn(i)}.svg`, data })), o.date);
  return { body: new Uint8Array(zip), mime: ZIP_MIME, name: `${o.base}-svg.zip` };
}

/** Paper around a view and the lines under it [mm]. */
const MARGIN = 10;

/** A view (CAD's: its entities at its scale, its sheet's notes) on a paper of its own size, laid out as the DXF lays it
 *  out, with the lines the DXF writes under it (its title, the scale, then `under`). */
export function viewPaper(v: CadView, under: readonly string[]): { shapes: Shape[]; w: number; h: number } {
  const { parts, notes, extent } = laidOut(v), lines = viewCaption(v, extent, under);
  const all: Shape[] = [...parts.flat(), ...notes, ...lines];
  let box = extent;
  for (const s of lines) box = union(box, shapeBox(s));
  return { shapes: moveShapes(all, MARGIN - box.x0, MARGIN - box.y0), w: box.x1 - box.x0 + 2 * MARGIN, h: box.y1 - box.y0 + 2 * MARGIN };
}

/** A view alone as an SVG file (`name`), drawn in `art` (the kernel's palette and patterns). */
export async function viewSvgFile(v: CadView, art: SvgArt, o: { name: string; under: readonly string[]; fonts: DejaVu | null }): Promise<SvgFile> {
  const p = viewPaper(v, o.under);
  const svg = await sheetSvg(p.shapes, p.w, p.h, art, { id: 'v', title: v.title, desc: [v.title, ...o.under] }, o.fonts);
  return { body: utf8(svg), mime: SVG_MIME, name: o.name };
}
