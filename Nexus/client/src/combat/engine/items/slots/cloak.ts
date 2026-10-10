// Плащ/мантия — собствена драпировка (вместо симулирания боен плащ, който се чете като плоска
// лента без тяло): ветрилообразен плат с дълбоки гънки, обвит напред при раменете, яка със
// закопчалка-брошка и златен кант по подгъва. Лице към +Z. Размери в метри (≈ 0.9 м висок).
import * as THREE from 'three/webgpu';
import { lathe, merge, xf, mesh, flatten } from '../../boy/src/geo.js';
import type { BoyMaterials } from '../boy-materials';
import type { Rand } from '../rng';
import { brilliant, prongs } from './gems';

type Pieces = [THREE.BufferGeometry, THREE.Material][];

function drape(rand: Rand, pleats: number): THREE.BufferGeometry {
  const cols = 120; const rows = 60;
  const H = 0.9; const wTop = 0.26; const wBot = 0.78;
  const ph = rand() * 6;
  const pos: number[] = []; const uv: number[] = []; const idx: number[] = [];
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    const w = wTop + (wBot - wTop) * Math.pow(v, 0.8);
    for (let i = 0; i <= cols; i++) {
      const u = i / cols - 0.5;
      const edge = Math.abs(u) * 2;
      const amp = 0.012 + 0.05 * Math.pow(v, 1.1);
      const fold = Math.sin(u * Math.PI * pleats + ph) * amp + Math.sin(u * Math.PI * pleats * 2.3 + ph * 2) * amp * 0.28;
      const wrap = 0.17 * Math.pow(edge, 2) * (1 - v * 0.55);
      const x = u * w;
      const y = -v * H;
      const z = wrap + fold - 0.04 * Math.sin(v * Math.PI) ;
      pos.push(x, y, z); uv.push(i / cols, v);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i; const b = a + 1; const c = a + cols + 1; const d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildCloak(M: BoyMaterials, name: string, rand: Rand, gemSize: number): THREE.Object3D {
  const gem = (M as unknown as { gem: THREE.Material }).gem;
  const g = new THREE.Group();
  g.add(mesh(drape(rand, 6 + Math.floor(rand() * 4)), M.capeA));
  // подгъв-кант (тънка лента по долния ръб) — лента от вътрешен/външен ръб
  const hem: THREE.Vector3[] = [];
  for (let i = 0; i <= 60; i++) { const u = i / 60 - 0.5; hem.push(new THREE.Vector3(u * 0.78, -0.9, 0.17 * Math.pow(Math.abs(u) * 2, 2) * 0.45)); }
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hem), 80, 0.006, 6, false), M.goldB));
  // яка: пръстеновидна, малко надигната
  g.add(mesh(lathe([[0.1, 0.03], [0.13, 0.04], [0.145, 0.0], [0.14, -0.05], [0.11, -0.07]], 48, 0.5, Math.PI * 1.1), M.capeB));
  // закопчалка: златен диск + камък + пръстен кант
  const cx = 0; const cy = -0.045; const cz = 0.12;
  g.add(mesh(merge([
    xf(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 28), [cx, cy, cz], [Math.PI / 2, 0, 0]),
    xf(new THREE.TorusGeometry(0.03, 0.004, 8, 32), [cx, cy, cz + 0.004]),
    ...prongs(0.016, 6, 0, 0.0016).map((p) => xf(p, [cx, cy, cz + 0.006], [Math.PI / 2, 0, 0])),
  ]), M.goldB));
  g.add(mesh(xf(brilliant(0.013 + gemSize * 0.004, 0.02, 8), [cx, cy, cz + 0.007], [Math.PI / 2, 0, 0]), gem));
  // ремък/верижка през гърдите
  g.add(mesh(xf(new THREE.TorusGeometry(0.13, 0.0035, 6, 40, Math.PI), [0, -0.05, 0.02], [0, 0, Math.PI]), M.goldB));
  void name;
  g.updateMatrixWorld(true);
  const out = new THREE.Group();
  for (const [geo, mat] of flatten(g) as Pieces) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; out.add(m); }
  return out;
}
