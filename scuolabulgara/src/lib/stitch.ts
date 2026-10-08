// Cross-stitch (кръстат бод) — the one visual idea of the site, drawn by code.
// Pure geometry, no DOM: the server renders the motifs as SVG, the browser draws
// the same stitch on a canvas (hero photo, alphabet). Unit-tested in
// __tests__/stitch.test.ts.

/** Thread colours, named the way an embroiderer would ask for them. */
export const THREAD = {
  red: "#b3171d",
  wine: "#7a0e12",
  black: "#1c1917",
  brown: "#3a1810",
  white: "#f4eee3",
  linen: "#f1ece2",
  green: "#1f5e3b",
  gold: "#c8932f",
} as const;

export type Cell = { x: number; y: number; c: string };
/** `outline`: the colour of a back-stitched contour around the motif, if any. */
export type Motif = { w: number; h: number; cells: Cell[]; outline?: string };

// ---------------------------------------------------------------------------
// Motifs of Divotino (Pernik, Shopluk), from a tablecloth of the 1930s.
// Transcribed stitch by stitch from photographs by Vassia Atanassova on
// Wikimedia Commons (Divotino-traditional-embroidery-1 and -5, CC BY-SA 3.0):
// a grid fitted to the stitches, each cell's thread read off the photo, the
// nine rosettes on the cloth voted together, and the hand's small
// irregularities evened out by the motif's own symmetry. The designs are
// traditional; only the grids are ours. No generated geometry.
// ---------------------------------------------------------------------------

/** One letter per stitch: r red, v wine, w white, b brown, k black, "." bare cloth. */
const LETTER: Record<string, string> = { r: THREAD.red, v: THREAD.wine, w: THREAD.white, b: THREAD.brown, k: THREAD.black };

/** A motif from rows of letters, as an embroiderer reads a chart. */
export function fromChart(rows: readonly string[], outline?: string): Motif {
  const cells: Cell[] = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (LETTER[ch]) cells.push({ x, y, c: LETTER[ch] }); }));
  return { w: Math.max(...rows.map((r) => r.length)), h: rows.length, cells, outline };
}

/** The rosette: a wine-red heart with four white stitches, a red frame, two
 *  petals on every side, the whole contoured in black back-stitch. */
const ROSETTE = [
  "......r......r......",
  ".....rrr....rrr.....",
  ".....rrrr..rrrr.....",
  ".....rrrr..rrrr.....",
  "....rrrrrrrrrrrr....",
  ".rrrrrrrrrrrrrrrrrr.",
  "rrrrrrvvvvvvvvrrrrrr",
  ".rrrrrvvvvvvvvrrrrr.",
  "..rrrrvvwvvwvvrrrr..",
  "....rrvvvvvvvvrr....",
  "....rrvvvvvvvvrr....",
  "..rrrrvvwvvwvvrrrr..",
  ".rrrrrvvvvvvvvrrrrr.",
  "rrrrrrvvvvvvvvrrrrrr",
  ".rrrrrrrrrrrrrrrrrr.",
  "....rrrrrrrrrrrr....",
  ".....rrrr..rrrr.....",
  ".....rrrr..rrrr.....",
  ".....rrr....rrr.....",
  "......r......r......",
] as const;

export const rosette = (): Motif => fromChart(ROSETTE, THREAD.black);

/** One repeat of the border: red teeth hanging from a red line and dark-brown
 *  ones rising between them (вълчи зъби), closed by a second red line. The
 *  tooth is centred on the tile's edge, so the repeat joins without a seam. */
const BORDER = [
  "rrrrrrrrrrrrrr",
  "..............",
  "rrrrrr...rrrrr",
  "rrrrr.....rrrr",
  "rrrr.......rrr",
  "rrr....b....rr",
  "rr....bbb....r",
  "r....bbbbb....",
  "....bbbbbbb...",
  "..............",
  "rrrrrrrrrrrrrr",
] as const;

export const borderTile = (): Motif => fromChart(BORDER);

/** Back-stitch (назад бод): the dark contour Shopluk embroiderers sew round a
 *  motif — one short stitch along every cell edge where thread meets bare cloth,
 *  so it runs in the holes between the crosses and the linen. */
