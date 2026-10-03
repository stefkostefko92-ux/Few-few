// Purchased items in 3D, built from the catalogue and the drilling: hinge cups in the doors and arms on their
// mounting plates, shelf pins, levelling legs, hanging rails with their holders, slatted bases, the mattress and the
// worktop. Handles are in viewer-handles.js. Sizes in metres; S converts from the model's mm.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { panelGeometry } from './viewer-panel.js';

export const S = 0.001;

function shadowed(o) {
  o.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return o;
}

function lathe(profile, segments = 32) {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

// Hinge cup seen on the back of a door: the Ø35 cup is sunk into the board, its flange and screw ears show.
export function hingeMesh(mats, cupD) {
  const metal = mats.metal('никел');
  const g = new THREE.Group();
  const R = (cupD / 2) * S;
  const flange = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.0035, R + 0.0035, 0.0012, 40),
    metal,
  );
  flange.rotation.x = Math.PI / 2;
  flange.position.z = -0.0006;
  const ears = new THREE.Mesh(new RoundedBoxGeometry(0.054, 0.012, 0.0012, 2, 0.0005), metal);
  ears.position.z = -0.0006;
  const well = new THREE.Mesh(
    new THREE.CylinderGeometry(R - 0.002, R - 0.002, 0.0013, 32),
    mats.plain('hinge-dark', { color: 0x3a3b3d, metalness: 0.6, roughness: 0.45 }),
  );
  well.rotation.x = Math.PI / 2;
  well.position.z = -0.0007;
  g.add(flange, ears, well);
  return shadowed(g);
}

// Mounting plate on the carcass side and the hinge arm reaching forward to the door. `inward` is the x direction
// into the cabinet, `front` the z of the carcass front edge, origin at the plate centre on the side face.
export function hingeArmMesh(mats, inward, reach) {
  const metal = mats.metal('никел');
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new RoundedBoxGeometry(0.009, 0.014, 0.042, 2, 0.002), metal);
  plate.position.x = inward * 0.0045;
  const armLen = Math.max(0.03, reach + 0.004);
  const arm = new THREE.Mesh(new RoundedBoxGeometry(0.011, 0.016, armLen, 3, 0.003), metal);
  arm.position.set(inward * 0.0125, 0, armLen / 2 - 0.02);
  const cap = new THREE.Mesh(
    new RoundedBoxGeometry(0.0115, 0.0165, 0.022, 3, 0.003),
    mats.metal('хром'),
  );
  cap.position.set(inward * 0.0127, 0, armLen - 0.034);
  g.add(plate, arm, cap);
  return shadowed(g);
}

// Shelf pin: Ø5 pin in the system hole with a support collar the shelf rests on (origin on the side face).
let pinGeo = null;
export function shelfPinGeometry() {
  if (!pinGeo) {
    pinGeo = lathe(
      [
        [0, 0],
        [0.0042, 0],
        [0.0042, 0.0015],
        [0.0025, 0.002],
        [0.0025, 0.009],
        [0, 0.0095],
      ],
      16,
    );
  }
  return pinGeo;
}

// Levelling leg of a kitchen base: mounting plate, ribbed body, adjusting ring and the foot.
export function legMesh(mats, h) {
  const plastic = mats.plain('plastic', {
    color: 0x202123,
    roughness: 0.42,
    clearcoat: 0.2,
    clearcoatRoughness: 0.5,
  });
  const H = Math.max(0.01, h * S);
  const foot = Math.min(0.012, H * 0.2);
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    lathe(
      [
        [0, 0],
        [0.023, 0],
        [0.023, foot * 0.6],
        [0.017, foot],
        [0.0145, foot + 0.003],
        [0.0145, H - 0.016],
        [0.019, H - 0.012],
        [0.019, H - 0.006],
        [0.016, H - 0.004],
        [0.016, H],
        [0, H],
      ],
      36,
    ),
    plastic,
  );
  const plate = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.004, 0.05, 2, 0.0015), plastic);
  plate.position.y = H - 0.002;
  g.add(body, plate);
  return shadowed(g);
}

// Oval hanging rail with an end holder screwed to each side.
export function railMesh(mats, len) {
  const chrome = mats.metal('хром');
  const g = new THREE.Group();
  const L = Math.max(0.02, len * S);
  const tube = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.0075, Math.max(0.01, L - 0.016), 6, 20),
    chrome,
  );
  tube.rotation.z = Math.PI / 2;
  tube.scale.set(2, 1, 1); // oval: taller than deep
  g.add(tube);
  for (const sx of [-1, 1]) {
    const holder = new THREE.Mesh(new RoundedBoxGeometry(0.004, 0.034, 0.026, 2, 0.0015), chrome);
    holder.position.x = sx * (L / 2 - 0.002);
    const cup = new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.024, 0.018, 2, 0.003), chrome);
    cup.position.x = sx * (L / 2 - 0.008);
    g.add(holder, cup);
  }
  return shadowed(g);
}

