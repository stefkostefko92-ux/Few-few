// The face: glasses, eyes, brows, mouth. All forward placement comes from one pure `layout()`
// function so the mesh builder and `test/geometry.test.js` share a single source of truth —
// no separate hand-tuned numbers that can drift out of sync (defect #1: glasses sinking into the
// face; defect #2: eyes with no readable sclera/iris/pupil, sitting behind the lens).
import * as THREE from 'three';
import { bodyRadiusAtY, forwardZFor } from './profile.js';

export const EYE_Y = 0.32;
export const EYE_X = 0.32;
const TUBE_R = 0.032;
const RING_R = 0.27;
const SCLERA_R = 0.14;
// Extra clearance beyond profile.FACE_CLEARANCE: the eyeball (sclera + iris + pupil, stacked
// nose-to-lens) needs real depth between the face and the glass, not just a hair of margin —
// too little room here was hiding the iris/pupil discs behind the sclera's own opaque front pole.
const MARGIN = 0.17;

// Pure z-depth layout at the eye height, three.js-free so tests can assert it directly.
export function layout() {
  const bodyR = bodyRadiusAtY(EYE_Y);
  const ringZ = forwardZFor(EYE_Y, TUBE_R) + MARGIN;
  const lensZ = ringZ + 0.025;
  const scleraZ = bodyR + 0.03;
  const sclerePoleZ = scleraZ + SCLERA_R;
  const irisZ = sclerePoleZ + 0.01;
  const pupilZ = irisZ + 0.015;
  return {
    bodyR,
    ringZ,
    ringBackZ: ringZ - TUBE_R,
    lensZ,
    scleraZ,
    sclerePoleZ,
    irisZ,
    pupilZ,
    sparkleZ: lensZ - 0.01,
  };
}

function glassesRing(sign, materials) {
  const g = new THREE.Group();
  const L = layout();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RING_R, TUBE_R, 20, 72, Math.PI * 2), materials.acetate);
  const lensMesh = new THREE.Mesh(new THREE.CircleGeometry(RING_R * 0.94, 40), materials.lens);
  lensMesh.position.z = L.lensZ - L.ringZ;
  const temple = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 10), materials.acetate);
  temple.rotation.z = Math.PI / 2;
  temple.rotation.y = sign * -0.18; // fans back along the curve of the head, not straight out
  temple.position.set(sign * (RING_R + 0.12), 0, -0.08);
  g.add(ring, lensMesh, temple);
  g.position.set(sign * EYE_X, EYE_Y, L.ringZ);
  g.name = `glassesRing${sign > 0 ? 'R' : 'L'}`;
  return g;
}

function eye(sign, materials) {
  const L = layout();
  const g = new THREE.Group();
  const sclera = new THREE.Mesh(new THREE.SphereGeometry(SCLERA_R, 24, 18), materials.sclera);
  sclera.position.z = L.scleraZ;
  sclera.name = `sclera${sign > 0 ? 'R' : 'L'}`;
  const iris = new THREE.Mesh(new THREE.CircleGeometry(0.085, 24), materials.iris);
  iris.position.z = L.irisZ;
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.045, 18), materials.pupil);
  pupil.position.z = L.pupilZ;
  pupil.name = `pupil${sign > 0 ? 'R' : 'L'}`;
  const sparkleA = new THREE.Mesh(new THREE.CircleGeometry(0.022, 10), materials.sparkle);
  sparkleA.position.set(-0.04, 0.045, L.sparkleZ);
  const sparkleB = new THREE.Mesh(new THREE.CircleGeometry(0.012, 8), materials.sparkle);
  sparkleB.position.set(0.028, -0.035, L.sparkleZ);
  g.add(sclera, iris, pupil, sparkleA, sparkleB);
  g.position.set(sign * EYE_X, EYE_Y, 0);
  return g;
}

function eyelid(sign, materials) {
  const L = layout();
  const lid = new THREE.Mesh(new THREE.SphereGeometry(SCLERA_R * 1.08, 16, 12), materials.jelly);
  lid.position.set(sign * EYE_X, EYE_Y + 0.02, L.sclerePoleZ - 0.02);
  lid.scale.set(1.05, 0.02, 0.5);
  lid.name = `eyelid${sign > 0 ? 'R' : 'L'}`;
  return lid;
}

// Thicker brows, sitting above the rim of the glasses — a thin arc read as a hairline, not an
// expression.
function brow(sign, materials) {
  const L = layout();
  const b = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 8, 16, Math.PI), materials.iris);
  b.position.set(sign * EYE_X, EYE_Y + 0.4, L.bodyR * 1.03);
  b.rotation.set(0, 0, 0.24 * -sign);
  return b;
}

export function buildFace(materials) {
  const group = new THREE.Group();
  for (const sign of [-1, 1]) {
    group.add(glassesRing(sign, materials));
    group.add(eye(sign, materials));
    group.add(eyelid(sign, materials));
    group.add(brow(sign, materials));
  }
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.12, 8), materials.acetate);
  bridge.rotation.z = Math.PI / 2;
  bridge.position.set(0, EYE_Y, layout().ringZ);
  group.add(bridge);

  // Shallow, wide smile — a tube along a flat Catmull-Rom arc, not a deep half-torus "handle" —
  // sitting right under the glasses, not down near the belly.
  const mouthY = EYE_Y - RING_R - 0.1;
  const mouthZ = bodyRadiusAtY(mouthY) * 1.02;
  const mouthCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.17, 0.018, 0),
    new THREE.Vector3(-0.08, -0.014, 0.004),
    new THREE.Vector3(0, -0.022, 0.006),
    new THREE.Vector3(0.08, -0.014, 0.004),
    new THREE.Vector3(0.17, 0.018, 0),
  ]);
  const mouth = new THREE.Mesh(new THREE.TubeGeometry(mouthCurve, 24, 0.013, 8, false), materials.iris);
  mouth.position.set(0, mouthY, mouthZ);
  group.add(mouth);

  return group;
}
