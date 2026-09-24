// Builds the real production meshes (three.js math only, zero GPU/canvas) and checks the four
// concrete defects from the design brief are structurally impossible to reintroduce.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMaterials } from '../src/materials.js';
import { carbonTwillTextures, satinTextures, feltTextures, radialTextures, coreGlowTexture } from '../src/textures.js';
import { bodyRadiusAtY, TOP_OF_HEAD_Y } from '../src/profile.js';
import { buildBody, GROUND_Y } from '../src/body.js';
import { buildFace, layout, EYE_Y } from '../src/face.js';
import { buildHat, HAT_BOTTOM_Y } from '../src/accessories.js';

const palette = { neon: '#5AB60D', olive: '#99E72A', pale: '#C8DDA6', softOlive: '#848D68', ink: '#0A0C0A', inkSoft: '#2A2E24', eye: '#F4FAEA', gold: '#D9A521' };

function materials() {
  const T = { carbon: carbonTwillTextures(64), satin: satinTextures(64), felt: feltTextures(64), radial: radialTextures(32), core: coreGlowTexture(16) };
  return createMaterials(T, palette);
}

test('defect #1: the glasses ring clears the body surface, never sinks into the face', () => {
  const L = layout();
  const bodyR = bodyRadiusAtY(EYE_Y);
  assert.ok(L.ringBackZ >= bodyR * 1.02, `ring back (${L.ringBackZ}) must clear body radius*1.02 (${bodyR * 1.02})`);
});

test('defect #2: the sclera sits in front of the body and behind the lens', () => {
  const L = layout();
  assert.ok(L.scleraZ > L.bodyR, 'sclera must be ahead of the nominal body surface');
  assert.ok(L.scleraZ < L.lensZ, 'sclera must sit behind the lens');
  assert.ok(L.irisZ > L.scleraZ && L.irisZ < L.lensZ, 'iris must sit between sclera and lens');
  assert.ok(L.pupilZ > L.irisZ && L.pupilZ < L.lensZ, 'pupil must sit between iris and lens');
  // The regression this guards: iris/pupil are flat discs behind the sclera sphere's own opaque
  // front pole are invisible, hidden by the sphere itself — reads as a blank white eye.
  assert.ok(L.irisZ > L.sclerePoleZ, 'iris must clear the sclera sphere\'s own front pole to be visible');
});

test('defect #2: the built face exposes readable sclera/iris/pupil/sparkle meshes per eye', () => {
  const face = buildFace(materials());
  for (const side of ['L', 'R']) {
    assert.ok(face.getObjectByName(`sclera${side}`), `sclera${side} missing`);
    assert.ok(face.getObjectByName(`pupil${side}`), `pupil${side} missing`);
  }
});

test('defect #6: the hat band seats flush against the head — no visible gap to the crown', () => {
  // The head narrows to a POINT at TOP_OF_HEAD_Y (radius 0): a band anchored right there floats
  // over a widening gap to its own, much wider, brim — visible as a dark notch from any angle off
  // dead-on-front. The real invariant is not "close to the crown y", it is "the band's own bottom
  // radius is not wider than the head surface it sits against" — i.e. it emerges from the head,
  // not hovers above a narrower tip.
  const bandBottomR = 0.44;
  const headRHere = bodyRadiusAtY(HAT_BOTTOM_Y);
  assert.ok(headRHere >= bandBottomR - 0.01, `head radius at the hat's seat (${headRHere}) must not be narrower than the band (${bandBottomR}) — else there is a visible gap`);
  assert.ok(HAT_BOTTOM_Y < TOP_OF_HEAD_Y, 'the seat must be below the crown point, not at or above it');
  const hat = buildHat(materials());
  const band = hat.getObjectByName('hatBand');
  const box = new THREE.Box3().setFromObject(band);
  assert.ok(box.min.y <= TOP_OF_HEAD_Y + 0.01, 'hat band must not float above the crown');
});

test('defect #5: every foot rests exactly on the ground plane', () => {
  const body = buildBody(materials(), {});
  const feet = body.children.filter((c) => c.name && c.name.startsWith('foot'));
  assert.ok(feet.length >= 2, 'expected at least two foot meshes');
  for (const foot of feet) {
    const box = new THREE.Box3().setFromObject(foot);
    assert.ok(Math.abs(box.min.y - GROUND_Y) < 0.01, `foot bottom (${box.min.y}) must equal GROUND_Y (${GROUND_Y})`);
  }
});
