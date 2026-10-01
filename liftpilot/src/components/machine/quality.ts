// Quality tiers and the frame-time governor, after the combat engine of Nexus
// (Nexus/client/src/combat/engine/boy/src/quality.js): hold the frame rate by moving the internal render
// resolution, not by switching the look off.

export interface Quality {
  /** Temporal anti-aliasing (needs a few frames to settle). */
  traa: boolean;
  /** Ground-truth ambient occlusion (GTAO): the contact shadows where the parts meet; its resolution against the
   *  frame's and its samples. */
  ao: boolean;
  aoScale: number;
  aoSamples: number;
  bloom: boolean;
  shadowMap: number;
  /** the PCF filter's radius [shadow-map texels]: a finer map takes a wider one for the same soft edge */
  shadowRadius: number;
  /** device pixels per CSS pixel while something moves, at most (the governor scales it, from `startScale` up), and for
   *  a still picture (above the screen's own: supersampled, the browser scales it down) */
  maxDPR: number;
  stillDPR: number;
  startScale: number;
}

export const QUALITY = {
  low: { traa: true, ao: false, aoScale: 0.5, aoSamples: 8, bloom: false, shadowMap: 1024, shadowRadius: 1, maxDPR: 1, stillDPR: 1.5, startScale: 1 },
  high: { traa: true, ao: true, aoScale: 0.5, aoSamples: 12, bloom: true, shadowMap: 2048, shadowRadius: 1, maxDPR: 1.5, stillDPR: 2, startScale: 1 },
  ultra: { traa: true, ao: true, aoScale: 0.75, aoSamples: 16, bloom: true, shadowMap: 4096, shadowRadius: 2, maxDPR: 2, stillDPR: 2, startScale: 0.7 },
} as const satisfies Record<string, Quality>;

/** Phones and small screens start on the light tier; a large screen with a hardware WebGPU adapter on the top one. */
export function initialQuality(coarsePointer: boolean, shortestScreenSide: number, strongGpu = false): Quality {
  if (coarsePointer || shortestScreenSide < 700) return QUALITY.low;
  return strongGpu ? QUALITY.ultra : QUALITY.high;
}

export interface Governor {
  readonly scale: number;
  reset(nowMs: number): void;
  /** True when the scale changed and the drawing buffer must be resized. */
  sample(dtMs: number, nowMs: number): boolean;
  /** True when even the lowest scale misses the budget: the page falls back to the still picture. */
  readonly hopeless: boolean;
  /** Frames far over the budget (too slow to sample): straight to the lowest scale. True when the scale changed. */
  floor(nowMs: number): boolean;
}

// A frame slower than budgetMs is a missed 60 Hz refresh (with slack for jitter). Too many misses in the window
// lower the scale by 15 %; a clean window raises it by 8 % (from startScale, up to 1), but not back above a scale that
// just failed until holdMs has passed.
export function createGovernor({ budgetMs = 19.5, windowSize = 40, minScale = 0.5, warmupMs = 2500, holdMs = 20000, startScale = 1 } = {}): Governor {
  const g = { scale: startScale, samples: [] as number[], lastChange: 0, ceiling: 1, ceilingUntil: 0, since: 0, slowAtMin: 0 };
  return {
    get scale() {
      return g.scale;
    },
    get hopeless() {
      return g.slowAtMin >= 3;
    },
    reset(nowMs) {
      Object.assign(g, { scale: startScale, lastChange: 0, ceiling: 1, ceilingUntil: 0, since: nowMs, slowAtMin: 0 });
      g.samples.length = 0;
    },
    sample(dtMs, nowMs) {
      if (dtMs > 250 || nowMs - g.since < warmupMs) return false;
      g.samples.push(dtMs);
      if (g.samples.length > windowSize) g.samples.shift();
      if (g.samples.length < windowSize * 0.75 || nowMs - g.lastChange < 1200) return false;
      const slow = g.samples.filter((d) => d > budgetMs).length / g.samples.length;
      // Frames around 30 fps and below at the smallest scale, three windows in a row: give up.
      if (g.scale <= minScale && g.samples.filter((d) => d > 2 * budgetMs).length / g.samples.length > 0.5) g.slowAtMin += 1;
      if (slow > 0.12 && g.scale > minScale) {
        g.ceiling = g.scale;
        g.ceilingUntil = nowMs + holdMs;
        g.scale = Math.max(minScale, g.scale * 0.85);
      } else if (slow === 0 && g.scale < 1 && (nowMs > g.ceilingUntil || g.scale * 1.08 < g.ceiling)) {
        g.scale = Math.min(1, g.scale * 1.08);
      } else return false;
      g.lastChange = nowMs;
      g.samples.length = 0;
      return true;
    },
    floor(nowMs) {
      if (g.scale <= minScale) return false;
      Object.assign(g, { ceiling: g.scale, ceilingUntil: nowMs + holdMs, scale: minScale, lastChange: nowMs });
      g.samples.length = 0;
      return true;
    },
  };
}

/**
 * Readability grade by stage shape, after boy's mobile-grade.js: a narrow (portrait) stage on a phone gets a
 * little more exposure and a softer vignette. No state, so a rotation crossfades instead of popping.
 */
export function stageGrade(aspect: number): { exposure: number; vignette: number } {
  const portrait = Math.min(1, Math.max(0, (1.1 - aspect) / 0.5));
  return { exposure: 1.15 + portrait * 0.12, vignette: 0.34 - portrait * 0.1 };
}
