// The parts of a maker's machine (src/shaft/machine-shape.ts) as the 3D finishes them by what they are: cast parts in
// black enamel with rounded edges, the motor's frame with its cooling fins, the terminal box with its lid and glands,
// turned covers with their bolt rings, shafts in bright steel, the brake drum and its magnet in aluminium, the yellow
// handwheel with the directions of travel, the lifting eyes. Metres, the machine's frame (y up from the feet's plane).
// Loaded only through boot.ts (lazy).
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { ShapePart } from '@/shaft/machine-shape';
import type { MachineMaterials } from '../materials';
import { V, P3, bolts, circle, cylZ, hexZ, latheX, latheZ, mesh, slab } from '../parts/common';

const m = (v: number): number => v / 1000;

/** A rounded box from its corners [m]. */
function rounded(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, edge = 0.012): THREE.Mesh {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0, r = Math.min(edge, 0.12 * Math.min(w, h, d));
  return mesh(new RoundedBoxGeometry(w, h, d, 2, r), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

/** A turned part along X or Z from s0 to s1, radius r, the edges chamfered: a cover, a drum, a boss. */
function turnedAlong(axis: 'x' | 'z', r: number, s0: number, s1: number): THREE.BufferGeometry {
  const c = Math.min(0.006, 0.15 * (s1 - s0), 0.1 * r), pts = [V(0.0001, s0), V(r - c, s0), V(r, s0 + c), V(r, s1 - c), V(r - c, s1), V(0.0001, s1)];
  return axis === 'x' ? latheX(pts, 72) : latheZ(pts, 72);
}

/** The motor's frame as a finned body: a core with fins along X round it, but not under it. */
function finned(p: ShapePart, M: MachineMaterials): THREE.Object3D {
  const g = new THREE.Group(), fin = 0.016;
  if ('cyl' in p && p.cyl === 'x') {
    const r = m(p.r), [x0, x1] = [m(p.span[0]), m(p.span[1])], y = m(p.at[0]), z = m(p.at[1]), core = r - fin;
    g.add(mesh(turnedAlong('x', core, x0, x1), M.black, 0, y, z));
    const n = Math.max(16, Math.round((2 * Math.PI * core) / 0.026)), geo = new RoundedBoxGeometry(x1 - x0 - 0.03, fin + 0.002, 0.005, 1, 0.0018);
    const keep: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI;
      if (Math.sin(a) > -0.75) keep.push(a); // none under the frame: its feet
    }
    const inst = new THREE.InstancedMesh(geo, M.black, keep.length), mat = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    keep.forEach((a, i) => {
      q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2 - a);
      inst.setMatrixAt(i, mat.compose(P3((x0 + x1) / 2, y + Math.sin(a) * (core + fin / 2), z + Math.cos(a) * (core + fin / 2)), q, one));
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    g.add(inst);
    return g;
  }
  if ('box' in p) {
    const [x0, y0, z0, x1, y1, z1] = p.box.map(m);
    g.add(rounded(x0, y0, z0 + fin, x1, y1 - fin, z1 - fin, M.black, 0.02));
    const geo = new RoundedBoxGeometry(x1 - x0 - 0.04, 0.005, fin, 1, 0.0018), spots: THREE.Vector3[] = [];
    for (let y = y0 + 0.03; y < y1 - fin - 0.02; y += 0.028) spots.push(P3((x0 + x1) / 2, y, z0 + fin / 2), P3((x0 + x1) / 2, y, z1 - fin / 2));
    const inst = new THREE.InstancedMesh(geo, M.black, spots.length), mat = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1), q = new THREE.Quaternion();
    spots.forEach((s, i) => inst.setMatrixAt(i, mat.compose(s, q, one)));
    inst.castShadow = true;
    g.add(inst);
    const top = new RoundedBoxGeometry(x1 - x0 - 0.04, fin, 0.005, 1, 0.0018), tops: THREE.Vector3[] = [];
    for (let z = z0 + fin + 0.02; z < z1 - fin - 0.01; z += 0.028) tops.push(P3((x0 + x1) / 2, y1 - fin / 2, z));
    const ti = new THREE.InstancedMesh(top, M.black, tops.length);
    tops.forEach((s, i) => ti.setMatrixAt(i, mat.compose(s, q, one)));
    ti.castShadow = true;
    g.add(ti);
  }
  return g;
}

/** The terminal box: its body, the lid, the cable glands toward the back (−Z). */
function terminal(b: readonly number[], M: MachineMaterials): THREE.Group {
  const [x0, y0, z0, x1, y1, z1] = b.map(m), g = new THREE.Group();
  g.add(rounded(x0, y0, z0, x1, y1 - 0.012, z1, M.black, 0.008), rounded(x0 - 0.004, y1 - 0.014, z0 - 0.004, x1 + 0.004, y1, z1 + 0.004, M.black, 0.004));
  const n = x1 - x0 > 0.15 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const x = x0 + ((i + 0.5) * (x1 - x0)) / n, y = (y0 + y1) / 2 - 0.006;
    g.add(mesh(cylZ(0.011, 0.02, 20), M.rubber, x, y, z0 - 0.01), mesh(hexZ(0.015, 0.008), M.rubber, x, y, z0 - 0.002));
  }
  return g;
}

