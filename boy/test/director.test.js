import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realTimeOf, storyTimeAtReal, REAL_DURATION, SHOT_COUNT } from '../src/director.js';
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
