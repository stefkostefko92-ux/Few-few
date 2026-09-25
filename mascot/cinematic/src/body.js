// The mascot's body: the lathed jelly torso, the sealed carbon fabric and glow core inside it,
// the bubble field, and the limbs — curved arms relaxed at the sides, short legs ending in
// rounded feet (defect #5: the old version had almost no arms and cylinder-stub legs).
import * as THREE from 'three';
import { PROFILE, SOLE_Y, bodyRadiusAtY } from './profile.js';
import { rng } from './noise.js';

// Feet sit a little below the torso's own underside — the torso rests visually ON the feet,
// not floating above an invisible floor. `test/geometry.test.js` pins every foot to this y.
export const FOOT_DROP = 0.1;
export const GROUND_Y = SOLE_Y - FOOT_DROP;

function latheBody() {
  const pts3 = PROFILE.map(([x, y]) => new THREE.Vector3(x, y, 0));
  const curve = new THREE.CatmullRomCurve3(pts3, false, 'catmullrom', 0.4);
  const pts2 = curve.getPoints(72).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
  const geo = new THREE.LatheGeometry(pts2, 176);
  geo.computeVertexNormals();
  return geo;
}

// Bent capsule-like limb: a Catmull-Rom tube plus a rounded cap at the free end, so an arm reads
// as a relaxed, slightly curved shape instead of a straight cylinder stub.
function curvedLimb(points, radius, material, capRadius = radius * 1.15) {
  const group = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, radius, 10, false), material);
  const capPos = points[points.length - 1];
  const cap = new THREE.Mesh(new THREE.SphereGeometry(capRadius, 14, 10), material);
  cap.scale.set(1, 0.82, 1);
  cap.position.set(...capPos);
  tube.castShadow = cap.castShadow = true;
  group.add(tube, cap);
  return group;
}

function arm(sign) {
  // Shoulder starts right at the torso surface (not buried inside the transmissive jelly, where
  // it read as a faint bump), sweeps outward past the body's own widest point, then hangs down
  // relaxed at roughly 45 degrees — clearly visible outside the silhouette, as in the flat brief.
  const shoulderY = 0.22;
  const r = bodyRadiusAtY(shoulderY);
  const pts = [
    [sign * r * 0.92, shoulderY, 0.14],
    [sign * 1.18, -0.05, 0.22],
    [sign * 1.28, -0.42, 0.3],
    [sign * 1.16, -0.76, 0.34],
  ];
  return { pts, radius: 0.13 };
}

function leg(sign) {
  const hipY = GROUND_Y + 0.5;
  const pts = [
    [sign * 0.28, hipY, 0.18],
    [sign * 0.3, GROUND_Y + 0.22, 0.24],
    [sign * 0.3, GROUND_Y + 0.06, 0.3],
  ];
  return { pts, radius: 0.15 };
}

function foot(sign, materials) {
  const f = new THREE.Mesh(new THREE.SphereGeometry(0.19, 18, 12), materials.limb);
  f.scale.set(1.15, 0.62, 1.35);
  f.position.set(sign * 0.3, GROUND_Y + 0.19 * 0.62, 0.36);
  f.castShadow = f.receiveShadow = true;
  f.name = `foot${sign > 0 ? 'R' : 'L'}`;
  return f;
}

export function buildBody(materials, textures) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(latheBody(), materials.jelly);
  body.castShadow = body.receiveShadow = true;
  group.add(body);

  const fabric = new THREE.Mesh(new THREE.SphereGeometry(0.6, 22, 16), materials.fabric);
  fabric.scale.set(1, 1.22, 0.52);
  fabric.position.set(0, -0.02, 0.02);
  group.add(fabric);

  // No discrete "glow core" mesh: any alpha-cutoff sphere, however dim or deep, still has an edge —
  // through transmission=1 jelly that edge reads as a hard dot (the "burnt" spot the brief flagged,
  // worst right under the bow tie). The living inner light instead comes only from the jelly
  // material's own body-wide emissive gradient (materials.js `withRimGlow`) — no point, no edge,
  // just the material glowing evenly from within, brighter at the rim.

  const bubbleGeo = new THREE.SphereGeometry(1, 10, 8);
  const rand = rng(42);
  for (let i = 0; i < 14; i++) {
    const r = 0.02 + rand() * 0.05;
    const theta = rand() * Math.PI * 2;
    const u = rand() * 2 - 1;
    const rad = 0.3 + rand() * 0.55;
    const py = -0.7 + rand() * 1.6;
    const b = new THREE.Mesh(bubbleGeo, materials.bubble);
    b.scale.setScalar(r);
    b.position.set(Math.cos(theta) * rad * Math.sqrt(1 - u * u) * 0.9, py, Math.sin(theta) * rad * Math.sqrt(1 - u * u) * 0.9);
    group.add(b);
  }

  for (const sign of [-1, 1]) {
    const a = arm(sign);
    group.add(curvedLimb(a.pts, a.radius, materials.limb));
    const l = leg(sign);
    group.add(curvedLimb(l.pts, l.radius, materials.limb, 0.17));
    group.add(foot(sign, materials));
  }

  void textures;
  return group;
}
