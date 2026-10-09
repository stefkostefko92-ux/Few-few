// Pure geometry tests, zero GPU: the body silhouette function body.js/face.js/accessories.js
// place everything against.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILE, TOP_OF_HEAD_Y, SOLE_Y, bodyRadiusAtY, forwardZFor, FACE_CLEARANCE } from '../src/profile.js';

test('profile has feet-to-crown control points, radius zero at the crown', () => {
  assert.equal(PROFILE.length, 10);
  assert.equal(PROFILE[PROFILE.length - 1][0], 0);
  assert.equal(TOP_OF_HEAD_Y, PROFILE[PROFILE.length - 1][1]);
  assert.equal(SOLE_Y, PROFILE[0][1]);
});

test('bodyRadiusAtY stays within the profile silhouette bounds', () => {
  for (let y = SOLE_Y; y <= TOP_OF_HEAD_Y; y += 0.05) {
    const r = bodyRadiusAtY(y);
    assert.ok(r >= 0 && r <= 1.1, `radius ${r} out of bounds at y=${y}`);
  }
  assert.equal(bodyRadiusAtY(TOP_OF_HEAD_Y), 0);
  assert.equal(bodyRadiusAtY(SOLE_Y), PROFILE[0][0]);
});

test('forwardZFor always clears the body surface by FACE_CLEARANCE plus the accessory half-depth', () => {
  for (const y of [0.32, 0.6, -0.2]) {
    const halfDepth = 0.04;
    const z = forwardZFor(y, halfDepth);
    const r = bodyRadiusAtY(y);
    assert.ok(z - halfDepth >= r * (1 + FACE_CLEARANCE) - 1e-9, `forwardZFor(${y}) does not clear the body`);
  }
});
