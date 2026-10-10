// Брадви, чукове и копия — процедурно в договора на boy оръжията (произход = хватката, +Y по
// дръжката). Главата е изтеглен силует (Extrude със скосяване — ръбът лови светлина), дръжката е
// дърво с кожена обмотка и метални пръстени. Вариант по име: двуостра/брадата брадва, чук, копие
// с листовиден връх, тризъбец.
import * as THREE from 'three/webgpu';
import { lathe, merge, xf, mesh, flatten } from '../../boy/src/geo.js';
import type { BoyMaterials } from '../boy-materials';
import type { Rand } from '../rng';

type Pieces = [THREE.BufferGeometry, THREE.Material][];

function extrude(pts: Array<[number, number]>, depth: number, bevel: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 3, curveSegments: 12 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Дръжка: леко конусна, с кожена обмотка в долната трета, пръстен под главата и пета. */
function haft(M: BoyMaterials, g: THREE.Group, len: number, r: number): void {
  g.add(mesh(xf(new THREE.CylinderGeometry(r * 0.92, r * 1.08, len, 16), [0, len / 2 - 0.08, 0]), M.wood));
  g.add(mesh(xf(new THREE.CylinderGeometry(r * 1.2, r * 1.2, len * 0.28, 16), [0, len * 0.14 - 0.02, 0], [0, 0, 0], [1.05, 1, 1.05]), M.leather));
  g.add(mesh(merge([
    xf(new THREE.TorusGeometry(r * 1.25, r * 0.22, 8, 20), [0, len * 0.29, 0], [Math.PI / 2, 0, 0]),
    xf(new THREE.TorusGeometry(r * 1.25, r * 0.22, 8, 20), [0, len * 0.0 - 0.02, 0], [Math.PI / 2, 0, 0]),
  ]), M.goldB));
  g.add(mesh(lathe([[0, -0.1], [r * 1.1, -0.095], [r * 1.35, -0.07], [r * 1.2, -0.04], [r * 1.0, -0.03]], 18), M.goldB));
}

function axeHead(M: BoyMaterials, g: THREE.Group, top: number, double: boolean, hammer: boolean): void {
  const W = double ? 0.2 : 0.26;
  const beard: Array<[number, number]> = [[0.0, 0.11], [0.05, 0.125], [W * 0.5, 0.17], [W * 0.82, 0.215], [W * 0.99, 0.2], [W * 1.04, 0.08], [W * 1.02, -0.04], [W * 0.96, -0.15], [W * 0.78, -0.17], [W * 0.55, -0.11], [W * 0.28, -0.075], [0.0, -0.075]];
  const poll: Array<[number, number]> = double
    ? beard.map(([x, y]) => [-x, y] as [number, number]).reverse()
    : [[0, 0.06], [-0.075, 0.05], [-0.095, 0.03], [-0.095, -0.03], [-0.075, -0.05], [0, -0.06]];
  const body = hammer
    ? [[-0.06, 0.06], [0.06, 0.06], [0.07, 0.0], [0.06, -0.06], [-0.06, -0.06]] as Array<[number, number]>
    : beard;
  const head = new THREE.Group();
  head.add(mesh(extrude(body, 0.018, 0.0045), M.blade));
  head.add(mesh(extrude(poll, 0.018, 0.0045), hammer ? M.blade : M.bladeDark));
  if (hammer) head.add(mesh(xf(new THREE.CylinderGeometry(0.03, 0.045, 0.07, 6), [-0.11, 0, 0], [0, 0, Math.PI / 2]), M.bladeDark));
  head.add(mesh(xf(new THREE.CylinderGeometry(0.026, 0.026, 0.14, 14), [0, 0.0, 0]), M.goldB));
  head.add(mesh(merge([xf(new THREE.TorusGeometry(0.027, 0.0045, 8, 22), [0, 0.065, 0], [Math.PI / 2, 0, 0]), xf(new THREE.TorusGeometry(0.027, 0.0045, 8, 22), [0, -0.065, 0], [Math.PI / 2, 0, 0])]), M.brass));
  head.position.set(0, top, 0);
  g.add(head);
}

function spearHead(M: BoyMaterials, g: THREE.Group, top: number, trident: boolean): void {
  const leaf: Array<[number, number]> = [[0.0, 0], [0.018, 0.016], [0.05, 0.09], [0.046, 0.19], [0.0, 0.34], [-0.046, 0.19], [-0.05, 0.09], [-0.018, 0.016]];
  const head = new THREE.Group();
  if (trident) {
    const prong = (x: number, h: number, w: number): THREE.BufferGeometry => xf(extrude([[0, 0], [w, 0.01], [w * 0.8, h * 0.7], [0, h], [-w * 0.8, h * 0.7], [-w, 0.01]], 0.01, 0.003), [x, 0.06, 0]);
    head.add(mesh(merge([prong(0, 0.3, 0.018), prong(-0.07, 0.22, 0.012), prong(0.07, 0.22, 0.012)]), M.blade));
    head.add(mesh(merge([xf(new THREE.TorusGeometry(0.07, 0.006, 8, 24, Math.PI), [0, 0.06, 0], [0, 0, Math.PI])]), M.blade));
  } else {
    const blade = extrude(leaf, 0.012, 0.004);
    head.add(mesh(xf(blade, [0, 0.07, 0]), M.blade));
    head.add(mesh(xf(new THREE.CylinderGeometry(0.0035, 0.0035, 0.3, 6), [0, 0.2, 0.0085]), M.bladeDark));
  }
  head.add(mesh(lathe([[0.011, 0], [0.02, 0.012], [0.019, 0.06], [0.014, 0.075], [0.0, 0.075]], 16), M.goldB));
  head.add(mesh(xf(new THREE.TorusGeometry(0.021, 0.004, 8, 20), [0, 0.03, 0], [Math.PI / 2, 0, 0]), M.brass));
  head.position.set(0, top, 0);
  g.add(head);
}

export function buildPolearm(M: BoyMaterials, icon: string, name: string, rand: Rand): THREE.Object3D {
  const g = new THREE.Group();
  const spear = icon === 'spear';
  const hammer = /hammer|maul/i.test(name);
  const double = /double|reaper|headsman|greataxe|cleaver/i.test(name) && rand() < 0.7;
  const len = spear ? 1.25 : hammer ? 0.8 : 0.85;
  haft(M, g, len, spear ? 0.0165 : 0.0195);
  if (spear) spearHead(M, g, len - 0.08, /trident/i.test(name));
  else axeHead(M, g, len - 0.15, double, hammer);
  g.updateMatrixWorld(true);
  const out = new THREE.Group();
  for (const [geo, mat] of flatten(g) as Pieces) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; out.add(m); }
  return out;
}
