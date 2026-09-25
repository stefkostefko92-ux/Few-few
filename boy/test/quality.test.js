import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGovernor, initialTier, QUALITY } from '../src/quality.js';

function feed(gov, ms, frames, start) {
  let now = start;
  let changed = false;
  for (let i = 0; i < frames; i++) {
    now += ms;
    changed = gov.sample(ms, now) || changed;
  }
  return { now, changed };
}

test('missed refreshes lower the render scale', () => {
  const gov = createGovernor();
  gov.reset(0);
  const { changed } = feed(gov, 33.4, 200, 0);
  assert.ok(changed);
  assert.ok(gov.scale < 1);
});

test('a steady 60 Hz raises it back, never above native', () => {
  const gov = createGovernor({ holdMs: 0 });
  gov.reset(0);
  let { now } = feed(gov, 33.4, 200, 0);
  const low = gov.scale;
  ({ now } = feed(gov, 16.7, 4000, now));
  assert.ok(gov.scale > low);
  assert.ok(gov.scale <= 1);
});

test('the scale never drops below half resolution', () => {
  const gov = createGovernor();
  gov.reset(0);
  feed(gov, 60, 5000, 0);
  assert.ok(gov.scale >= 0.5);
});

test('phones start on the light tier, desktops on high', () => {
  assert.equal(initialTier(true, 1080), 'low');
  assert.equal(initialTier(false, 1440), 'high');
  assert.ok(!QUALITY.low.ssgi && !QUALITY.low.reflections && QUALITY.ultra.texHero >= QUALITY.high.texHero);
});
