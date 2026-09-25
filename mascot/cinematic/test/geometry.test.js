// Builds the real production meshes (three.js math only, zero GPU/canvas) and checks the four
// concrete defects from the design brief are structurally impossible to reintroduce.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMaterials } from '../src/materials.js';
import { carbonTwillTextures, satinTextures, feltTextures, radialTextures, irisTextures, scratchTextures } from '../src/textures.js';
import { bodyRadiusAtY, TOP_OF_HEAD_Y } from '../src/profile.js';
import { buildBody, GROUND_Y } from '../src/body.js';
import { buildFace, layout, EYE_Y, EYE_X, BROW_Y, BROW_TUBE_R, RING_R } from '../src/face.js';
import { buildHat, buildBow, HAT_BOTTOM_Y, BOW_Y, WING_W, WING_DEPTH } from '../src/accessories.js';
import { addLights } from '../src/scene.js';

const palette = { neon: '#5AB60D', olive: '#99E72A', pale: '#C8DDA6', softOlive: '#848D68', ink: '#0A0C0A', inkSoft: '#2A2E24', eye: '#F4FAEA', gold: '#D9A521' };

function materials() {
  const T = { carbon: carbonTwillTextures(64), satin: satinTextures(64), felt: feltTextures(64), radial: radialTextures(32), iris: irisTextures(32), scratch: scratchTextures(32) };
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

test('defect: the pupil projects near the lens center under the studio camera, not off to one side', () => {
  // 2026-09-25 review regression: the eyes read as blown-out white discs with the iris/pupil pushed
  // out of frame. That was a lighting/exposure defect (materials.js/scene.js), not a geometric one —
  // this test pins the geometric half of the guarantee: a pinhole camera at the same distance/target
  // main.js and embed.js both use (CAM_DIST=8, looking at the origin) must still project the pupil
  // within 10% of the lens' own radius from the lens center, so a future depth change cannot push it
  // out from behind the glass even if nobody notices in a screenshot.
  const CAM_DIST = 8; // must match main.js/embed.js CAM_DIST
  const L = layout();
  for (const sign of [-1, 1]) {
    const x = sign * EYE_X;
    const projLens = x / (CAM_DIST - L.lensZ);
    const projPupil = x / (CAM_DIST - L.pupilZ);
    const lensRadiusProj = RING_R / (CAM_DIST - L.lensZ);
    const drift = Math.abs(projPupil - projLens) / lensRadiusProj;
    assert.ok(drift < 0.1, `pupil parallax drift (${drift}) must stay under 10% of the lens radius`);
  }
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

test('brows hug the forehead surface — they do not float above the silhouette like a wire loop', () => {
  // The regression this guards: a TorusGeometry semicircle held one fixed z-depth across a curve
  // that keeps receding as y rises, so the arc stood proud of the head, reading as an antenna
  // rather than a mark on the skin. The fix samples the actual body radius AT the brow's own
  // height and clears it by only a hair, exactly like the mouth already does at its own height.
  const z0 = bodyRadiusAtY(BROW_Y) * 1.012;
  assert.ok(z0 > bodyRadiusAtY(BROW_Y), 'brow must clear the body surface it sits on');
  assert.ok(z0 < bodyRadiusAtY(BROW_Y) * 1.05, 'brow must hug the surface, not float far in front of it');
  assert.ok(BROW_Y > EYE_Y + 0.3, 'brow must clear the top of the glasses rim (EYE_Y + RING_R + TUBE_R)');
});

test('brows are volumetric, not a thin painted line (2026-09-25 brief: "веждите са тънки")', () => {
  assert.ok(BROW_TUBE_R >= 0.045, `brow tube radius (${BROW_TUBE_R}) must stay thick enough to read as a full brow`);
  const face = buildFace(materials());
  const browL = face.children.find((c) => c.material && c.material.name === 'browFuzz');
  assert.ok(browL, 'a brow mesh must use the matte browFuzz material, not glossy acetate');
});

test('defect: the bow tie wings are pillowed satin, not a flat wafer plate', () => {
  assert.ok(WING_DEPTH / WING_W >= 0.15, `wing thickness (${WING_DEPTH}) must be at least 15% of its width (${WING_W})`);
});

test('defect: no discrete "glow core" mesh — any alpha-cutoff sphere reads as a burnt hotspot through transmissive jelly', () => {
  // The regression this guards: a MeshBasicMaterial sphere, however deep or dim, still has a hard
  // edge — through transmission=1 jelly that edge reads as a burnt dot (worst right under the bow
  // tie). The inner glow must come only from the jelly material's own emissive, never a mesh.
  const body = buildBody(materials(), {});
  const names = [];
  body.traverse((o) => o.name && names.push(o.name));
  assert.ok(!names.includes('core'), 'body must not contain a mesh named "core"');
  assert.ok(!Object.keys(materials()).includes('coreGlow'), 'materials must not expose a coreGlow material');
});

test('defect: no light source glows directly under the bow tie', () => {
  // The regression this guards (2026-09-25 brief: "слабо зелено сияние под папийонката"): a
  // PointLight sitting close behind the bow bakes a soft colored disc onto the transmissive
  // jelly right at the bow. Every PointLight in the scene must sit clear of the bow's own
  // vertical band (BOW_Y +/- 0.3).
  const scene = new THREE.Scene();
  addLights(scene, palette);
  const lights = [];
  scene.traverse((o) => o.isPointLight && lights.push(o));
  for (const l of lights) {
    assert.ok(Math.abs(l.position.y - BOW_Y) > 0.3, `PointLight at y=${l.position.y} sits in the bow's band (BOW_Y=${BOW_Y})`);
  }
});

test('defect: the bow tie has no stray wire loop ("жица") around the knot', () => {
  // The regression this guards (2026-09-25 review): a thin TorusGeometry "cinch" ring at each side
  // of the knot read as bare metal wire on a fabric bow tie. The knot is a plain cylinder; nothing
  // in the bow's geometry should be a torus.
  const bow = buildBow(materials());
  let torus = false;
  bow.traverse((o) => { if (o.geometry && o.geometry.type === 'TorusGeometry') torus = true; });
  assert.ok(!torus, 'the bow tie must not contain a TorusGeometry (the old wire loop)');
});

test('defect: the bow tie itself never carries an emissive/glow material', () => {
  const bow = buildBow(materials());
  bow.traverse((o) => {
    if (!o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m.emissive) continue;
      assert.ok(m.emissive.getHex() === 0, `${m.name || 'material'} on the bow must not be emissive`);
    }
  });
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
