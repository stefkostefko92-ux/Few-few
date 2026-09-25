// Quality tiers and the frame-time governor that holds the frame rate at 60 fps or better
// by moving the internal render resolution instead of switching effects off.

// Every tier keeps temporal AA (TRAA), bloom and the film grade; the screen-space passes stack on
// top. csm: cascaded moon shadows (chosen at load). texSize/texHero cap the baked texture
// resolution (VRAM budget, chosen at load).
export const QUALITY = {
  low: { gtao: false, ssgi: false, ssr: false, contact: false, godrays: false, csm: false, motionBlur: 0, dof: false, streaks: false, reflections: false, rain: 7000, maxDPR: 1.0, shadow: false, texSize: 1024, texHero: 2048 },
  high: { gtao: true, ssgi: false, ssr: true, contact: false, godrays: false, csm: true, motionBlur: 8, dof: true, streaks: true, reflections: true, rain: 14000, maxDPR: 1.25, shadow: true, texSize: 1024, texHero: 2048 },
  ultra: { gtao: false, ssgi: true, ssr: true, contact: true, godrays: true, csm: true, motionBlur: 16, dof: true, streaks: true, reflections: true, rain: 22000, maxDPR: 1.5, shadow: true, texSize: 2048, texHero: 4096 },
};

// Phones and small screens start on the light tier; the governor refines from there.
export function initialTier(coarsePointer, shortestScreenSide) {
  return coarsePointer || shortestScreenSide < 700 ? 'low' : 'high';
}

// A frame slower than `budgetMs` is a missed 60 Hz refresh (with a little slack for jitter).
// Too many misses in the window lowers the scale by 15%; a clean window raises it by 8%,
// but not back above a scale that just failed until `holdMs` has passed.
export function createGovernor({ budgetMs = 19.5, windowSize = 40, minScale = 0.5, warmupMs = 3000, holdMs = 20000 } = {}) {
  const g = { scale: 1, samples: [], lastChange: 0, ceiling: 1, ceilingUntil: 0, since: 0 };
  return {
    get scale() {
      return g.scale;
    },
    reset(nowMs) {
      g.scale = 1;
      g.samples.length = 0;
      g.since = nowMs;
      g.ceiling = 1;
      g.ceilingUntil = 0;
    },
    // Returns true when the scale changed and the render targets must be resized.
    sample(dtMs, nowMs) {
      if (dtMs > 250 || nowMs - g.since < warmupMs) return false;
      g.samples.push(dtMs);
      if (g.samples.length > windowSize) g.samples.shift();
      if (g.samples.length < windowSize * 0.75 || nowMs - g.lastChange < 1200) return false;
      const slow = g.samples.filter((d) => d > budgetMs).length / g.samples.length;
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
  };
}
