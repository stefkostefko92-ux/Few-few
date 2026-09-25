// Baked materials must tile: every generator is periodic over the unit square, so shading at
// (u, v), (u + 1, v) and (u, v + 1) is identical, and every channel stays finite and in range.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

const dir = new URL('../bake/sets/', import.meta.url);
const names = readdirSync(dir).filter((f) => f.endsWith('.mjs'));

const shadeAt = (set, ctx, u, v) => {
  const o = { h: 0, r: 0.5, g: 0.5, b: 0.5, rough: 0.5, metal: 0, mask: 0 };
  set.shade(ctx, u, v, o);
  return o;
};

for (const name of names) {
  test(`bake set ${name} tiles seamlessly and stays in range`, async () => {
    const set = (await import(new URL(name, dir))).default;
    const ctx = set.setup(set.seed ?? 1, 64);
    let seed = 99;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 300; i++) {
      const u = rnd();
      const v = rnd();
      const a = shadeAt(set, ctx, u, v);
      for (const [du, dv] of [[1, 0], [0, 1], [-1, -1]]) {
        const b = shadeAt(set, ctx, u + du, v + dv);
        for (const k of Object.keys(a)) assert.ok(Math.abs(a[k] - b[k]) < 1e-5, `${set.name}.${k} differs at (${u.toFixed(4)}+${du}, ${v.toFixed(4)}+${dv}): ${a[k]} vs ${b[k]}`);
      }
      for (const k of ['r', 'g', 'b', 'rough', 'metal', 'mask']) assert.ok(a[k] >= 0 && a[k] <= 1.2, `${set.name}.${k} out of range: ${a[k]}`);
      assert.ok(Number.isFinite(a.h) && Math.abs(a.h) < 0.1, `${set.name}.h not a plausible height in metres: ${a.h}`);
    }
  });
}
