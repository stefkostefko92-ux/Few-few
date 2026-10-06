// Cross-stitch (кръстат бод) — the one visual idea of the site, drawn by code.
// Pure geometry, no DOM: the server renders the motifs as SVG, the browser draws
// the same stitch on a canvas (hero photo, alphabet). Unit-tested in
// __tests__/stitch.test.ts.

/** Thread colours, named the way an embroiderer would ask for them. */
export const THREAD = {
  red: "#b3171d",
  wine: "#7a0e12",
  black: "#1c1917",
  linen: "#f1ece2",
  green: "#1f5e3b",
  gold: "#c8932f",
} as const;

export type Cell = { x: number; y: number; c: string };
export type Motif = { w: number; h: number; cells: Cell[] };

/**
 * The eight-pointed star (осмолъчна звезда) of Bulgarian embroidery: the union
 * of a square and the same square turned 45°, so four points come from the
 * corners and four from the tips. `a` is the square's half-side in stitches.
 */
export function star(a: number, body: string = THREAD.red, heart: string = THREAD.black): Motif {
  const b = Math.round(a * Math.SQRT2);
  const inside = (x: number, y: number) => Math.max(Math.abs(x), Math.abs(y)) <= a || Math.abs(x) + Math.abs(y) <= b;
  const cells: Cell[] = [];
  for (let y = -b; y <= b; y++) {
    for (let x = -b; x <= b; x++) {
      if (!inside(x, y)) continue;
      const d = Math.abs(x) + Math.abs(y);
      const edge = !inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1);
      let c: string | null = null;
      if (edge) c = body;
      else if (d === a - 1) c = heart; // the dark rhombus inside
      else if (d <= Math.max(0, a - 4)) c = body; // and its red heart
      if (c) cells.push({ x: x + b, y: y + b, c });
    }
  }
  return { w: 2 * b + 1, h: 2 * b + 1, cells };
}

/**
 * One repeat of the border band: a chain of rhombi (the oldest motif, a sown
 * field) joined by small black crosses, between two lines of running stitch.
 */
export function bandTile(): Motif {
  const w = 14, h = 11, cx = 7, cy = 5;
  const cells: Cell[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.abs(x - cx) + Math.abs(y - cy);
      let c: string | null = null;
      if ((y === 0 || y === h - 1) && x % 2 === 0) c = THREAD.red;
      else if (d === 4) c = THREAD.red;
      else if (d === 2) c = THREAD.black;
      else if (d === 0) c = THREAD.red;
      else if (y === cy && (x === 0 || x === 1 || x === w - 1)) c = THREAD.black;
      else if (x === 0 && Math.abs(y - cy) === 1) c = THREAD.black;
      if (c) cells.push({ x, y, c });
    }
  }
  return { w, h, cells };
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
