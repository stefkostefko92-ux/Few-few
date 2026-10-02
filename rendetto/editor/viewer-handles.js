// Handles in 3D by type, from the catalogue sizes (length, hole spacing, bar width, projection): bar handles turned
// as a tube with chamfered ends on two posts with rosettes, knobs turned on a lathe, the L-profile along the opening
// edge, the edge handle hooked over the edge of the front, recessed handles sunk into the face and the shell (cup)
// pull. Metres; the group's origin is the handle centre on the face, +z away from the front, x along the handle.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { wellMesh } from './viewer-well.js';

const S = 0.001;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Turned profile [[radius, axial], …] around the y axis, then laid along x (bar) or z (knob).
function lathe(profile, segments = 40) {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)),
    segments,
  );
}

// tube with chamfered ends, along y, length L, radius r
function tube(L, r) {
  const c = Math.min(r * 0.3, 0.0012);
  return lathe([
    [0, -L / 2],
    [r - c, -L / 2],
    [r, -L / 2 + c],
    [r, L / 2 - c],
    [r - c, L / 2],
    [0, L / 2],
  ]);
}

function barHandle(h, metal) {
  const g = new THREE.Group();
  const spacing = (h.holes === 2 && h.spacing ? h.spacing : 96) * S;
  const L = Math.max((h.length ?? 0) * S, spacing + 0.02);
  const proj = clamp((h.height ?? 32) * S, 0.022, 0.045);
  const w = (h.width ?? 12) * S;
  const flat = w < 0.008 || /правоъгъл|квадрат|square|flat|плоск/i.test(h.name ?? '');
  const r = flat ? 0.006 : clamp(w / 2, 0.0045, 0.009);
  let bar;
  if (flat) {
    const t = clamp(w, 0.004, 0.008);
    bar = new THREE.Mesh(new RoundedBoxGeometry(L, 0.012, t, 3, Math.min(t, 0.012) * 0.45), metal);
    bar.position.z = proj - t / 2;
  } else {
    bar = new THREE.Mesh(tube(L, r), metal);
    bar.rotation.z = Math.PI / 2;
    bar.position.z = proj - r;
  }
  g.add(bar);
  const pr = flat ? 0.0035 : clamp(r * 0.72, 0.0035, 0.0065);
  const postLen = Math.max(0.006, proj - (flat ? 0.004 : r));
  for (const dx of [-spacing / 2, spacing / 2]) {
    const post = new THREE.Mesh(
      lathe([
        [0, 0],
        [pr * 1.35, 0],
        [pr * 1.35, 0.0012],
        [pr, 0.0026],
        [pr, postLen],
        [0, postLen],
      ]),
      metal,
    );
    post.rotation.x = Math.PI / 2;
    post.position.x = dx;
    g.add(post);
  }
  return g;
}

