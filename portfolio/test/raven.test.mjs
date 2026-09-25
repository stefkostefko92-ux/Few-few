// raven.test.mjs — пренесеното от boy/ (src/assets/raven.js): регулаторът на резолюцията за 60 fps,
// мълнията под прага на WCAG 2.3.1 и грейдът като GLSL. raven.js е класически скрипт → пуска се във vm.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../src/assets/raven.js", import.meta.url), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(SRC, sandbox);
const R = sandbox.window.CSRaven;

test("регулаторът: мълчи в загряването и при единични подскоци", () => {
  const g = R.createGovernor({ warmupMs: 1000 });
  g.reset(0);
  for (let t = 0; t < 1000; t += 16) assert.equal(g.sample(40, t), false, "в загряването не се мени");
  assert.equal(g.scale, 1);
  assert.equal(g.sample(400, 1500), false, "кадър >250 ms (таб на заден план) се пренебрегва");
});

test("регулаторът: бавни кадри → скала ×0.85, никога под minScale", () => {
  const g = R.createGovernor({ warmupMs: 0, windowSize: 20, minScale: 0.5 });
  g.reset(0);
  let t = 0, changes = 0;
  for (let i = 0; i < 2000; i++) { t += 30; if (g.sample(30, t)) changes++; }
  assert.ok(changes >= 3, "свали скалата неколкократно");
  assert.ok(Math.abs(g.scale - 0.5) < 1e-9 || g.scale >= 0.5, "не пада под 0.5");
  assert.ok(g.scale < 0.6, `стигна близо до пода (${g.scale})`);
});

test("регулаторът: чист прозорец → качва ×1.08, но не веднага над скала, която току-що не е стигнала", () => {
  const g = R.createGovernor({ warmupMs: 0, windowSize: 20, holdMs: 20000 });
  g.reset(0);
  let t = 0;
  while (g.scale === 1) { t += 30; g.sample(30, t); }
  const dropped = g.scale;
  for (let i = 0; i < 400; i++) { t += 16; g.sample(16, t); }
  assert.ok(g.scale > dropped, "бързите кадри качват скалата");
  assert.ok(g.scale < 1, "в holdMs не се връща до 1 наведнъж");
  for (let i = 0; i < 3000; i++) { t += 16; g.sample(16, t); }
  assert.equal(g.scale, 1, "след holdMs стига обратно до 1");
});

test("началната скала: телефон/малък екран 0.5, иначе 0.75", () => {
  assert.equal(R.initialPixelCap(true, 1200), 0.5);
  assert.equal(R.initialPixelCap(false, 600), 0.5);
  assert.equal(R.initialPixelCap(false, 1080), 0.75);
});

test("мълнията: два импулса, ≤2 светвания за всяка секунда (WCAG 2.3.1 — прагът е 3), тъмно извън удара", () => {
  const step = 0.002, samples = [];
  for (let t = -0.5; t <= 2; t += step) samples.push(R.flashAt(t));
  let peaks = 0, up = false;
  for (const v of samples) { if (!up && v > 0.5) { peaks++; up = true; } else if (up && v < 0.1) up = false; }
  assert.equal(peaks, 2, "точно два импулса на удар");
  assert.equal(R.flashAt(-0.1), 0);
  assert.equal(R.flashAt(0.7), 0);
  assert.ok(Math.max(...samples) <= 1);
});

test("грейдът на boy е цял: ACES RRT/ODT, split-tone, S-крива, зърно, дитер", () => {
  for (const needle of ["ACESIn", "ACESOut", "rrtOdt", "vec3(-0.012, 0.004, 0.02)", "vec3(0.03, 0.012, -0.018)", "3.0 - 2.0 * col", "/ 255.0", "vec3 ravenGrade("]) assert.ok(R.GRADE.includes(needle), needle);
});

test("hero.js ползва общото от raven.js и пази безопасността (LITE, скрит таб, reduced motion, загубен контекст)", () => {
  const hero = readFileSync(new URL("../src/assets/hero.js", import.meta.url), "utf8");
  for (const needle of ["window.CSRaven", "R.GRADE", "R.createGovernor", "R.flashAt", "prefers-reduced-motion", "visibilitychange", "IntersectionObserver", "webglcontextlost", "cs-lite", "KHR_parallel_shader_compile", "hero-static"]) assert.ok(hero.includes(needle), needle);
  // Слаба машина / софтуерен WebGL → CSS постерът, без компилация (един кадър на CPU = ~0.4 s TBT на хъба).
  assert.match(hero, /if \(isStill\(\)\) return fail\(\);\s*\n\s*gl = cv\.getContext/, "LITE при старта не компилира шейдъра");
  assert.match(hero, /swiftshader\|llvmpipe/i, "софтуерният WebGL се разпознава");
});
