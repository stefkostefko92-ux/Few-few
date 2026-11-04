import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CORK,
  FILL_BOTTOM,
  glassProfile,
  INNER,
  innerRadiusAt,
  liquidProfile,
  liquidTop,
  SEED,
  seedPosition,
  SLOT,
  TUBE,
} from '../client/geometry.js';

test('вътрешният радиус: полукълбо на дъното, после права стена', () => {
  assert.equal(innerRadiusAt(TUBE.wall), 0); // най-ниската точка отвътре
  assert.equal(innerRadiusAt(TUBE.outer), INNER);
  assert.equal(innerRadiusAt(100), INNER);
  assert.ok(innerRadiusAt(8) > 0 && innerRadiusAt(8) < INNER);
});

test('нивото: 0% е на дъното, 100% е под тапата', () => {
  assert.equal(liquidTop(0), FILL_BOTTOM);
  assert.equal(liquidTop(1), TUBE.fillTop);
  assert.ok(TUBE.fillTop < TUBE.height - CORK.inside);
  assert.equal(liquidTop(2), TUBE.fillTop); // извън [0, 1] се отрязва
});

test('профилите: стъклото е затворено (от оста до оста), разтворът е вътре в него', () => {
  const glass = glassProfile();
  assert.ok((glass[0]?.[0] ?? 1) < 1e-9);
  assert.ok((glass.at(-1)?.[0] ?? 1) < 1e-9);
  for (const [x] of glass) assert.ok(x >= 0);
  for (const level of [0.004, 0.1, 0.5, 1]) {
    const liquid = liquidProfile(level);
    assert.equal(liquid.at(-1)?.[0], 0);
    for (const [x, y] of liquid) {
      assert.ok(x <= innerRadiusAt(Math.min(y, TUBE.fillTop)) + 1e-6, `x=${x} y=${y}`);
      assert.ok(y <= liquidTop(level) + 1.3);
    }
  }
});

test('семената никога не излизат от стъклото и стоят под повърхността', () => {
  for (const level of [0.05, 0.3, 1]) {
    for (let i = 0; i <= 10; i++) {
      for (const radial of [0, 0.5, 1]) {
        const [x, y, z] = seedPosition({ u: i / 10, angle: i, radial }, level, false);
        assert.ok(Math.hypot(x, z) + SEED.x <= innerRadiusAt(y) + 1e-6);
        assert.ok(y >= FILL_BOTTOM && y <= Math.max(liquidTop(level), FILL_BOTTOM + SEED.y + 0.4));
      }
    }
  }
  const [, dried] = seedPosition({ u: 1, angle: 0, radial: 1 }, 0, true);
  assert.ok(dried < FILL_BOTTOM + 8); // изсъхналите са на дъното
});

test('стъкленицата се побира в мястото си в разметката', () => {
  assert.ok(TUBE.height + CORK.height - CORK.inside < SLOT.floor);
  assert.ok(TUBE.outer * 2 < SLOT.width);
});