export function outlinePath(cells: Cell[], size: number): string {
  const on = new Set(cells.map((c) => `${c.x},${c.y}`));
  const bare = (x: number, y: number) => !on.has(`${x},${y}`);
  const r = (n: number) => Math.round(n * 100) / 100;
  const g = size * 0.1; // each stitch ends in a hole — the contour reads as stitches, not a drawn line
  const d: string[] = [];
  for (const { x, y } of cells) {
    const x0 = x * size, y0 = y * size, x1 = x0 + size, y1 = y0 + size;
    if (bare(x, y - 1)) d.push(`M${r(x0 + g)} ${r(y0)}L${r(x1 - g)} ${r(y0)}`);
    if (bare(x, y + 1)) d.push(`M${r(x0 + g)} ${r(y1)}L${r(x1 - g)} ${r(y1)}`);
    if (bare(x - 1, y)) d.push(`M${r(x0)} ${r(y0 + g)}L${r(x0)} ${r(y1 - g)}`);
    if (bare(x + 1, y)) d.push(`M${r(x1)} ${r(y0 + g)}L${r(x1)} ${r(y1 - g)}`);
  }
  return d.join("");
}

/** SVG path data for a set of stitches, one path per thread colour. Each stitch
 *  is the two legs of an X, inset so neighbouring stitches don't touch. */
export function stitchPaths(cells: Cell[], size: number, inset = size * 0.16): Record<string, string> {
  const by: Record<string, string[]> = {};
  const r = (n: number) => Math.round(n * 100) / 100;
  for (const { x, y, c } of cells) {
    const x0 = r(x * size + inset), y0 = r(y * size + inset);
    const x1 = r((x + 1) * size - inset), y1 = r((y + 1) * size - inset);
    (by[c] ||= []).push(`M${x0} ${y1}L${x1} ${y0}M${x0} ${y0}L${x1} ${y1}`);
  }
  return Object.fromEntries(Object.entries(by).map(([c, d]) => [c, d.join("")]));
}

// ---------------------------------------------------------------------------
// Turning a photograph into thread
// ---------------------------------------------------------------------------

/** The skein box: the colours a photo is re-embroidered with. A stitched area
 *  reads as embroidery only because the colours are few and saturated. */
export const SKEINS: [number, number, number][] = [
  [179, 23, 29], // red
  [122, 14, 18], // wine
  [221, 70, 58], // poppy
  [28, 25, 23], // black
  [78, 70, 64], // charcoal
  [241, 236, 226], // linen
  [214, 199, 176], // flax
  [200, 147, 47], // gold
  [215, 120, 50], // amber
  [31, 94, 59], // green
  [36, 64, 102], // indigo
  [216, 140, 140], // rose
  [139, 94, 64], // walnut
];

/** Nearest skein by the "redmean" distance — cheap and close to how the eye
 *  weighs colour differences, without a full Lab conversion. */
export function nearestSkein(r: number, g: number, b: number): [number, number, number] {
  let best = SKEINS[0], bestD = Infinity;
  for (const s of SKEINS) {
    const rm = (r + s[0]) / 2;
    const dr = r - s[0], dg = g - s[1], db = b - s[2];
    const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

/** Deterministic pseudo-random in [0,1) for a cell, so a resize redraws the
 *  same embroidery instead of a new random one. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth 1-D value noise, used to make the edge between photo and thread
 *  wander like a hand-stitched border instead of a ruler line. */
export function noise1(t: number, seed = 0): number {
  const i = Math.floor(t), f = t - i;
  const a = hash2(i, 0, seed), b = hash2(i + 1, 0, seed);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

/**
 * How likely a cell is to carry a stitch, by its place across the transition:
 * u = 0 at the outer edge (bare linen), u = 1 where the photo is whole.
 * Sparse at the outside, dense in the middle, thinning out over the photo.
 */
export function stitchChance(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  if (u < 0.32) return 0.06 + (u / 0.32) ** 2 * 0.86;
  if (u < 0.62) return 0.92;
  const t = (u - 0.62) / 0.38;
  return 0.92 * (1 - t) ** 1.6;
}
