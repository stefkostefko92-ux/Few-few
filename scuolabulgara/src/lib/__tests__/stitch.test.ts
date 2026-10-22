import { describe, it, expect } from "vitest";
import { borderTile, fromChart, hash2, nearestSkein, outlinePath, rosette, SKEINS, stitchChance, stitchPaths, THREAD } from "../stitch";

const at = (m: ReturnType<typeof rosette>) => {
  const map = new Map(m.cells.map((c) => [`${c.x},${c.y}`, c.c]));
  return (x: number, y: number) => map.get(`${x},${y}`);
};

describe("розетката от Дивотино", () => {
  it("е 20 × 20 бода и симетрична в осемте посоки (както на покривката)", () => {
    const m = rosette(), c = at(m), n = m.w - 1;
    expect([m.w, m.h]).toEqual([20, 20]);
    for (const p of m.cells) {
      expect(c(n - p.x, p.y)).toBe(p.c); // огледално
      expect(c(p.x, n - p.y)).toBe(p.c);
      expect(c(p.y, p.x)).toBe(p.c); // по диагонала
    }
  });

  it("има винено сърце 8 × 8 с четири бели бода и червена рамка", () => {
    const m = rosette(), c = at(m);
    const whites = m.cells.filter((p) => p.c === THREAD.white).map((p) => `${p.x},${p.y}`).sort();
    expect(whites).toEqual(["11,11", "11,8", "8,11", "8,8"]);
    for (let y = 6; y <= 13; y++) for (let x = 6; x <= 13; x++) expect([THREAD.wine, THREAD.white]).toContain(c(x, y));
    expect(c(5, 9)).toBe(THREAD.red);
    expect(c(9, 4)).toBe(THREAD.red);
  });

  it("по два листа от всяка страна, разделени с празно", () => {
    const c = at(rosette());
    expect(c(6, 0)).toBe(THREAD.red); // връх на левия лист
    expect(c(13, 0)).toBe(THREAD.red); // и на десния
    expect(c(9, 2) ?? c(10, 2)).toBeUndefined(); // между тях — платно
  });

  it("е обшита с черен назад бод", () => {
    expect(rosette().outline).toBe(THREAD.black);
  });
});

describe("назад бодът", () => {
  it("минава само по ръба между конец и платно", () => {
    const one = outlinePath([{ x: 0, y: 0, c: THREAD.red }], 10);
    expect((one.match(/M/g) || []).length).toBe(4); // самотен бод — четирите страни
    const two = outlinePath([{ x: 0, y: 0, c: THREAD.red }, { x: 1, y: 0, c: THREAD.red }], 10);
    expect((two.match(/M/g) || []).length).toBe(6); // общата страна не се шие
  });
});

describe("бордюрът (вълчи зъби)", () => {
  it("се повтаря без шев: зъбът е огледален около ръба на плочката", () => {
    const t = borderTile(), c = at(t);
    for (const p of t.cells) expect(c((t.w - p.x) % t.w, p.y)).toBe(p.c);
  });

  it("червените зъби слизат, кафявите се качват — и не се докосват", () => {
    const t = borderTile(), c = at(t);
    const teeth = [...Array(t.h).keys()].map((y) => [...Array(t.w).keys()].filter((x) => y > 0 && y < t.h - 1 && c(x, y) === THREAD.red).length);
    const rising = [...Array(t.h).keys()].map((y) => [...Array(t.w).keys()].filter((x) => c(x, y) === THREAD.brown).length);
    expect(teeth.slice(2, 8)).toEqual([11, 9, 7, 5, 3, 1]);
    expect(rising.slice(5, 9)).toEqual([1, 3, 5, 7]);
    for (const p of t.cells.filter((q) => q.c === THREAD.brown)) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        expect(c((p.x + dx + t.w) % t.w, p.y + dy)).not.toBe(THREAD.red);
      }
    }
  });
});

describe("fromChart", () => {
  it("чете схемата ред по ред; точката е голо платно", () => {
    const m = fromChart(["r.", ".v"]);
    expect(m).toEqual({ w: 2, h: 2, outline: undefined, cells: [{ x: 0, y: 0, c: THREAD.red }, { x: 1, y: 1, c: THREAD.wine }] });
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
