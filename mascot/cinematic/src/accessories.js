// Hat, tassel and bow tie. Hat placement is pure and shared with `test/geometry.test.js`
// (defect #6: the hat used to float/clip instead of sitting on the head). The tassel is a bundle
// of thin gold strands plus a tuft, not one thick cord that blooms into a blob. The bow tie is two
// folded triangular wings in satin, not two glossy sphere "drops" (defect #4).
import * as THREE from 'three';
import { TOP_OF_HEAD_Y, SOLE_Y, bodyRadiusAtY, forwardZFor } from './profile.js';

export const BOW_Y = -0.48;
export const BOW_Z = forwardZFor(BOW_Y, 0.03) + 0.06; // clear of the torso, satin catches its own light

const BAND_H = 0.2;
const BAND_BOTTOM_R = 0.44;
const EMBED = 0.02; // the band presses slightly into the jelly, instead of resting exactly tangent

// The crown narrows to a point (radius 0) at TOP_OF_HEAD_Y — a band anchored right at that point
// floats over a visible gap to its own, much wider, rim (defect: "hat hovers over a dark notch" in
// the 3/4 view). Anchor it instead where the head's own radius matches the band's bottom radius,
// so the felt visibly emerges from the surface, then sink it a touch further for a pressed-in seat.
function findHatBottomY() {
  let y = TOP_OF_HEAD_Y;
  const step = 0.002;
  while (y > SOLE_Y && bodyRadiusAtY(y) < BAND_BOTTOM_R) y -= step;
  return y - EMBED;
}
export const HAT_BOTTOM_Y = findHatBottomY();

export function buildHat(materials) {
  const hat = new THREE.Group();
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, BAND_H, 28), materials.felt);
  band.position.y = HAT_BOTTOM_Y + BAND_H / 2;
  band.name = 'hatBand';
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.05, 0.94), materials.feltTop);
  board.position.y = HAT_BOTTOM_Y + BAND_H + 0.025;
  const button = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), materials.gold);
  button.position.y = board.position.y + 0.045;
  band.castShadow = board.castShadow = true;
  hat.add(band, board, button);
  hat.add(buildTassel(materials, button.position.y));
  hat.position.set(0.02, 0, 0.03);
  hat.rotation.set(-0.04, 0.3, -0.1);
  hat.name = 'hat';
  return hat;
}

// A twisted cord (three thick strands, not a flat ribbon) from the button, over the board's edge,
// down to a wrapped cap and a wide tuft of loose fringe threads — reads as rope + tassel, not a
// bloom smear.
function buildTassel(materials, buttonY) {
  const group = new THREE.Group();
  const anchor = new THREE.Vector3(0, buttonY, 0);
  const knee = new THREE.Vector3(0.32, buttonY - 0.05, 0.2);
  const drop = new THREE.Vector3(0.54, buttonY - 0.55, 0.34);
  const cordStrands = 3;
  for (let i = 0; i < cordStrands; i++) {
    const a = (i / cordStrands) * Math.PI * 2;
    const twist = new THREE.Vector3(Math.cos(a) * 0.02, 0, Math.sin(a) * 0.02);
    const curve = new THREE.CatmullRomCurve3([
      anchor.clone(),
      knee.clone().add(twist),
      drop.clone().add(twist.clone().multiplyScalar(0.6)),
    ]);
    const strand = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.018, 8, false), materials.gold);
    strand.castShadow = true;
    group.add(strand);
  }
  const cap = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.016, 8, 16), materials.gold);
  cap.position.copy(drop).y += 0.16;
  cap.rotation.x = Math.PI / 2;
  group.add(cap);
  // Fringe: a wide radial burst of thread stubs below the wrap cap — the tassel proper.
  const fringeCount = 12;
  for (let i = 0; i < fringeCount; i++) {
    const a = (i / fringeCount) * Math.PI * 2;
    const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.0015, 0.24, 5), materials.gold);
    thread.position.copy(drop).add(new THREE.Vector3(Math.cos(a) * 0.035, -0.2, Math.sin(a) * 0.035));
    thread.rotation.set(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32);
    group.add(thread);
  }
  group.name = 'tassel';
  return group;
}

// Pushes each vertex outward along +z in proportion to how far it sits from the knot edge (x=0)
// and how close to the wing's vertical centreline (y=0) — a soft fabric puff, most convex in the
// middle of the wing, flat again at the knot and at the top/bottom points.
function puffWing(geo, sign, amount) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const xt = THREE.MathUtils.clamp(x / (sign * 0.34), 0, 1);
    const yt = 1 - Math.min(1, Math.abs(y) / 0.15);
    pos.setZ(i, pos.getZ(i) + Math.sin(xt * Math.PI) * yt * amount);
  }
  geo.computeVertexNormals();
}

// One folded wing: a puffed triangle from the knot to a wide outer edge, with two crease lines
// pinched near the knot — reads as gathered fabric, not a flat plate (defect: "the bow tie is a
// flat plate"), and not the sphere "drop" an earlier version used.
function bowWing(sign, materials) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.03);
  shape.lineTo(sign * 0.34, 0.15);
  shape.lineTo(sign * 0.34, -0.15);
  shape.lineTo(0, -0.03);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2, curveSegments: 8 });
  puffWing(geo, sign, 0.055);
  const wing = new THREE.Mesh(geo, materials.satin);
  wing.rotation.y = sign * -0.3; // fold outward from the knot, catches the key light as a crease
  wing.castShadow = true;
  const group = new THREE.Group();
  group.add(wing);
  // Two pinched creases gathered toward the knot, echoing a real bow tie's folds.
  for (const t of [0.4, 0.72]) {
    const crease = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.24, 6), materials.satinKnot);
    crease.rotation.z = Math.PI / 2;
    crease.rotation.y = sign * -0.3;
    crease.position.set(sign * 0.34 * t, 0, 0.02 + Math.sin(t * Math.PI) * 0.05);
    group.add(crease);
  }
  return group;
}

export function buildBow(materials) {
  const bow = new THREE.Group();
  bow.add(bowWing(-1, materials), bowWing(1, materials));
  const knot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 14), materials.satinKnot);
  knot.rotation.z = Math.PI / 2;
  const cinchL = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 8, 16), materials.satinKnot);
  cinchL.rotation.y = Math.PI / 2;
  cinchL.position.x = -0.13;
  const cinchR = cinchL.clone();
  cinchR.position.x = 0.13;
  bow.add(knot, cinchL, cinchR);
  bow.name = 'bow';
  return bow;
}
