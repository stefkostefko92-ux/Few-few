// The drawing kernel's vocabulary. Paper primitives are in millimetres on the sheet, origin at the bottom-left corner,
// y up (like the PDF page); the renderers (SVG in the app, ReportLab in the PDF) only paint them. Model entities are in
// millimetres of the real object (plan or section, y up) and become paper primitives through a view with a scale.

export type Pt = readonly [number, number];

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Colours by role; the palette of the document maps them to values (one source for SVG and PDF). */
export type Ink = 'ink' | 'ink2' | 'muted' | 'axis' | 'space' | 'jamb' | 'concrete' | 'steel' | 'zinc' | 'car' | 'door' | 'cw' | 'paper' | 'accent' | 'dark';

export interface Stroke {
  ink: Ink;
  /** line width on paper [mm] */
  w: number;
  /** dash pattern on paper [mm] */
  dash?: readonly number[];
}

export type Fill =
  | { k: 'solid'; ink: Ink }
  /** a repeated tile of the document's patterns (e.g. the speckle of concrete) */
  | { k: 'pattern'; id: PatternId };

export type PatternId = 'concrete';

export type Align = 'l' | 'c' | 'r';

export interface TextShape {
  t: 'text';
  /** anchor on the baseline: left end, middle or right end by `align` */
  at: Pt;
  text: string;
  /** font size (em) on paper [mm] */
  size: number;
  /** degrees, counter-clockwise */
  angle?: number;
  align?: Align;
  bold?: boolean;
  ink?: Ink;
  /** horizontally condensed, like the lettering of technical drawings */
  cond?: boolean;
  /** a band of paper under the letters, over the lines they cross */
  halo?: boolean;
}

export type Shape =
  | { t: 'line'; a: Pt; b: Pt; s: Stroke }
  | { t: 'path'; pts: readonly Pt[]; closed: boolean; s?: Stroke; fill?: Fill }
  | { t: 'circle'; c: Pt; r: number; s?: Stroke; fill?: Fill }
  /** arc from a0 to a1 degrees, counter-clockwise */
  | { t: 'arc'; c: Pt; r: number; a0: number; a1: number; s: Stroke }
  | TextShape
  /** a logo (the company's, the client's), fitted inside the box keeping its proportions */
  | { t: 'image'; ref: ImageRef; box: Box };

export type ImageRef = 'logo' | 'client';
export type SheetImage = { mime: 'image/png' | 'image/jpeg'; data: string };

export interface Page {
  /** sheet size [mm] */
  w: number;
  h: number;
  shapes: Shape[];
}

export interface Pattern {
  w: number;
  h: number;
  shapes: Shape[];
}

export interface DrawingDoc {
  meta: { title: string; subject: string; author: string };
  palette: Readonly<Record<Ink, string>>;
  patterns: Readonly<Record<PatternId, Pattern>>;
  /** horizontal scale of condensed lettering */
  cond: number;
  images: Partial<Record<ImageRef, SheetImage>>;
  pages: Page[];
}
