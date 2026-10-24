import { describe, expect, it } from "vitest";
import { HOP_MS, MAX_FRAME_MS, advanceWalk, frameDt } from "./anim";

describe("Магнат — анимацията на пула следва стенния часовник", () => {
  const framesToFinish = (segments: number, dt: number) => {
    const w = { seg: 0, t: 0 };
    let frames = 0;
    while (!advanceWalk(w, segments, dt)) frames++;
    return frames + 1;
  };

  it("при 60 fps 10 полета отнемат ~10 × HOP_MS", () => {
    expect(framesToFinish(10, 16) * 16).toBeGreaterThanOrEqual(10 * HOP_MS);
    expect(framesToFinish(10, 16) * 16).toBeLessThan(10 * HOP_MS + 32);
  });

  it("при бавен рендер (секунда на кадър) разходката свършва за 2 кадъра, не за минути", () => {
    expect(framesToFinish(10, frameDt(5_000, 4_000))).toBeLessThanOrEqual(2);
  });

  it("след скрит раздел кадърът е с таван — без огромен скок", () => {
    expect(frameDt(120_000, 1_000)).toBe(MAX_FRAME_MS);
    expect(frameDt(1_016, 1_000)).toBe(16);
    expect(frameDt(500, 0)).toBe(16); // първи кадър
  });
});
