import { describe, it, expect } from "vitest";
import { bandTile, hash2, nearestSkein, SKEINS, star, stitchChance, stitchPaths, THREAD } from "../stitch";

describe("звездата", () => {
  it("е симетрична в осемте посоки", () => {
    const m = star(5);
    const key = new Set(m.cells.map((c) => `${c.x},${c.y},${c.c}`));
    const n = m.w - 1;
    for (const c of m.cells) {
      expect(key.has(`${n - c.x},${c.y},${c.c}`)).toBe(true); // огледално
      expect(key.has(`${c.y},${c.x},${c.c}`)).toBe(true); // по диагонала
    }
  });

  it("има осем лъча: четирите оси и четирите диагонала стигат до края", () => {
    const m = star(5), c = (m.w - 1) / 2;
    const at = (x: number, y: number) => m.cells.some((p) => p.x === x && p.y === y);
    expect(at(c, 0) && at(0, c) && at(m.w - 1, c) && at(c, m.w - 1)).toBe(true);
    expect(at(c - 5, c - 5) && at(c + 5, c + 5)).toBe(true);
  });
});

describe("бордюрът", () => {
  it("се повтаря без шев: левият и десният край съвпадат", () => {
    const t = bandTile();
    const col = (x: number) => t.cells.filter((c) => c.x === x).map((c) => `${c.y}${c.c}`).sort().join();
    expect(col(1)).toBe(col(t.w - 1));
  });
});

describe("stitchPaths", () => {
  it("всеки бод е два крака (X), групирани по цвят", () => {
    const p = stitchPaths([{ x: 0, y: 0, c: THREAD.red }, { x: 1, y: 0, c: THREAD.red }, { x: 0, y: 1, c: THREAD.black }], 10);
    expect(Object.keys(p).sort()).toEqual([THREAD.black, THREAD.red].sort());
    expect((p[THREAD.red].match(/M/g) || []).length).toBe(4);
  });
});

describe("снимка → конци", () => {
  it("всеки цвят става някой от конците в кутията", () => {
    for (const [r, g, b] of [[255, 255, 255], [0, 0, 0], [200, 30, 30], [30, 120, 60], [123, 45, 200]]) {
      expect(SKEINS).toContainEqual(nearestSkein(r, g, b));
    }
  });
  it("червеното на шевицата остава червено, бялото — ленено", () => {
    expect(nearestSkein(180, 25, 30)).toEqual([179, 23, 29]);
    expect(nearestSkein(250, 248, 245)).toEqual([241, 236, 226]);
  });
  it("шевът е гъст в средата и изтънява към двата края", () => {
    expect(stitchChance(0)).toBe(0);
    expect(stitchChance(1)).toBe(0);
    expect(stitchChance(0.5)).toBeGreaterThan(stitchChance(0.1));
    expect(stitchChance(0.5)).toBeGreaterThan(stitchChance(0.9));
  });
  it("същото място дава същия бод (пренарисуване при resize не мени шевицата)", () => {
    expect(hash2(12, 7, 3)).toBe(hash2(12, 7, 3));
    expect(hash2(12, 7, 3)).not.toBe(hash2(7, 12, 3));
  });
});