function knob(h, metal) {
  const D = clamp((h.width ?? 30) * S, 0.016, 0.05);
  const H = clamp((h.height ?? 26) * S, 0.016, 0.045);
  const R = D / 2;
  const hh = Math.min(R * 0.85, H * 0.38);
  const yc = H - hh;
  const neck = R * 0.3;
  const a0 = -Math.acos(neck / R);
  const prof = [
    [0, 0],
    [R * 0.62, 0],
    [R * 0.62, 0.0012],
    [neck * 1.15, 0.004],
  ];
  for (let i = 0; i <= 14; i++) {
    const a = a0 + (i / 14) * (Math.PI / 2 - a0);
    prof.push([R * Math.cos(a), yc + hh * Math.sin(a)]);
  }
  const m = new THREE.Mesh(lathe(prof, 48), metal);
  m.rotation.x = Math.PI / 2;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

// L-profile on the face: a back plate screwed on, a lip standing off the front to grip behind.
function profileHandle(h, metal) {
  const L = Math.max((h.length ?? 0) * S, (h.spacing ?? 96) * S + 0.03);
  const s = new THREE.Shape();
  const t = 0.0018;
  s.moveTo(0, -0.011);
  s.lineTo(0, 0.011);
  s.lineTo(0.017, 0.011);
  s.quadraticCurveTo(0.02, 0.011, 0.02, 0.008);
  s.lineTo(0.02, 0.0045);
  s.lineTo(0.02 - t, 0.0045);
  s.lineTo(0.02 - t, 0.011 - t);
  s.lineTo(t, 0.011 - t);
  s.lineTo(t, -0.011);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: L,
    bevelEnabled: true,
    bevelSize: 0.0004,
    bevelThickness: 0.0004,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -L / 2);
  // shape x → away from the face, shape y → across, extrusion → along the handle
  const m = new THREE.Mesh(geo, metal);
  m.rotation.y = -Math.PI / 2;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

// Edge handle: a profile hooked over the edge of the front (offset is the distance from the handle centre to the
// edge it sits on, along the handle's cross direction), thickness of the front T.
function edgeHandle(h, metal, offset, T) {
  const L = Math.max((h.length ?? 0) * S, (h.spacing ?? 128) * S + 0.04);
  const t = 0.0018;
  const g = new THREE.Group();
  const cap = new THREE.Mesh(new RoundedBoxGeometry(L, t, T + 2 * t, 2, t * 0.45), metal);
  cap.position.set(0, offset + t / 2, -T / 2);
  const lip = new THREE.Mesh(new RoundedBoxGeometry(L, 0.016, t, 2, t * 0.45), metal);
  lip.position.set(0, offset - 0.008 + t, t / 2);
  const grip = new THREE.Mesh(new RoundedBoxGeometry(L, t, 0.012, 2, t * 0.45), metal);
  grip.position.set(0, offset - 0.016 + t, 0.006);
  g.add(cap, lip, grip);
  return g;
}

function recessed(h, metal, well) {
  const g = new THREE.Group();
  const round = (h.spacing ?? 0) < 40;
  if (round) {
    const D = clamp((h.width ?? h.length ?? 40) * S, 0.03, 0.06);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(D / 2, D / 2, 0.0012, 48), metal);
    rim.rotation.x = Math.PI / 2;
    rim.position.z = 0.0006;
    const cup = well(D / S - 8, 0, true);
    cup.position.z = 0.0013;
    g.add(rim, cup);
    return g;
  }
  const L = Math.max((h.length ?? 0) * S, (h.spacing ?? 128) * S + 0.03);
  const plate = new THREE.Mesh(new RoundedBoxGeometry(L, 0.04, 0.0014, 3, 0.0006), metal);
  plate.position.z = 0.0007;
  const cup = well(L / S - 12, 26, false);
  cup.position.z = 0.0015;
  g.add(plate, cup);
  return g;
}

// Shell pull: a hood over the upper half, open at the bottom for the fingers, on a flange with two screw ears.
function shell(h, metal) {
  const L = Math.max((h.length ?? 90) * S, (h.spacing ?? 64) * S + 0.03);
  const H = clamp((h.height ?? 29) * S, 0.022, 0.04);
  const g = new THREE.Group();
  const flange = new THREE.Mesh(new RoundedBoxGeometry(L, H, 0.0025, 3, 0.0011), metal);
  flange.position.z = 0.00125;
  const inside = metal.clone();
  inside.side = THREE.DoubleSide;
  // quarter of a sphere: after the turn it covers y ≥ 0 and stands off the face
  const hood = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 40, 12, Math.PI, Math.PI, 0, Math.PI / 2),
    inside,
  );
  hood.rotation.x = Math.PI / 2;
  hood.scale.set(L * 0.8, 0.016, H * 1.5);
  hood.position.set(0, -H * 0.28, 0.0025);
  g.add(flange, hood);
  return g;
}

// sym: the handle symbol; front: { T, edge } — thickness of the front and, for edge handles, how far the nearest
// edge of the front is from the handle centre (across the handle).
export function handleMesh(mats, sym, front = { T: 0.018, edge: 0.03 }) {
  const h = sym.model;
  const metal = mats.metal(h.finish ?? '', h.color ?? '');
  let g;
  if (h.type === 'knob' || h.holes === 1) g = knob(h, metal);
  else if (h.type === 'profile' || h.type === 'gola') g = profileHandle(h, metal);
  else if (h.type === 'edge') g = edgeHandle(h, metal, front.edge, front.T);
  else if (h.type === 'recessed')
    g = recessed(h, metal, (w, hh, round) => wellMesh(mats, metal, w, hh, round));
  else if (h.type === 'shell') g = shell(h, metal);
  else g = barHandle(h, metal);
  if (!sym.horizontal) g.rotation.z = Math.PI / 2;
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}
