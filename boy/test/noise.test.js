import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Noise2, Voronoi } from '../src/noise.js';

test('value noise tiles seamlessly at its period', () => {
  const n = new Noise2(7);
  for (let i = 0; i < 50; i++) {
    const x = i * 0.37;
    const y = i * 0.53;
    assert.ok(Math.abs(n.value(x, y, 8) - n.value(x + 8, y, 8)) < 1e-9);
    assert.ok(Math.abs(n.fbm(x, y, 4, 4) - n.fbm(x, y + 4, 4, 4)) < 1e-9);
  }
});

test('worley distances are ordered and bounded', () => {
  const v = new Voronoi(12, 3);
  for (let i = 0; i < 200; i++) {
    v.query((i * 0.137) % 1, (i * 0.291) % 1);
    assert.ok(v.f1 <= v.f2 && v.f1 < 1.5);
  }
});
