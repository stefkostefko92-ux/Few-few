import { describe, expect, it } from "vitest";
import { frameDue } from "./loopGate";

const idle = { active: false, dirty: false, sinceLastMs: 1000, idleIntervalMs: 66 };

describe("frameDue (цикълът на 3D масите)", () => {
  it("анимация или промяна → рисува винаги, и при намалено движение", () => {
    expect(frameDue({ ...idle, active: true, still: true })).toBe(true);
    expect(frameDue({ ...idle, dirty: true, still: true })).toBe(true);
  });

  it("празен ход с движещо се зърно → на интервала", () => {
    expect(frameDue({ ...idle, still: false })).toBe(true);
    expect(frameDue({ ...idle, still: false, sinceLastMs: 10 })).toBe(false);
  });

  it("празен ход при намалено движение → не прерисува същия кадър", () => {
    expect(frameDue({ ...idle, still: true })).toBe(false);
    expect(frameDue({ ...idle, still: true, sinceLastMs: 60_000 })).toBe(false);
  });
});
