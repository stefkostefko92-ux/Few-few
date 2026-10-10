// Качулки, маски, корони, диадеми, шапки, ризничен качулък — процедурно (boy няма тези силуети).
// Всички са в метри, в договора на buildHelm: начало на ЧЕЛОТО/темето, +Y нагоре, лице към +Z.
import * as THREE from 'three/webgpu';
import { lathe, merge, xf, mesh, flatten } from '../../boy/src/geo.js';
import type { BoyMaterials } from '../boy-materials';
import type { Rand } from '../rng';
import { brilliant, elongated } from './gems';

type Pieces = [THREE.BufferGeometry, THREE.Material][];
type GemMat = { gem: THREE.Material };

/** Деформира плат с гънки: радиални синуси по ъгъла + шум, пази силуета. */
function fold(g: THREE.BufferGeometry, amp: number, freq: number, seed: number): THREE.BufferGeometry {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
    const a = Math.atan2(x, z);
    const d = Math.sin(a * freq + seed) * amp * (0.4 + 0.6 * Math.abs(Math.sin(y * 18 + seed)));
    const r = Math.hypot(x, z) || 1;
    p.setXYZ(i, x + (x / r) * d, y, z + (z / r) * d);
  }
  g.computeVertexNormals();
  return g;
}

/** Точка по меридиан на сплеснатата сфера на качулката (три.js параметризация). */
function sph(r: number, sx: number, sy: number, sz: number, phi: number, theta: number, dy: number, dz: number): THREE.Vector3 {
  return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(theta) * sx, r * Math.cos(theta) * sy + dy, r * Math.sin(phi) * Math.sin(theta) * sz + dz);
}

/** Драпирана качулка/качулък: дебел навит ръб по отвора на лицето, почти черна вътрешност (лицето е
 *  в сянка), гънки отзад и по раменете, подгъв. Без манекен — само плат; roughness ~0.9, sheen. */
function drapedHood(M: BoyMaterials, g: THREE.Group, rand: Rand, cloth: THREE.Material, mailHood: boolean): void {
  const seed = rand() * 10;
  const R = 0.128; const sx = 0.92; const sy = 1.1; const sz = 1.12; const dy = -0.025; const dz = -0.02;
  const open = Math.PI * 0.2; // половин ъгъл на отвора около +Z (phi = π/2)
  const phi0 = Math.PI / 2 + open; const span = Math.PI * 2 - open * 2;
  const dome = new THREE.SphereGeometry(R, 64, 44, phi0, span, 0, Math.PI * 0.8);
  dome.scale(sx, sy, sz);
  dome.translate(0, dy, dz);
  g.add(mesh(mailHood ? dome : fold(dome, 0.0045, 9, seed), cloth));
  // тъмна вътрешност: пълна по-малка сфера (затваря отвора с „сянка", лицето не се вижда)
  const inner = new THREE.SphereGeometry(R * 0.93, 40, 28, 0, Math.PI * 2, 0, Math.PI * 0.82);
  inner.scale(sx, sy * 0.98, sz);
  inner.translate(0, dy, dz + 0.004);
  g.add(mesh(inner, M.slit));
  // навит ръб по двата меридиана на отвора + горна дъга
  const rim: THREE.Vector3[][] = [[], []];
  for (let i = 0; i <= 24; i++) {
    const th = (i / 24) * Math.PI * 0.8;
    rim[0].push(sph(R, sx, sy, sz, phi0, th, dy, dz));
    rim[1].push(sph(R, sx, sy, sz, phi0 + span, th, dy, dz));
  }
  for (const pts of rim) g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.0105, 10, false), cloth));
  // яка/качулък върху раменете с дълбоки гънки + навит подгъв
  const cowl = lathe([[0.075, -0.12], [0.135, -0.16], [0.205, -0.23], [0.285, -0.33], [0.305, -0.385]], 96, 0, Math.PI * 2);
  cowl.scale(1, 1, 0.8);
  g.add(mesh(fold(cowl, mailHood ? 0.002 : 0.016, 11, seed), cloth));
  const hem = new THREE.TorusGeometry(0.305, 0.0085, 8, 96);
  hem.rotateX(Math.PI / 2);
  hem.scale(1, 1, 0.8);
  hem.translate(0, -0.385, 0);
  g.add(mesh(fold(hem, 0.016, 11, seed), cloth));
}

function hood(M: BoyMaterials, g: THREE.Group, rand: Rand): void {
  g.rotation.y = 0.6; // отворът гледа към камерата
  drapedHood(M, g, rand, M.capeA, false);
}

function mask(M: BoyMaterials, g: THREE.Group, rand: Rand): void {
  g.rotation.y = 0.45;
  const face = new THREE.SphereGeometry(0.108, 48, 32, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.22, Math.PI * 0.6);
  face.scale(0.86, 1.12, 0.98);
  face.translate(0, -0.04, -0.005);
  g.add(mesh(face, M.steelA));
  for (const s of [-1, 1]) {
    g.add(mesh(xf(new THREE.SphereGeometry(0.017, 18, 12), [s * 0.034, -0.012, 0.094], [0, s * 0.3, 0], [1.5, 0.55, 0.4]), M.slit));
    g.add(mesh(xf(new THREE.TorusGeometry(0.0205, 0.003, 6, 20), [s * 0.034, -0.012, 0.0955], [0, s * 0.3, s * 0.35], [1.5, 0.6, 1]), M.goldB));
  }
  g.add(mesh(xf(new THREE.CylinderGeometry(0.004, 0.012, 0.06, 6), [0, -0.05, 0.1], [0.12, 0, 0]), M.steelB));
  for (const s of [-1, 1]) g.add(mesh(xf(new THREE.TorusGeometry(0.1, 0.006, 6, 24, Math.PI * 0.55), [0, -0.03, -0.01], [Math.PI / 2, 0, s > 0 ? -0.3 : Math.PI + 0.3 - Math.PI * 0.55]), M.leather));
  void rand;
}

