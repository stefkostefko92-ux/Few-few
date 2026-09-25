// Faces in story time: every expression stays in range, blinks answer the blows, Ser Aldric
// strains on his own strikes, the Warden hurts after the last one and looks down on his knees.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FaceDriver, EXPRESSIONS } from '../src/face.js';
import { DURATION } from '../src/config.js';

test('every expression stays between 0 and 1 over the whole duel', () => {
  for (const who of ['A', 'B']) {
    const f = new FaceDriver(who);
    for (let T = 0; T <= DURATION; T += 1 / 60) {
      const o = f.sample(T, Math.sin(T * 2.1));
      for (const k of EXPRESSIONS) assert.ok(Number.isFinite(o[k]) && o[k] >= 0 && o[k] <= 1, `${who} ${k} = ${o[k]} at ${T.toFixed(2)} s`);
      assert.ok(o.jawOpen <= 0.85);
    }
  }
});

test('both knights blink at a clash of blades', () => {
  for (const who of ['A', 'B']) assert.ok(new FaceDriver(who).sample(12.99).blinkR > 0.5, `${who} does not blink`);
});

test('Ser Aldric strains on his own blows', () => {
  const o = new FaceDriver('A').sample(8.45);
  assert.ok(o.browDown > 0.5 && o.snarl > 0.4, JSON.stringify(o));
});

test('the Warden hurts after the final blow and looks down on his knees', () => {
  const f = new FaceDriver('B');
  const hit = f.sample(21.8);
  assert.ok(hit.snarl > 0.5 && hit.squint > 0.4 && hit.jawOpen > 0.3, JSON.stringify(hit));
  const knees = f.sample(24.5);
  assert.ok(f.look.down > 0.9 && knees.browUp > 0.3, JSON.stringify(knees));
});
