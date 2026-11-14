/**
 * Frame-time governor, ported from boy/src/quality.js: holds the page at 60 fps
 * by moving the INTERNAL resolution of the hall backdrop instead of switching
 * effects off. Too many missed refreshes in the window lower the scale by 15%;
 * a clean window raises it by 8%, but never straight back above a scale that
 * just failed until `holdMs` has passed. Pure logic — unit-tested.
 */
export interface GovernorOpts {
  budgetMs?: number;
  windowSize?: number;
  minScale?: number;
  warmupMs?: number;
  holdMs?: number;
}

export interface Governor {
  readonly scale: number;
  reset(nowMs: number): void;
  /** Feed one frame interval. Returns true when the scale changed. */
  sample(dtMs: number, nowMs: number): boolean;
}

export function createGovernor({
  budgetMs = 19.5,
  windowSize = 40,
  minScale = 0.5,
  warmupMs = 3000,
  holdMs = 20000,
}: GovernorOpts = {}): Governor {
  let scale = 1;
  let samples: number[] = [];
  let lastChange = 0;
  let ceiling = 1;
  let ceilingUntil = 0;
  let since = 0;
  return {
    get scale() {
      return scale;
    },
    reset(nowMs) {
      scale = 1;
      samples = [];
      since = nowMs;
      ceiling = 1;
      ceilingUntil = 0;
    },
    sample(dtMs, nowMs) {
      if (dtMs > 250 || nowMs - since < warmupMs) return false;
      samples.push(dtMs);
      if (samples.length > windowSize) samples.shift();
      if (samples.length < windowSize * 0.75 || nowMs - lastChange < 1200) return false;
      const slow = samples.filter((d) => d > budgetMs).length / samples.length;
      if (slow > 0.12 && scale > minScale) {
        ceiling = scale;
        ceilingUntil = nowMs + holdMs;
        scale = Math.max(minScale, scale * 0.85);
      } else if (slow === 0 && scale < 1 && (nowMs > ceilingUntil || scale * 1.08 < ceiling)) {
        scale = Math.min(1, scale * 1.08);
      } else return false;
      lastChange = nowMs;
      samples = [];
      return true;
    },
  };
}

/** Phones and small screens start light; the governor refines from there. */
export function initialPixelCap(coarsePointer: boolean, shortestSide: number): number {
  return coarsePointer || shortestSide < 700 ? 0.5 : 0.75;
}
