// Амулет — верига от преплетени звена по овална крива (отворена отгоре) и висулка по името:
// талисман (медальон с руническо кълбо), висулка (сълза), сигил (звезда), по подразбиране — камък в чашка.
import * as THREE from 'three/webgpu';
import { merge, xf, mesh, flatten } from '../../boy/src/geo.js';
import type { BoyMaterials } from '../boy-materials';
import type { Rand } from '../rng';
import { brilliant, cabochon, chainAlong, elongated, prongs } from './gems';

type Pieces = [THREE.BufferGeometry, THREE.Material][];

function star(points: number, ro: number, ri: number, depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? ri : ro;
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.4, bevelSize: ro * 0.04, bevelSegments: 2 });
}

export function buildAmulet(M: BoyMaterials, name: string, rand: Rand, gemSize: number): THREE.Object3D {
  const gem = (M as unknown as { gem: THREE.Material }).gem;
  const g = new THREE.Group();
  // веригата: падаща „U" крива, широка 12 см, висока 14 см, отворена при шията
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI * (0.1 + (i / 24) * 0.8);
    pts.push(new THREE.Vector3(Math.cos(a) * 0.058, -Math.sin(a) * 0.12 + 0.0, Math.sin(a * 2) * 0.004));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  g.add(mesh(merge(chainAlong(curve, 54, 0.0034, 0.00075)), M.goldB));
  const bottomY = -0.12;
  const talisman = /talisman|ledger|ward/i.test(name);
  const sigil = /sigil|seal/i.test(name);
  const eye = /eye/i.test(name);
  const drop = !talisman && !sigil && !eye && /pendant|drop|tear|orsis/i.test(name);
  const r = 0.02;
  g.add(mesh(merge([xf(new THREE.TorusGeometry(0.0042, 0.0012, 8, 16), [0, bottomY + 0.003, 0], [0, 0, 0], [1, 1.2, 1])]), M.goldB));
  const cy = bottomY - 0.02;
  if (talisman || eye) {
    g.add(mesh(merge([
      xf(new THREE.CylinderGeometry(r * 1.2, r * 1.2, 0.005, 40), [0, cy, 0], [Math.PI / 2, 0, 0]),
      xf(new THREE.TorusGeometry(r * 1.18, 0.0024, 10, 48), [0, cy, 0.0028]),
      xf(new THREE.TorusGeometry(r * 0.62, 0.0014, 8, 40), [0, cy, 0.0034]),
      ...Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return xf(new THREE.SphereGeometry(0.0016, 8, 6), [Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9, 0.0038]); }),
      ...prongs(r * 0.62, 6, 0, 0.0011).map((p) => xf(p, [0, cy, 0.003], [Math.PI / 2, 0, 0])),
    ]), M.goldB));
    g.add(mesh(xf(cabochon(r * 0.58, 0.8), [0, cy, 0.0035], [Math.PI / 2, 0, 0]), gem));
    if (eye) g.add(mesh(xf(new THREE.SphereGeometry(r * 0.22, 16, 12), [0, cy, 0.0035 + r * 0.38]), M.slit));
  } else if (sigil) {
    g.add(mesh(xf(star(6 + Math.floor(rand() * 3), r * 1.35, r * 0.62, 0.0035), [0, cy, -0.002]), M.goldB));
    g.add(mesh(xf(brilliant(r * 0.42, r * 0.6, 8), [0, cy, 0.003], [Math.PI / 2, 0, 0]), gem));
  } else if (drop) {
    g.add(mesh(merge([xf(new THREE.TorusGeometry(r * 0.78, 0.0022, 8, 28), [0, cy - 0.003, 0.0], [0, 0, 0], [0.8, 1.25, 1]), ...prongs(r * 0.55, 4, 0, 0.0012).map((p) => xf(p, [0, cy + r * 0.8, 0]))]), M.goldB));
    g.add(mesh(xf(elongated(r * 0.55, r * 0.9, 1.0, 8), [0, cy - 0.003, 0], [Math.PI / 2, 0, 0], [0.9, 1.3, 1]), gem));
  } else {
    g.add(mesh(merge([xf(new THREE.CylinderGeometry(r * 0.92, r * 0.75, 0.006, 8), [0, cy, 0], [Math.PI / 2, 0, 0]), ...prongs(r * 0.8, 6, 0, 0.0014).map((p) => xf(p, [0, cy, 0.0035], [Math.PI / 2, 0, 0]))]), M.goldB));
    g.add(mesh(xf(brilliant(r * (0.6 + gemSize * 0.18), r * 0.95, 8), [0, cy, 0.0035], [Math.PI / 2, 0, 0]), gem));
  }
  g.rotation.x = -0.12;
  g.rotation.y = 0.2;
  g.updateMatrixWorld(true);
  const out = new THREE.Group();
  for (const [geo, mat] of flatten(g) as Pieces) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; out.add(m); }
  return out;
}
