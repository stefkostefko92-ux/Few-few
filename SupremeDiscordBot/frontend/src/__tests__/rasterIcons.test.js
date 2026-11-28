// frontend/src/__tests__/rasterIcons.test.js
// Правилото на собственика „никога SVG“ (2026-11-04; и вече пуснатият — 2026-11-27):
// иконите са растер (атлас public/icons/sprite.webp), графиките — <canvas>.
//   И1 нито един файл в src/ не внася lucide-react (той е само devDependency за генератора)
//   И2 нито един файл в src/ не рисува <svg> и не създава SVG през createElementNS
//   И3 атласът покрива всяка внесена икона (иначе иконата е празна кутия)
//   И4 растерната икона пази поведението на SVG-то: размер, inline → inline-block,
//      скрита за четци по подразбиране, етикет → role="img", запълнен вариант, без lucide пропсове в DOM
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = join(SRC, "..");

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== "__tests__") walk(p, acc); continue; }
    if (/\.(jsx?|mjs)$/.test(e)) acc.push(p);
  }
  return acc;
}
const files = walk(SRC);

describe("И1–И2 — без SVG в таблото", () => {
  it("никой не внася lucide-react", () => {
    const bad = files.filter((f) => /from\s+["']lucide-react["']/.test(readFileSync(f, "utf8"))).map((f) => relative(SRC, f));
    expect(bad).toEqual([]);
  });
  it("никой не рисува <svg> и не създава SVG елемент", () => {
    const bad = files.filter((f) => /<svg[\s>]|createElementNS\([^)]*svg/i.test(readFileSync(f, "utf8"))).map((f) => relative(SRC, f));
    expect(bad).toEqual([]);
  });
  it("lucide-react е само devDependency", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pkg.dependencies?.["lucide-react"]).toBeUndefined();
    expect(pkg.devDependencies?.["lucide-react"]).toBeTruthy();
  });
});

describe("И3 — атласът покрива всичко", () => {
  it("всяка внесена икона има клетка, атласът е на диска", async () => {
    const { collectIconNames } = await import("../../scripts/build-icons.mjs");
    const { SPRITE } = await import("../components/icons/spriteMap.js");
    const missing = collectIconNames().filter((n) => !(n in SPRITE));
    expect(missing).toEqual([]);
    expect(existsSync(join(ROOT, "public", "icons", "sprite.webp"))).toBe(true);
  });
});

describe("И4 — поведението на иконата", () => {
  let makeIcon, SPRITE;
  beforeAll(async () => {
    globalThis.React = React; // за JSX в класическия режим на трансформацията
    ({ makeIcon } = await import("../components/icons/RasterSprite.jsx"));
    ({ SPRITE } = await import("../components/icons/spriteMap.js"));
  });
  const html = (el) => renderToStaticMarkup(el);

  it("декоративна по подразбиране; маска с позиция на клетката", () => {
    const out = html(React.createElement(makeIcon("Ticket"), { className: "w-4 h-4" }));
    expect(out).toMatch(/^<span /);
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain('class="cs-ico w-4 h-4"');
    expect(out).toMatch(/mask-position:/);
  });
  it("`inline` става `inline-block` — span с inline губи размера си", () => {
    const out = html(React.createElement(makeIcon("ChevronRight"), { className: "inline w-3 h-3 mx-1" }));
    expect(out).toContain('class="cs-ico inline-block w-3 h-3 mx-1"');
  });
  it("size → ширина и височина", () => {
    const out = html(React.createElement(makeIcon("Check"), { size: 14 }));
    expect(out).toMatch(/width:14px;height:14px/);
  });
  it("с етикет → role=img и не е скрита", () => {
    const out = html(React.createElement(makeIcon("Shield"), { "aria-label": "Защита" }));
    expect(out).toContain('role="img"');
    expect(out).not.toContain("aria-hidden");
  });
  it("fill → запълнената клетка, ако има такава", () => {
    const filled = html(React.createElement(makeIcon("Star"), { fill: "currentColor" }));
    const plain = html(React.createElement(makeIcon("Star"), {}));
    expect(SPRITE["Star:fill"]).toBeDefined();
    expect(filled).not.toEqual(plain);
  });
  it("клас fill-* също дава запълнената клетка (звездите на Premium, Play)", () => {
    const byClass = html(React.createElement(makeIcon("Star"), { className: "w-3 h-3 fill-current" }));
    const plain = html(React.createElement(makeIcon("Star"), { className: "w-3 h-3" }));
    expect(byClass).not.toEqual(plain.replace("w-3 h-3", "w-3 h-3 fill-current"));
    expect(SPRITE["Play:fill"]).toBeDefined();
  });
  it("пропсовете на lucide не стигат до DOM", () => {
    const out = html(React.createElement(makeIcon("Zap"), { strokeWidth: 2.5, absoluteStrokeWidth: true, fill: "none" }));
    expect(out).not.toMatch(/strokewidth|stroke-width|absolute|fill=/i);
  });
});
