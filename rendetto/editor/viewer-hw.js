// Purchased items in 3D, built from the catalog geometry: handles by type and hole spacing, hinge cups and arms,
// legs, hanging rails, slatted bases, mattress and worktop. Sizes in metres; S converts from the model's mm.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const S = 0.001;

// Handle on a front: the group's origin is the handle centre on the front face, +z points away from the front.
export function handleMesh(mats, sym) {
  const h = sym.model;
  const finish = `${h.finish ?? ''} ${h.color ?? ''}`;
  const metal = mats.metal(finish);
  const g = new THREE.Group();
  const spacing = (h.holes === 2 && h.spacing ? h.spacing : 0) * S;
  const len = Math.max((h.length ?? 0) * S, spacing + 0.024, 0.03);
  const type = h.type;
  if (type === 'knob' || h.holes === 1) {
    const d = Math.max(0.018, Math.min(0.045, (h.width ?? 28) * S));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(d / 2, 24, 16), metal);
    knob.scale.set(1, 1, 0.75);
    knob.position.z = 0.022;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.018, 16), metal);
    stem.rotation.x = Math.PI / 2;
    stem.position.z = 0.009;
    g.add(knob, stem);
  } else if (type === 'profile' || type === 'edge' || type === 'gola') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.02, 0.016), metal);
    bar.position.z = 0.008;
    g.add(bar);
  } else if (type === 'recessed' || type === 'shell') {
    const plate = new THREE.Mesh(
      new RoundedBoxGeometry(Math.max(len, 0.06), 0.03, 0.004, 3, 0.006),
      metal,
    );
    plate.position.z = 0.002;
    const cup = new THREE.Mesh(
      new RoundedBoxGeometry(Math.max(len, 0.06) - 0.012, 0.018, 0.003, 3, 0.005),
      mats.plain('cupdark', { color: 0x161616, roughness: 0.7 }),
    );
    cup.position.z = 0.0035;
    g.add(plate, cup);
  } else {
    const r = Math.max(0.004, Math.min(0.008, ((h.width ?? 12) * S) / 2));
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 20), metal);
    bar.rotation.z = Math.PI / 2;
    bar.position.z = 0.03;
    g.add(bar);
    for (const dx of spacing ? [-spacing / 2, spacing / 2] : [-len / 2 + 0.012, len / 2 - 0.012]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r * 0.7, 0.03, 12), metal);
      post.rotation.x = Math.PI / 2;
      post.position.set(dx, 0, 0.015);
      g.add(post);
    }
  }
  if (!sym.horizontal) g.rotation.z = Math.PI / 2;
  g.traverse((o) => {
    o.castShadow = true;
  });
  return g;
}

// Hinge cup in the door back and the arm reaching into the carcass (door-local, origin at the cup centre).
export function hingeMesh(mats, cupD, towardsCarcass) {
  const metal = mats.metal('');
  const g = new THREE.Group();
  const cup = new THREE.Mesh(
    new THREE.CylinderGeometry((cupD / 2) * S, (cupD / 2) * S, 0.003, 28),
    metal,
  );
  cup.rotation.x = Math.PI / 2;
  cup.position.z = -0.0015;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 0.05), metal);
  arm.position.set(towardsCarcass * 0.004, 0, -0.027);
  arm.castShadow = true;
  g.add(cup, arm);
  return g;
}

export function legMesh(mats, h) {
  const plastic = mats.plain('plastic', { color: 0x2a2b2d, roughness: 0.55 });
  const g = new THREE.Group();
  const H = h * S;
  const leg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, Math.max(0.001, H - 0.012), 24),
    plastic,
  );
  leg.position.y = (H - 0.012) / 2 + 0.012;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.022, 0.012, 24), plastic);
  foot.position.y = 0.006;
  leg.castShadow = foot.castShadow = true;
  g.add(leg, foot);
  return g;
}

export function railMesh(mats, len) {
  const tube = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.0075, Math.max(0.01, len * S - 0.015), 6, 16),
    mats.metal('chrome'),
  );
  tube.rotation.z = Math.PI / 2;
  tube.scale.set(2, 1, 1); // oval: taller than deep
  tube.castShadow = true;
  return tube;
}

export function slatsMesh(mats, s) {
  const wood = mats.plain('beech', { color: 0xd8b98f, roughness: 0.6 });
  const g = new THREE.Group();
  const bases = s.split
    ? [
        [s.x0, s.split],
        [s.split, s.x1],
      ]
    : [[s.x0, s.x1]];
  for (const [a, b] of bases) {
    const w = (b - a - 6) * S;
    const L = (s.z1 - s.z0 - 6) * S;
    const cx = ((a + b) / 2) * S;
    for (const dx of [-w / 2 + 0.0125, w / 2 - 0.0125]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.05, L), wood);
      rail.position.set(cx + dx, 0.025, 0);
      g.add(rail);
    }
    for (let z = -L / 2 + 0.05; z < L / 2 - 0.03; z += 0.07) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(w, 0.008, 0.053), wood);
      slat.position.set(cx, 0.054, z);
      slat.castShadow = true;
      g.add(slat);
    }
  }
  g.position.set(0, s.y * S, ((s.z0 + s.z1) / 2) * S);
  return g;
}

export function mattressMesh(mats, s) {
  const fabric = mats.plain('fabric', { color: 0xe9e6df, roughness: 0.95 });
  const m = new THREE.Mesh(
    new RoundedBoxGeometry((s.x1 - s.x0) * S, s.h * S, (s.z1 - s.z0) * S, 4, 0.04),
    fabric,
  );
  m.position.set(((s.x0 + s.x1) / 2) * S, (s.y + s.h / 2) * S, ((s.z0 + s.z1) / 2) * S);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function worktopMesh(mats, s, material) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry((s.x1 - s.x0) * S, s.t * S, (s.z1 - s.z0) * S),
    material,
  );
  m.position.set(((s.x0 + s.x1) / 2) * S, (s.y + s.t / 2) * S, ((s.z0 + s.z1) / 2) * S);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
