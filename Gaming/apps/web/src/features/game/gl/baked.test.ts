import { describe, expect, it } from "vitest";
import { BoxGeometry } from "three";
import { grainUv } from "./baked";

describe("grainUv (инкрустирани полета)", () => {
  it("клонира геометрията и не пипа шаблона", () => {
    const base = new BoxGeometry(1, 0.1, 1);
    const before = Array.from(base.getAttribute("uv").array);
    const g = grainUv(base, 7);
    expect(g).not.toBe(base);
    expect(Array.from(base.getAttribute("uv").array)).toEqual(before);
  });

  it("всяко поле показва различно парче дърво, а един и същ ключ — същото", () => {
    const base = new BoxGeometry(1, 0.1, 1);
    const a = Array.from(grainUv(base, 3).getAttribute("uv").array);
    const b = Array.from(grainUv(base, 4).getAttribute("uv").array);
    expect(a).not.toEqual(b);
    expect(Array.from(grainUv(base, 3).getAttribute("uv").array)).toEqual(a);
  });

  it("мащабира плочката до 0.3 (едно поле ≈ шепа жилки, не цяла дъска)", () => {
    const uv = grainUv(new BoxGeometry(1, 0.1, 1), 1).getAttribute("uv");
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < uv.count; i++) {
      lo = Math.min(lo, uv.getX(i));
      hi = Math.max(hi, uv.getX(i));
    }
    expect(hi - lo).toBeCloseTo(0.3, 5);
  });
});
