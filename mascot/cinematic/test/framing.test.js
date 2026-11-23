// Рамките на камерата (src/framing.js): маскотът пълни кадъра, под бюрото няма празна черна лента,
// иконата е по-близо от портрета. Чиста математика — без GPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FRAMING, screenY, bottomEdgeZ } from '../src/framing.js';
import { GROUND_Y } from '../src/body.js';
import { TOP_OF_HEAD_Y } from '../src/profile.js';

const HAT_TOP_Y = TOP_OF_HEAD_Y + 0.26; // шапката стои над короната (accessories.js)
const DESK_FRONT_Z = 2.1 + 4.0; // desk.js: център z=2.1, дълбочина 8.0

test('defect: portrait frame — the mascot fills it (no tiny figure in a big empty set)', () => {
  const top = screenY(FRAMING.portrait, HAT_TOP_Y);
  const bottom = screenY(FRAMING.portrait, GROUND_Y);
  assert.ok(top < 1 && bottom > 0, 'hat and feet must both be inside the frame');
  assert.ok(top - bottom >= 0.8, `the mascot spans ${(top - bottom).toFixed(2)} of the frame height, want >= 0.8`);
});

test('defect: no empty black strip under the desk — the lacquered top reaches the frame bottom', () => {
  for (const [name, f] of Object.entries(FRAMING)) {
    const z = bottomEdgeZ(f, GROUND_Y);
    assert.ok(z < DESK_FRONT_Z - 0.5, `${name}: bottom edge meets the desk plane at z=${z.toFixed(2)}, desk ends at ${DESK_FRONT_Z}`);
  }
});

test('icon frame is closer than the portrait one and still holds the hat and the bow tie', () => {
  assert.ok(FRAMING.icon.fov < FRAMING.portrait.fov);
  assert.ok(screenY(FRAMING.icon, HAT_TOP_Y) < 1, 'the hat must stay in the icon frame');
  assert.ok(screenY(FRAMING.icon, -0.48) > 0, 'the bow tie (BOW_Y) must stay in the icon frame');
});
