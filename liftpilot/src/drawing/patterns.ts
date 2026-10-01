// The tile of the concrete speckle: small aggregate triangles and dots in orange, scattered by a seeded generator so
// that every document, preview and PDF, shows the same pattern.
import type { Pattern, Shape } from './types';

/** Mulberry32: small, fast, deterministic. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function concreteTile(size = 24, seed = 81): Pattern {
  const r = rng(seed), shapes: Shape[] = [], fill = { k: 'solid', ink: 'concrete' } as const;
  for (let i = 0; i < 70; i++) {
    // clear of the tile's edges, so that no mark is cut where the tiles meet
    const x = 0.9 + r() * (size - 1.8), y = 0.9 + r() * (size - 1.8);
    if (i % 3 === 0) {
      // aggregate: a small irregular triangle
      const s = 0.45 + r() * 0.55, a = r() * Math.PI * 2;
      const p = [0, 1, 2].map((k) => [x + s * Math.cos(a + (k * 2 * Math.PI) / 3 + (r() - 0.5) * 0.6), y + s * Math.sin(a + (k * 2 * Math.PI) / 3 + (r() - 0.5) * 0.6)] as const);
      shapes.push({ t: 'path', pts: p, closed: true, fill });
    } else {
      shapes.push({ t: 'circle', c: [x, y], r: 0.1 + r() * 0.14, fill });
    }
  }
  return { w: size, h: size, shapes };
}
