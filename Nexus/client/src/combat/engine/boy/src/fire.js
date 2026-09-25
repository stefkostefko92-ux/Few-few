// Braziers, wall torches and the burning outer bailey: iron work, flickering lights and the
// particle systems of flames.js (one instanced draw per system).
import * as THREE from 'three/webgpu';
import { BRAZIERS, FLAME_Y, GATE_FIRE } from './config.js';
import { lathe, ring, xf, merge, mesh, flatten } from './geo.js';
import { flames, embers, smoke } from './flames.js';

let seedState = 12345;
const rnd = () => {
  seedState = (seedState * 16807) % 2147483647;
  return seedState / 2147483647;
};

function brazierGeometry() {
  const legs = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    legs.push(xf(new THREE.CylinderGeometry(0.022, 0.028, 1.02, 8), [Math.cos(a) * 0.28, 0.5, Math.sin(a) * 0.28], [Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22]));
  }
  return merge([
    xf(lathe([[0.05, 0.0], [0.3, 0.07], [0.42, 0.2], [0.45, 0.25]], 28), [0, 0.92, 0]),
    xf(ring(0.45, 0.022, Math.PI * 2, 8, 40), [0, 1.17, 0]),
    xf(ring(0.2, 0.02, Math.PI * 2, 8, 24), [0, 0.3, 0]),
    ...legs,
  ]);
}

export function createFires(M, { shadowBrazier }) {
  const group = new THREE.Group();
  const lights = [];
  const flameList = [];
  const emitters = [];
  const plumes = [];
  const statics = new THREE.Group();
  const addLight = (pos, color, intensity, distance, castShadow) => {
    const l = new THREE.PointLight(color, intensity, distance, 2);
    l.position.copy(pos);
    l.castShadow = castShadow;
    l.shadow.mapSize.set(512, 512);
    l.shadow.radius = 4;
    l.shadow.bias = -0.002;
    l.shadow.normalBias = 0.03;
    l.shadow.camera.near = 0.3;
    l.shadow.camera.far = 22;
    group.add(l);
    lights.push({ light: l, base: intensity, seed: lights.length * 1.7, home: pos.clone() });
    return l;
  };
  const bGeo = brazierGeometry();
  const coalGeo = merge([
    xf(new THREE.CircleGeometry(0.4, 24), [0, 1.1, 0], [-Math.PI / 2, 0, 0]),
    ...Array.from({ length: 9 }, (_, k) => xf(new THREE.IcosahedronGeometry(0.06 + (k % 3) * 0.02, 0), [Math.cos(k * 2.4) * 0.22 * ((k % 4) / 4 + 0.3), 1.12, Math.sin(k * 2.4) * 0.22 * ((k % 4) / 4 + 0.3)])),
  ]);
  BRAZIERS.forEach((b, i) => {
    const bowl = mesh(bGeo, M.iron);
    bowl.position.copy(b);
    statics.add(bowl);
    const coals = mesh(coalGeo, M.coal, { cast: false });
    coals.position.copy(b);
    statics.add(coals);
    const fp = new THREE.Vector3(b.x, FLAME_Y - 0.28, b.z);
    flameList.push({ pos: fp, w: 1.0, h: 1.55, intensity: 2.4, seed: i * 1.3 }, { pos: fp, w: 0.55, h: 0.95, intensity: 3.4, seed: i * 1.3 + 0.6 });
    emitters.push({ origin: new THREE.Vector3(b.x, FLAME_Y, b.z), count: 70, radius: 0.22, height: 3.2, size: 0.028 });
    for (let k = 0; k < 4; k++) plumes.push({ origin: new THREE.Vector3(b.x, FLAME_Y + 0.7, b.z), phase: k / 4 + i * 0.13 });
    addLight(new THREE.Vector3(b.x, FLAME_Y + 0.25, b.z), 0xff8a3c, 16, 20, i === shadowBrazier);
  });
  [[-1.5, -21.8], [1.7, -21.2], [0.2, -23.6]].forEach(([x, z], k) => {
    const p = new THREE.Vector3(x, -0.1, z);
    flameList.push({ pos: p, w: 3.0, h: 4.2, intensity: 1.9, seed: 7 + k }, { pos: p, w: 1.5, h: 2.5, intensity: 3.0, seed: 9 + k });
  });
  emitters.push({ origin: new THREE.Vector3(0, 2.0, -21.5), count: 380, radius: 1.6, height: 9, size: 0.05 });
  for (let k = 0; k < 6; k++) plumes.push({ origin: new THREE.Vector3((k - 2.5) * 1.2, 4.2, -22), phase: k / 6 });
  addLight(GATE_FIRE, 0xff7424, 55, 34, false);
  const bracket = merge([
    xf(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), [0, -0.12, 0.2], [Math.PI / 3, 0, 0]),
    xf(lathe([[0.02, -0.12], [0.08, 0.0], [0.1, 0.06]], 12), [0, 0, 0.36]),
  ]);
  [[-15.75, 3.2, -6], [-15.75, 3.2, 6.5], [15.75, 3.2, -6], [15.75, 3.2, 6.5], [-6.5, 3.4, -14.75], [6.5, 3.4, -14.75]].forEach(([x, y, z], k) => {
    const side = Math.abs(x) > 15;
    const inward = new THREE.Vector3(side ? -Math.sign(x) : 0, 0, side ? 0 : 1);
    const b = mesh(bracket, M.iron);
    b.position.set(x, y, z);
    b.lookAt(x + inward.x, y, z + inward.z);
    statics.add(b);
    const fp = new THREE.Vector3(x + inward.x * 0.36, y + 0.02, z + inward.z * 0.36);
    flameList.push({ pos: fp, w: 0.32, h: 0.62, intensity: 3.2, seed: 20 + k });
    emitters.push({ origin: fp.clone().setY(y + 0.35), count: 18, radius: 0.06, height: 1.4, size: 0.018 });
  });
  for (const [g, mat] of flatten(statics)) group.add(mesh(g, mat, { cast: mat !== M.coal }));
  const particles = [flames(flameList), embers(emitters, rnd), smoke(plumes)];
  particles.forEach((o) => group.add(o));
  return {
    group,
    lights,
    particles,
    update(t) {
      for (const L of lights) {
        const f = 0.8 + 0.1 * Math.sin(t * 13.1 + L.seed) + 0.07 * Math.sin(t * 27.3 + L.seed * 2.3) + 0.05 * Math.sin(t * 4.1 + L.seed);
        L.light.intensity = L.base * f;
        L.light.position.set(L.home.x + Math.sin(t * 9.3 + L.seed) * 0.03, L.home.y + Math.sin(t * 7.1) * 0.03, L.home.z + Math.cos(t * 8.7 + L.seed) * 0.03);
      }
    },
  };
}
