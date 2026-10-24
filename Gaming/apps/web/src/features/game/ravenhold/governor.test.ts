import { describe, expect, it } from "vitest";
import { createGovernor, initialPixelCap } from "./governor";

/** Feed `n` frames of `dt` ms starting at `t0`; returns the time reached. */
function feed(g: ReturnType<typeof createGovernor>, dt: number, n: number, t0: number): number {
  let t = t0;
  for (let i = 0; i < n; i++) {
    t += dt;
    g.sample(dt, t);
  }
  return t;
}

describe("Рейвънхолд frame governor (ported from boy/src/quality.js)", () => {
  it("ignores the warm-up period", () => {
    const g = createGovernor();
    g.reset(0);
    feed(g, 40, 60, 0); // 2.4 s of slow frames, all inside the 3 s warm-up
    expect(g.scale).toBe(1);
  });

  it("lowers the internal resolution when frames miss the 60 Hz budget", () => {
    const g = createGovernor();
    g.reset(0);
    feed(g, 30, 200, 3000);
    expect(g.scale).toBeLessThan(1);
    expect(g.scale).toBeGreaterThanOrEqual(0.5); // never below minScale
  });

  it("recovers on a clean window, but not above a scale that just failed", () => {
    const g = createGovernor({ holdMs: 20000 });
    g.reset(0);
    // Exactly one full window of slow frames → exactly one drop (the window is
    // cleared on a change, so no stale slow samples leak into the next phase).
    const t = feed(g, 30, 30, 3000);
    const dropped = g.scale;
    expect(dropped).toBeCloseTo(0.85, 5);
    feed(g, 10, 400, t); // fast frames, still inside the 20 s hold
    expect(g.scale).toBeGreaterThan(dropped); // recovers in 8 % steps…
    expect(g.scale).toBeLessThan(1); // …but not back to the scale that just failed
  });

  it("drops a single long stall (tab switch) instead of reacting to it", () => {
    const g = createGovernor();
    g.reset(0);
    expect(g.sample(900, 5000)).toBe(false);
    expect(g.scale).toBe(1);
  });

  it("starts phones and small screens on the lighter pixel cap", () => {
    expect(initialPixelCap(true, 1080)).toBeLessThan(initialPixelCap(false, 1080));
    expect(initialPixelCap(false, 600)).toBeLessThan(initialPixelCap(false, 1080));
  });
});
