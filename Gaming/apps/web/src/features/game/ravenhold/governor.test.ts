import { describe, expect, it } from "vitest";
import { createGovernor, createStallDetector, initialPixelCap, shouldRender } from "./governor";

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

describe("createStallDetector — безнадеждно бавно рисуване спира анимацията", () => {
  const run = (d: ReturnType<typeof createStallDetector>, dt: number, n: number, t0: number): number => {
    let t = t0;
    for (let i = 0; i < n; i++) {
      t += dt;
      d.tick(t);
    }
    return t;
  };

  it("загряването (компилация на шейдъри) не се брои", () => {
    const d = createStallDetector();
    d.reset(0);
    run(d, 900, 3, 0); // 2.7 s бавни кадри — всички в загряването
    expect(d.stalled).toBe(false);
  });

  it("единично дълго спиране (смяна на раздела) не спира анимацията", () => {
    const d = createStallDetector();
    d.reset(0);
    let t = run(d, 16, 300, 0);
    t = run(d, 5000, 1, t);
    run(d, 16, 100, t);
    expect(d.stalled).toBe(false);
  });

  it("6 поредни кадъра над 250 ms след загряването → безнадеждно (и остава така)", () => {
    const d = createStallDetector();
    d.reset(0);
    const t = run(d, 16, 200, 0); // 3.2 s нормални кадри
    run(d, 400, 5, t); // бавни, но под секунда
    expect(d.stalled).toBe(false);
    expect(d.tick(t + 2400)).toBe(true);
    run(d, 16, 100, t + 2400);
    expect(d.stalled).toBe(true);
  });

  it("два поредни кадъра над секунда спират анимацията веднага, още в загряването", () => {
    const d = createStallDetector();
    d.reset(0);
    d.tick(10);
    d.tick(2500);
    expect(d.stalled).toBe(false); // един дълъг кадър може да е смяна на раздела
    expect(d.tick(5000)).toBe(true);
  });

  it("бърз кадър между бавните нулира серията", () => {
    const d = createStallDetector();
    d.reset(0);
    let t = run(d, 16, 200, 0);
    for (let i = 0; i < 10; i++) {
      t = run(d, 400, 4, t);
      t = run(d, 16, 1, t);
    }
    expect(d.stalled).toBe(false);
  });
});

describe("shouldRender — кога 3D ядрото рисува", () => {
  const base = { now: 10_000, lastAt: 9_990, lastCost: 0, force: false, stalled: false, idleMs: 66 };

  it("нормално: при промяна веднага, на празен ход през idleMs", () => {
    expect(shouldRender({ ...base, force: true })).toBe(true);
    expect(shouldRender(base)).toBe(false);
    expect(shouldRender({ ...base, lastAt: 9_900 })).toBe(true);
  });

  it("безнадеждно бавно: празният ход не рисува изобщо", () => {
    expect(shouldRender({ ...base, stalled: true, lastAt: 0 })).toBe(false);
  });

  it("безнадеждно бавно: промените се събират — най-много кадър на max(1 s, 2× цената)", () => {
    expect(shouldRender({ ...base, stalled: true, force: true, lastAt: 9_500 })).toBe(false);
    expect(shouldRender({ ...base, stalled: true, force: true, lastAt: 9_000 })).toBe(true);
    expect(shouldRender({ ...base, stalled: true, force: true, lastAt: 6_000, lastCost: 3_000 })).toBe(false);
    expect(shouldRender({ ...base, stalled: true, force: true, lastAt: 4_000, lastCost: 3_000 })).toBe(true);
  });
});