/** Един връх на корона: плосък извит силует (вдлъбнати страни) с лек скос — Extrude. */
function tine(h: number, w: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w, 0);
  s.quadraticCurveTo(-w * 0.9, h * 0.45, -w * 0.12, h * 0.9);
  s.lineTo(0, h);
  s.lineTo(w * 0.12, h * 0.9);
  s.quadraticCurveTo(w * 0.9, h * 0.45, w, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.0025, bevelSize: 0.0022, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -0.003);
  return g;
}

function crown(M: BoyMaterials, g: THREE.Group, rand: Rand, big: boolean): void {
  const gem = (M as unknown as GemMat).gem;
  const R = 0.085;
  g.add(mesh(lathe([[R * 0.97, 0], [R, 0.004], [R * 1.03, 0.018], [R * 1.0, 0.034], [R * 0.97, 0.038], [R * 0.94, 0.034]], 64), M.goldB));
  g.add(mesh(merge([
    xf(new THREE.TorusGeometry(R * 1.01, 0.0032, 8, 64), [0, 0.0, 0], [Math.PI / 2, 0, 0]),
    xf(new THREE.TorusGeometry(R * 1.01, 0.0032, 8, 64), [0, 0.038, 0], [Math.PI / 2, 0, 0]),
  ]), M.brass));
  const n = big ? 9 : 7;
  const tines: THREE.BufferGeometry[] = [];
  const pearls: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const tall = (i % 2 ? 0.05 : 0.082) * (big ? 1.25 : 1) * (0.92 + rand() * 0.16);
    const t = tine(tall, 0.019);
    t.translate(0, 0.034, R * 0.995);
    t.rotateY(a);
    tines.push(t);
    pearls.push(xf(new THREE.SphereGeometry(0.0055, 12, 8), [Math.sin(a) * R * 0.995, 0.034 + tall + 0.003, Math.cos(a) * R * 0.995]));
  }
  g.add(mesh(merge(tines), M.goldB));
  g.add(mesh(merge(pearls), M.brass));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.add(mesh(xf(brilliant(i % 2 ? 0.0065 : 0.0095, i % 2 ? 0.012 : 0.017, 8), [Math.sin(a) * R * 1.035, 0.02, Math.cos(a) * R * 1.035], [Math.PI / 2, 0, -a + 0]), gem));
  }
  g.add(mesh(xf(elongated(0.016, 0.028, 1.0, 8), [0, 0.018, R * 1.06], [Math.PI / 2, 0, 0]), gem));
}

function circlet(M: BoyMaterials, g: THREE.Group, rand: Rand, thin: boolean): void {
  const gem = (M as unknown as GemMat).gem;
  const R = 0.082;
  g.add(mesh(lathe([[R, 0], [R * 1.02, 0.002], [R * 1.02, thin ? 0.008 : 0.014], [R, thin ? 0.01 : 0.016]], 64), M.goldB));
  // „лозов" орнамент отпред + висулка по челото
  const arcs: THREE.BufferGeometry[] = [];
  for (let k = -2; k <= 2; k++) {
    const a = k * 0.17;
    arcs.push(xf(new THREE.TorusGeometry(0.014, 0.0016, 6, 14, Math.PI * 1.5), [Math.sin(a) * R * 1.02, 0.02, Math.cos(a) * R * 1.02], [0, a, k * 0.4]));
  }
  g.add(mesh(merge(arcs), M.goldB));
  g.add(mesh(xf(new THREE.ConeGeometry(0.013, 0.05, 4), [0, 0.04 + rand() * 0.01, R * 1.02], [0, 0, 0]), M.goldB));
  g.add(mesh(xf(elongated(0.0105, 0.022, 1.0, 8), [0, -0.012, R * 1.07], [Math.PI / 2, 0, 0], [1, 1.3, 1]), gem));
}

function cap(M: BoyMaterials, g: THREE.Group, rand: Rand): void {
  const dome = new THREE.SphereGeometry(0.108, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.55);
  dome.scale(0.88, 1.0, 1.0);
  dome.translate(0, -0.03, -0.008);
  g.add(mesh(fold(dome, 0.003, 7, rand() * 6), M.leather));
  g.add(mesh(lathe([[0.092, -0.052], [0.099, -0.05], [0.097, -0.03], [0.09, -0.03]], 48), M.leather));
  g.add(mesh(xf(new THREE.ConeGeometry(0.012, 0.11, 8), [-0.05, 0.055, -0.04], [-0.9, 0, 0.7]), M.capeB));
}

function coif(M: BoyMaterials, g: THREE.Group, rand: Rand): void {
  g.rotation.y = 0.6;
  drapedHood(M, g, rand, M.mail, true);
}

export function buildHeadgear(M: BoyMaterials, name: string, rand: Rand): THREE.Object3D {
  const g = new THREE.Group();
  if (/hood|cowl|veil/i.test(name)) hood(M, g, rand);
  else if (/mask/i.test(name)) mask(M, g, rand);
  else if (/circlet|diadem/i.test(name)) circlet(M, g, rand, /diadem/i.test(name));
  else if (/coif/i.test(name)) coif(M, g, rand);
  else if (/\bcap\b/i.test(name)) cap(M, g, rand);
  else crown(M, g, rand, /hollow|primordial|veilforged|king|emperor/i.test(name));
  g.updateMatrixWorld(true);
  const out = new THREE.Group();
  for (const [geo, mat] of flatten(g) as Pieces) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; out.add(m); }
  return out;
}