/** The handwheel: a dished yellow disc with a rolled rim and a hub, the directions of travel on its face. */
function handwheel(r: number, s0: number, s1: number, M: MachineMaterials): THREE.Mesh {
  const t = s1 - s0, hub = Math.max(0.03, 0.18 * r), bead = Math.min(0.016, 0.3 * t), web = Math.min(0.006, 0.12 * t);
  const pts = [V(0.0001, s0), V(hub, s0), V(hub + 0.004, s0 + 0.004), V(hub + 0.004, s0 + 0.4 * t - web), V(r - 2 * bead, s0 + 0.55 * t - web)];
  for (let k = 0; k <= 12; k++) {
    const a = -Math.PI / 2 + (Math.PI * k) / 12;
    pts.push(V(r - bead + bead * Math.cos(a), s0 + 0.55 * t + bead * Math.sin(a)));
  }
  pts.push(V(r - 2 * bead, s0 + 0.55 * t + web), V(hub + 0.004, s0 + 0.4 * t + web), V(hub + 0.004, s1 - 0.004), V(hub, s1), V(0.0001, s1));
  return mesh(latheX(pts, 96), M.handwheel);
}

/** A lifting eye on its collar, the ring in the machine's XY plane. */
function eye(x: number, z: number, r: number, y0: number, y1: number, M: MachineMaterials): THREE.Group {
  const g = new THREE.Group(), tube = 0.28 * r, R = (y1 - y0 - tube) / 2;
  g.add(mesh(new THREE.CylinderGeometry(r * 0.9, r, 0.012, 24), M.steel, x, y0 + 0.006, z));
  g.add(mesh(new THREE.TorusGeometry(Math.max(R, r * 0.6), tube, 12, 32), M.steel, x, y1 - Math.max(R, r * 0.6) - tube, z));
  return g;
}

/** Six bolts round a turned cover's outer face. */
function coverBolts(axis: 'x' | 'z', c: THREE.Vector3, r: number, face: 1 | -1, M: MachineMaterials): THREE.InstancedMesh {
  const facing = axis === 'x' ? (face > 0 ? '+x' : '-x') : face > 0 ? '+z' : '-z';
  return bolts(M.steel, circle(c, r * 0.78, r > 0.08 ? 8 : 6, axis), facing, Math.min(0.009, 0.06 * r));
}

/** A part of the body as the 3D shows it; `worm` collects what turns with the worm (the brake drum, the handwheel). */
export function buildPart(p: ShapePart, M: MachineMaterials, worm: THREE.Object3D[]): THREE.Object3D {
  if (p.role === 'motor') return finned(p, M);
  if ('box' in p) {
    const b = p.box.map(m);
    if (p.role === 'terminal') return terminal(p.box, M);
    const mat = p.role === 'magnet' || p.role === 'brake' ? M.alu : p.role === 'shaft' ? M.machined : M.black;
    return rounded(b[0], b[1], b[2], b[3], b[4], b[5], mat, p.role === 'arm' ? 0.006 : 0.014);
  }
  if ('prism' in p) {
    const s = new THREE.Shape(p.prism.map(([x, y]) => new THREE.Vector2(m(x), m(y)))), depth = m(p.span[1] - p.span[0]);
    const geo = slab(s, depth, Math.min(0.012, depth / 6));
    geo.translate(0, 0, m(p.span[0] + p.span[1]) / 2);
    return mesh(geo, M.black);
  }
  const r = m(p.r), [s0, s1] = [m(p.span[0]), m(p.span[1])], [a, b] = [m(p.at[0]), m(p.at[1])];
  if (p.role === 'eye') return eye(a, b, r, s0, s1, M);
  if (p.cyl === 'y') return mesh(new THREE.CylinderGeometry(r, r, s1 - s0, 40), M.black, a, (s0 + s1) / 2, b);
  if (p.role === 'handwheel' && p.cyl === 'x') {
    const g = new THREE.Group(), w = handwheel(r, s0 - (s0 + s1) / 2, s1 - (s0 + s1) / 2, M);
    g.position.set((s0 + s1) / 2, a, b);
    g.add(w);
    worm.push(g);
    return g;
  }
  const mat = p.role === 'shaft' ? M.machined : p.role === 'brake' || p.role === 'magnet' ? M.alu : M.black;
  if (p.cyl === 'x') {
    const g = new THREE.Group(), geo = turnedAlong('x', r, s0 - (s0 + s1) / 2, s1 - (s0 + s1) / 2);
    if (mat === M.machined) geo.computeTangents();
    g.position.set((s0 + s1) / 2, a, b);
    g.add(mesh(geo, mat));
    if (p.role === 'cover' && r > 0.05) g.add(coverBolts('x', P3(s1 - (s0 + s1) / 2, 0, 0), r, 1, M));
    if (p.role === 'brake' || p.role === 'shaft') worm.push(g);
    return g;
  }
  const g = new THREE.Group(), geo = turnedAlong('z', r, s0, s1);
  if (mat === M.machined) geo.computeTangents();
  g.position.set(a, b, 0);
  g.add(mesh(geo, mat));
  if (p.role === 'cover' && r > 0.05) g.add(coverBolts('z', P3(0, 0, Math.abs(s1) > Math.abs(s0) ? s1 : s0), r, Math.abs(s1) > Math.abs(s0) ? (s1 > 0 ? 1 : -1) : s0 > 0 ? 1 : -1, M));
  return g;
}
