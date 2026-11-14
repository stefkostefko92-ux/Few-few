import { describe, expect, it } from "vitest";
import { ball, detCos, detSin, runShot } from "./cue.js";

/** |err| within ~1 ulp of `ref` (relative to its magnitude). */
const close = (got: number, ref: number): boolean =>
  Math.abs(got - ref) <= Math.max(Math.abs(ref) * 2.3e-16, 5e-324);

describe("detSin/detCos — посоката на удара е една и съща във всеки JS двигател", () => {
  it("в рамките на 1 ulp от Math.sin/Math.cos в [−π, π]", () => {
    for (let i = -40000; i <= 40000; i++) {
      const a = (i / 40000) * Math.PI * 1.0000037;
      if (!close(detSin(a), Math.sin(a)))
        throw new Error(`sin(${a}): ${detSin(a)} ≠ ${Math.sin(a)}`);
      if (!close(detCos(a), Math.cos(a)))
        throw new Error(`cos(${a}): ${detCos(a)} ≠ ${Math.cos(a)}`);
    }
  });

  it("и извън [−π, π] (клиентът може да прати всеки краен ъгъл)", () => {
    for (const a of [7.5, -20.25, 100.125, 1e4 + 0.5, -Math.PI * 3.5]) {
      expect(Math.abs(detSin(a) - Math.sin(a))).toBeLessThan(1e-12);
      expect(Math.abs(detCos(a) - Math.cos(a))).toBeLessThan(1e-12);
    }
  });

  it("точните ъгли дават точните стойности", () => {
    expect(detSin(0)).toBe(0);
    expect(detCos(0)).toBe(1);
    expect(detCos(Math.PI)).toBe(-1);
    expect(Math.abs(detSin(Math.PI / 2) - 1)).toBeLessThan(1e-16);
  });

  it("бялата тръгва точно по detCos/detSin — не по Math.cos/sin на двигателя", () => {
    // An angle where this engine's Math.cos/sin differ in the last bit makes
    // the check discriminating (about a quarter of all angles do in Node 22).
    const angles = Array.from({ length: 400 }, (_, i) => -3 + i * 0.015);
    const a = angles.find((x) => Math.cos(x) !== detCos(x) || Math.sin(x) !== detSin(x)) ?? 0.73;
    const f = runShot([ball(0, 1, 0.5)], { angle: a, power: 0.5 }).frames;
    // frames[1] = after one 1/300 s step: x += vx·DT, vx = cos·v0, v0 = 4.2 × 0.5.
    expect(f[1]!.balls[0]!.x).toBe(1 + detCos(a) * 2.1 * (1 / 300));
    expect(f[1]!.balls[0]!.y).toBe(0.5 + detSin(a) * 2.1 * (1 / 300));
  });
});
