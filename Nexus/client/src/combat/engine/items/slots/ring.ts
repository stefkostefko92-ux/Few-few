// Пръстен — процедурен: лента с профил, чашка с кичури и фасетиран камък (или печат/„око" по име).
// Размери: ⌀ ≈ 2 см. Редкостта дава размер на камъка/кичурите; семейството — метала (виж photoreal/plan).
import * as THREE from 'three/webgpu';
import { merge, xf, mesh, flatten } from '../../boy/src/geo.js';
import type { BoyMaterials } from '../boy-materials';
import type { Rand } from '../rng';
import { brilliant, cabochon, elongated, prongs } from './gems';

type Pieces = [THREE.BufferGeometry, THREE.Material][];

/** Профилирана лента: външен овал, по-широка отгоре (към чашката), тънка отдолу. */
function band(R: number, wTop: number, wBot: number, thick: number): THREE.BufferGeometry {
  const segs = 96;
  const prof = [[-1, 0.2], [-0.6, 1], [0.6, 1], [1, 0.2], [0.6, -0.2], [-0.6, -0.2]];
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const w = wBot + (wTop - wBot) * Math.pow((Math.cos(a) + 1) / 2, 2.2);
    for (const [u, v] of prof) {
      const r = R + v * thick;
      pos.push(Math.sin(a) * r, Math.cos(a) * r, u * w);
    }
  }
  const k = prof.length;
  for (let i = 0; i < segs; i++) for (let j = 0; j < k; j++) {
    const a = i * k + j; const b = i * k + ((j + 1) % k); const c = (i + 1) * k + j; const d = (i + 1) * k + ((j + 1) % k);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildRing(M: BoyMaterials, name: string, rand: Rand, gemSize: number): THREE.Object3D {
  const R = 0.0095;
  const g = new THREE.Group();
  const signet = /signet|sigil|seal/i.test(name);
  const eye = /eye|orb/i.test(name);
  const wide = signet ? 0.0075 : 0.0042;
  g.add(mesh(band(R, wide, 0.0022, 0.0016), M.goldB));
  const topY = R + 0.0016;
  const gs = 0.0036 + gemSize * 0.0022;
  if (signet) {
    g.add(mesh(merge([
      xf(new THREE.CylinderGeometry(0.0074, 0.0066, 0.0024, 6), [0, topY + 0.001, 0], [0, 0, 0], [1, 1, 1.15]),
      xf(new THREE.TorusGeometry(0.0066, 0.0006, 6, 24), [0, topY + 0.0023, 0], [Math.PI / 2, 0, 0]),
    ]), M.goldB));
    g.add(mesh(xf(elongated(0.0034, 0.0022, 1.0, 6), [0, topY + 0.0022, 0], [0, rand() * 1.0, 0]), (M as unknown as { gem: THREE.Material }).gem));
  } else if (eye) {
    g.add(mesh(merge(prongs(gs * 1.05, 6, topY + 0.002, 0.0006)), M.goldB));
    g.add(mesh(xf(cabochon(gs * 1.2, 0.95), [0, topY + 0.001, 0], [Math.PI / 2 * 0, 0, 0]), (M as unknown as { gem: THREE.Material }).gem));
    g.add(mesh(xf(new THREE.SphereGeometry(gs * 0.38, 16, 12), [0, topY + 0.002, gs * 0.95]), M.slit));
  } else {
    g.add(mesh(merge([
      xf(new THREE.CylinderGeometry(gs * 1.15, gs * 0.8, 0.0024, 12), [0, topY + 0.0004, 0]),
      ...prongs(gs * 0.95, 4, topY + 0.0036, 0.0006),
    ]), M.goldB));
    g.add(mesh(xf(brilliant(gs, gs * 1.5, 8), [0, topY + 0.0016, 0]), (M as unknown as { gem: THREE.Material }).gem));
  }
  // малки камъчета отстрани за по-висока редкост
  if (gemSize > 0.8 && !signet) {
    for (const s of [-1, 1]) g.add(mesh(xf(brilliant(0.0016, 0.0024, 6), [s * 0.0046, R * 0.93, 0], [0, 0, -s * 0.5]), (M as unknown as { gem: THREE.Material }).gem));
  }
  g.rotation.x = -0.55; // леко наклонен към камерата, камъкът се вижда отгоре
  g.rotation.y = 0.3;
  g.updateMatrixWorld(true);
  const flat = flatten(g) as Pieces;
  const out = new THREE.Group();
  for (const [geo, mat] of flat) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; out.add(m); }
  return out;
}
