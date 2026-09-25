import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realTimeOf, storyTimeAtReal, REAL_DURATION, SHOT_COUNT, fitFov, FRAME_ASPECT } from '../src/director.js';
import { DURATION } from '../src/config.js';

test('screen time runs forward and slow motion stretches it', () => {
  let prev = -1;
  for (let t = 0; t <= DURATION; t += 0.05) {
    const r = realTimeOf(t);
    assert.ok(r > prev);
    prev = r;
  }
  assert.ok(REAL_DURATION > DURATION + 6, `bullet time should add seconds (got ${REAL_DURATION.toFixed(1)} s)`);
});

test('the scrubber maps screen time back to story time', () => {
  for (const t of [0.5, 8.45, 12.95, 13.3, 21.55, 27]) assert.ok(Math.abs(storyTimeAtReal(realTimeOf(t)) - t) < 1e-3);
});

test('the shot list is a real edit', () => {
  assert.ok(SHOT_COUNT >= 10);
});

test('a phone held upright keeps the width of every shot', () => {
  const width = (fov, aspect) => 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * aspect);
  for (const fov of [30, 38, 44]) {
    assert.equal(fitFov(fov, 2.16), fov);
    assert.equal(fitFov(fov, FRAME_ASPECT), fov);
    for (const aspect of [0.46, 0.75, 1.33]) assert.ok(Math.abs(width(fitFov(fov, aspect), aspect) - width(fov, FRAME_ASPECT)) < 1e-9);
  }
});
