// Лицева маска/полумаска — вдлъбната черупка, която следва лице: челна дъга, надвесени вежди,
// нос, скули, сгъване встрани. Прорезите за очи са истински отвори (пропуснати триъгълници) с
// дебел кант; без каишка през предмета — само нитове при слепоочията. Лице към +Z.
import * as THREE from 'three/webgpu';
import { mesh, xf, merge, flatten } from '../../boy/src/geo.js';
import type { BoyMaterials } from '../boy-materials';

type Pieces = [THREE.BufferGeometry, THREE.Material][];

const SLANT = 0.4;
const gauss = (x: number, c: number, w: number): number => Math.exp(-((x - c) ** 2) / (2 * w * w));

/** Височина (z) на лицето във (x,y) метри: чело, вежди, нос, скули, обвиване встрани. */
function faceZ(x: number, y: number, wide: number): number {
  const ax = Math.abs(x);
  const wrap = -Math.pow(ax / (0.095 * wide), 2.0) * 0.03;
  const brow = 0.012 * gauss(y, 0.016, 0.009) * (1 - ax * 3);
  const forehead = 0.012 * Math.max(0, y) * 4;
  const nose = 0.03 * gauss(x, 0, 0.0085 + Math.max(0, -y) * 0.04) * (y < 0.012 ? Math.min(1, (0.03 + y) / 0.03 + 0.2) : 0) * (y > -0.07 ? 1 : 0);
  const cheek = 0.014 * gauss(ax, 0.052, 0.016) * gauss(y, -0.03, 0.02);
  return 0.092 + wrap + brow + forehead + nose + cheek - 0.004 * (y < -0.04 ? (-0.04 - y) * 12 : 0);
}

function shell(half: boolean): THREE.BufferGeometry {
  const W = 0.092; const top = 0.075; const bot = half ? -0.045 : -0.085;
  const nx = 90; const ny = 70;
  const inEye = (x: number, y: number): boolean => {
    const ax = Math.abs(x) - 0.036;
    const yy = y - 0.008 - ax * SLANT * 0.5;
    return (ax / 0.021) ** 2 + (yy / 0.0085) ** 2 < 1;
  };
  const pos: number[] = []; const idx: number[] = [];
  for (let j = 0; j <= ny; j++) {
    const v = j / ny; const y = top + (bot - top) * v;
    const hw = W * (1 - 0.18 * Math.pow(v, 2.4));
    for (let i = 0; i <= nx; i++) {
      const x = (i / nx - 0.5) * 2 * hw;
      pos.push(x, y, faceZ(x, y, 1));
    }
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i; const b = a + 1; const c = a + nx + 1; const d = c + 1;
    const cx = (pos[a * 3] + pos[d * 3]) / 2; const cy = (pos[a * 3 + 1] + pos[d * 3 + 1]) / 2;
    if (inEye(cx, cy)) continue;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildMask(M: BoyMaterials, half: boolean): THREE.Object3D {
  const g = new THREE.Group();
  g.add(mesh(shell(half), M.steelA));
  // дебел кант около очите (елипса върху повърхността) и по горния ръб
  for (const s of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const ax = 0.021 * Math.cos(a);
      const x = s * (0.036 + ax); const y = 0.008 + ax * SLANT * 0.5 + 0.0085 * Math.sin(a);
      pts.push(new THREE.Vector3(x, y, faceZ(x, y, 1) + 0.0012));
    }
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, 0.0027, 8, true), M.goldB));
  }
  const edge: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) { const x = (i / 40 - 0.5) * 0.184; edge.push(new THREE.Vector3(x, 0.075, faceZ(x, 0.075, 1))); }
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 60, 0.0028, 8, false), M.goldB));
  for (const s of [-1, 1]) g.add(mesh(merge([xf(new THREE.SphereGeometry(0.0036, 10, 8), [s * 0.083, 0.05, faceZ(s * 0.083, 0.05, 1)]), xf(new THREE.SphereGeometry(0.0036, 10, 8), [s * 0.08, -0.002, faceZ(s * 0.08, -0.002, 1)])]), M.brass));
  g.rotation.set(-0.1, 0.16, 0);
  g.updateMatrixWorld(true);
  const out = new THREE.Group();
  for (const [geo, mat] of flatten(g) as Pieces) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; out.add(m); }
  return out;
}
