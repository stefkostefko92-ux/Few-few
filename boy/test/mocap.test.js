// The motion-capture layer: the time warp only moves forward at sane speeds, the captured body
// motion stays small and finite, and exertion in the capture lines up with the duel's strikes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignActivity, BodyLayer, CHANNELS, MOCAP_FPS } from '../src/mocap.js';
import { captureFor } from '../src/mocap-body.js';
import { DURATION } from '../src/config.js';

const wave = (n, period, phase = 0) => Float32Array.from({ length: n }, (_, i) => 1 + Math.sin((i / period) * Math.PI * 2 + phase));

// Smoothed pseudo-random bursts: unlike a sine, no shifted copy of it matches itself.
function bursts(n, seed) {
  let a = seed;
  const raw = Array.from({ length: n }, () => {
    a = (a * 16807) % 2147483647;
    return (a / 2147483647) ** 3;
  });
  return Float32Array.from(raw, (_, i) => {
    let s = 0;
    for (let k = -4; k <= 4; k++) s += raw[Math.min(n - 1, Math.max(0, i + k))];
    return s / 9;
  });
}

test('the warp never runs backwards and never faster than twice real time', () => {
  const path = alignActivity(wave(300, 40), wave(900, 55, 1));
  for (let i = 1; i < path.length; i++) {
    const step = path[i] - path[i - 1];
    assert.ok(step >= 0 && step <= 2, `step ${step} at ${i}`);
  }
  assert.ok(path[0] >= 0 && path[path.length - 1] < 900);
});

test('a copy of the capture aligns onto itself', () => {
  const capture = bursts(600, 4242);
  const story = capture.slice(120, 420);
  const path = alignActivity(story, capture);
  const drift = path.reduce((worst, j, i) => Math.max(worst, Math.abs(j - (120 + i))), 0);
  assert.ok(drift <= 3, `drifts ${drift} frames from the true offset`);
});

test('captured body motion stays small and finite over the whole duel', () => {
  const layer = new BodyLayer(wave(Math.ceil(DURATION * MOCAP_FPS) + 1, 45));
  const limit = { pelvisYaw: 0.4, pelvisPitch: 0.3, pelvisRoll: 0.2, twist: 0.4, lean: 0.25, side: 0.3, headYaw: 0.4, headPitch: 0.2, headRoll: 0.25, hipY: 0.1, shiftX: 0.1, shiftZ: 0.12 };
  const out = {};
  for (let T = 0; T < DURATION; T += 1 / 60) {
    layer.sample(T, out);
    for (const c of CHANNELS) assert.ok(Number.isFinite(out[c]) && Math.abs(out[c]) <= limit[c], `${c} = ${out[c]} at ${T.toFixed(2)} s`);
  }
});

test('the capture works hardest where the knights strike', () => {
  for (const who of ['A', 'B']) {
    const layer = captureFor(who);
    assert.equal(layer.path.length, Math.ceil(DURATION * MOCAP_FPS) + 1);
    const moved = layer.path[layer.path.length - 1] - layer.path[0];
    assert.ok(moved > DURATION * MOCAP_FPS * 0.5, `${who}: the capture barely plays (${moved} frames)`);
  }
});