// Slatted base: two frames, bowed beech slats in black holders.
export function slatsMesh(mats, s) {
  const beech = mats.beech();
  const rubber = mats.plain('rubber', { color: 0x161617, roughness: 0.75 });
  const g = new THREE.Group();
  const bases = s.split
    ? [
        [s.x0, s.split],
        [s.split, s.x1],
      ]
    : [[s.x0, s.x1]];
  const L = (s.z1 - s.z0 - 6) * S;
  for (const [a, b] of bases) {
    const w = (b - a - 6) * S;
    const cx = ((a + b) / 2) * S;
    for (const dx of [-w / 2 + 0.0125, w / 2 - 0.0125]) {
      const rail = new THREE.Mesh(new RoundedBoxGeometry(0.025, 0.05, L, 2, 0.003), beech);
      rail.position.set(cx + dx, 0.025, 0);
      g.add(rail);
    }
    const slatGeo = new RoundedBoxGeometry(w - 0.01, 0.008, 0.053, 2, 0.003);
    const bow = slatGeo.attributes.position;
    for (let i = 0; i < bow.count; i++) {
      const x = bow.getX(i) / ((w - 0.01) / 2);
      bow.setY(i, bow.getY(i) + 0.006 * (1 - x * x));
    }
    slatGeo.computeVertexNormals();
    const capGeo = new RoundedBoxGeometry(0.03, 0.016, 0.06, 2, 0.004);
    for (let z = -L / 2 + 0.05; z < L / 2 - 0.03; z += 0.07) {
      const slat = new THREE.Mesh(slatGeo, beech);
      slat.position.set(cx, 0.056, z);
      g.add(slat);
      for (const dx of [-w / 2 + 0.0125, w / 2 - 0.0125]) {
        const cap = new THREE.Mesh(capGeo, rubber);
        cap.position.set(cx + dx, 0.054, z);
        g.add(cap);
      }
    }
  }
  g.position.set(0, s.y * S, ((s.z0 + s.z1) / 2) * S);
  return shadowed(g);
}

// Mattress: quilted top and bottom, plain border, piping round both edges.
export function mattressMesh(mats, s) {
  const W = (s.x1 - s.x0) * S;
  const H = s.h * S;
  const D = (s.z1 - s.z0) * S;
  const top = mats.fabric();
  const border = mats.border();
  const uv = (a, sgn, p) => (a === 1 ? [p[0], p[2]] : a === 0 ? [p[2], p[1]] : [p[0], p[1]]);
  const g = new THREE.Group();
  g.add(
    new THREE.Mesh(panelGeometry([W, H, D], 0.03, uv, 4, [2, 3]), top),
    new THREE.Mesh(panelGeometry([W, H, D], 0.03, uv, 4, [0, 1, 4, 5]), border),
  );
  const pipe = mats.plain('piping', {
    color: 0xe4e1d8,
    roughness: 0.85,
    sheen: 0.6,
    sheenRoughness: 0.5,
  });
  for (const y of [H / 2 - 0.008, -H / 2 + 0.008]) {
    const r = 0.03;
    const pts = [];
    const hx = W / 2 - 0.004;
    const hz = D / 2 - 0.004;
    for (const [cx, cz, a0] of [
      [hx - r, hz - r, 0],
      [-hx + r, hz - r, Math.PI / 2],
      [-hx + r, -hz + r, Math.PI],
      [hx - r, -hz + r, (3 * Math.PI) / 2],
    ]) {
      for (let i = 0; i <= 6; i++) {
        const a = a0 + (i / 6) * (Math.PI / 2);
        pts.push(new THREE.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r));
      }
    }
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 240, 0.0045, 10, true), pipe));
  }
  g.position.set(((s.x0 + s.x1) / 2) * S, (s.y + s.h / 2) * S, ((s.z0 + s.z1) / 2) * S);
  return shadowed(g);
}

// Worktop 38 mm, postformed: the decor wraps a rounded front edge; grain along the run.
export function worktopMesh(mats, s, material) {
  const size = [(s.x1 - s.x0) * S, s.t * S, (s.z1 - s.z0) * S];
  const geo = panelGeometry(
    size,
    0.003,
    (a, sgn, p) => (a === 1 ? [p[0] + size[0], p[2] + 0.3] : [p[0] + size[0], p[1] + 0.3]),
    3,
  );
  const m = new THREE.Mesh(geo, material);
  m.position.set(((s.x0 + s.x1) / 2) * S, (s.y + s.t / 2) * S, ((s.z0 + s.z1) / 2) * S);
  return shadowed(m);
}
