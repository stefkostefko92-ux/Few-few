// The parts of a maker's machine (src/shaft/machine-shape.ts) as the 3D finishes them by what they are: cast parts in
// black enamel (or the maker's colour) with rounded edges and the ribs on their backs (src/shaft/machine-detail.ts), a
// turned motor frame finned between its end shields with the fan's cowl and grille, or a box one with its cooling fins,
// the motor's rating plate, the terminal box with its lid and
// glands, turned covers with their bolt rings, shafts in bright steel, the yellow handwheel with the directions of
// travel, the lifting eyes. The drum brake is built whole (brake.ts). Metres, the machine's frame (y up from the feet's
// plane). Loaded only through boot.ts (lazy).
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { partBox, type MachineShape, type ShapePart } from '@/shaft/machine-shape';
import { coverBolts as boltCircle, endShields, ribsOf } from '@/shaft/machine-detail';
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

/** The motor's rating plate on its side toward the sheave (+Z), riveted, at the middle of the frame. */
function ratingPlate(x: number, y: number, z: number, M: MachineMaterials): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new RoundedBoxGeometry(0.09, 0.045, 0.0016, 1, 0.0006), M.plate, x, y, z + 0.0008));
  for (const [dx, dy] of [[-0.04, -0.017], [0.04, -0.017], [-0.04, 0.017], [0.04, 0.017]]) g.add(mesh(cylZ(0.0018, 0.0014, 8), M.steel, x + dx, y + dy, z + 0.0018));
  return g;
}

/** The castings' enamel: black, or the maker's colour. */
const castOf = (S: MachineShape, M: MachineMaterials): THREE.Material =>
  S.paint === 'blue' ? M.blue : S.paint === 'grey-blue' ? M.greyBlue : S.paint === 'navy' ? M.navy : M.black;

/** Cooling fins round a turned frame of core radius r from x0 to x1 (its axis at y, z), `h` tall: plates standing out
 *  radially all round but on top (the terminal box), toward the sheave (the rating plate's pad) and underneath. */
function fins(r: number, h: number, x0: number, x1: number, y: number, z: number, mat: THREE.Material): THREE.InstancedMesh {
  const n = Math.max(24, Math.round((2 * Math.PI * r) / 0.026)), angles: number[] = [];
  for (let i = 0; i < n; i++) {
    // from +Z toward +Y: 90° on top, 0° toward the sheave, 270° underneath
    const a = (i / n) * Math.PI * 2 + Math.PI / n, deg = ((a * 180) / Math.PI) % 360;
    const near = (c: number, span: number): boolean => Math.abs(((deg - c + 540) % 360) - 180) < span;
    if (!(near(90, 28) || near(0, 17) || near(270, 30))) angles.push(a);
  }
  const inst = new THREE.InstancedMesh(new RoundedBoxGeometry(x1 - x0, h, 0.006, 2, 0.0022), mat, angles.length);
  const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), axis = new THREE.Vector3(1, 0, 0), rc = r + h / 2 - 0.002;
  angles.forEach((a, i) => {
    // the plate's Y turned onto the radius (0, sin a, cos a)
    q.setFromAxisAngle(axis, Math.PI / 2 - a);
    inst.setMatrixAt(i, mm.compose(P3((x0 + x1) / 2, y + Math.sin(a) * rc, z + Math.cos(a) * rc), q, one));
  });
  inst.castShadow = true;
  inst.receiveShadow = true;
  return inst;
}

/** The motor's frame: a turned one finned between its end shields, the fan's cowl with its grille at the outer end
 *  (`cowl`: nothing of the brake beyond it); a box one finned. The rating plate on its side. */
function motor(p: ShapePart, M: MachineMaterials, body: THREE.Material, cowl: boolean): THREE.Object3D {
  const g = new THREE.Group(), fin = 0.016;
  if ('cyl' in p && p.cyl === 'x') {
    const r = m(p.r), [x0, x1] = [m(p.span[0]), m(p.span[1])], y = m(p.at[0]), z = m(p.at[1]), h = Math.min(0.022, 0.16 * r), core = r - h;
    const out = Math.abs(x1) >= Math.abs(x0) ? 1 : -1, c = cowl ? Math.max(0.04, 0.18 * (x1 - x0)) : 0, [f0, f1] = out > 0 ? [x0, x1 - c] : [x0 + c, x1];
    const shields = endShields(p).map(([a, b, rr]) => [m(a), m(b), m(rr)] as const), w = shields.length ? shields[0][1] - shields[0][0] : 0;
    g.add(mesh(turnedAlong('x', core, x0, x1), body, 0, y, z));
    for (const [a, b, rr] of shields) if (!c || (out > 0 ? b <= f1 + 1e-6 : a >= f0 - 1e-6)) g.add(mesh(turnedAlong('x', rr, a, b), body, 0, y, z));
    if (f1 - f0 > 2 * w + 0.04) g.add(fins(core, h, f0 + w + 0.004, f1 - w - 0.004, y, z, body));
    if (c) {
      // the fan's cowl past the frame, the grille on its end; the shaft runs on through it to what is beyond
      const [c0, c1] = out > 0 ? [f1, x1] : [x0, f0], rc = r - 0.3 * h;
      g.add(mesh(turnedAlong('x', rc, c0, c1), body, 0, y, z));
      g.add(mesh(new THREE.CircleGeometry(0.82 * rc, 64).rotateY((out * Math.PI) / 2), M.grille, out > 0 ? c1 + 0.0008 : c0 - 0.0008, y, z));
    }
    // the plate flat on its pad between the fins, on the frame's side toward the sheave
    g.add(ratingPlate((f0 + f1) / 2, y, z + core + 0.0015, M));
    return g;
  }
  if ('box' in p) {
    const [x0, y0, z0, x1, y1, z1] = p.box.map(m);
    g.add(rounded(x0, y0, z0 + fin, x1, y1 - fin, z1 - fin, body, 0.02));
    const geo = new RoundedBoxGeometry(x1 - x0 - 0.04, 0.005, fin, 1, 0.0018), spots: THREE.Vector3[] = [];
    for (let y = y0 + 0.03; y < y1 - fin - 0.02; y += 0.028) spots.push(P3((x0 + x1) / 2, y, z0 + fin / 2), P3((x0 + x1) / 2, y, z1 - fin / 2));
    const inst = new THREE.InstancedMesh(geo, body, spots.length), mat = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1), q = new THREE.Quaternion();
    spots.forEach((s, i) => inst.setMatrixAt(i, mat.compose(s, q, one)));
    inst.castShadow = true;
    g.add(inst);
    const top = new RoundedBoxGeometry(x1 - x0 - 0.04, fin, 0.005, 1, 0.0018), tops: THREE.Vector3[] = [];
    for (let z = z0 + fin + 0.02; z < z1 - fin - 0.01; z += 0.028) tops.push(P3((x0 + x1) / 2, y1 - fin / 2, z));
    const ti = new THREE.InstancedMesh(top, body, tops.length);
    tops.forEach((s, i) => ti.setMatrixAt(i, mat.compose(s, q, one)));
    ti.castShadow = true;
    g.add(ti, ratingPlate((x0 + x1) / 2, (y0 + y1) / 2, z1, M));
  }
  return g;
}

/** The ribs on the back of a casting (machine-detail.ts): plates standing proud of its face. */
function ribs(S: MachineShape, p: ShapePart, M: MachineMaterials): THREE.Object3D[] {
  const R = ribsOf(S, p), body = castOf(S, M);
  if (!R) return [];
  const t = 0.012, d = m(R.depth), z = m(R.z) - d / 2;
  return R.ribs.map(([a, b, c, e]) => {
    const [x0, y0, x1, y1] = [m(a), m(b), m(c), m(e)], len = Math.hypot(x1 - x0, y1 - y0), rib = mesh(new RoundedBoxGeometry(len, t, d, 1, 0.003), body, (x0 + x1) / 2, (y0 + y1) / 2, z);
    rib.rotation.z = Math.atan2(y1 - y0, x1 - x0);
    rib.castShadow = true;
    return rib;
  });
}

/** The terminal box: its body, the lid, the cable glands toward the back (−Z). */
function terminal(b: readonly number[], M: MachineMaterials, body: THREE.Material): THREE.Group {
  const [x0, y0, z0, x1, y1, z1] = b.map(m), g = new THREE.Group();
  g.add(rounded(x0, y0, z0, x1, y1 - 0.012, z1, body, 0.008), rounded(x0 - 0.004, y1 - 0.014, z0 - 0.004, x1 + 0.004, y1, z1 + 0.004, body, 0.004));
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

/** The bolts round a turned cover's outer face (machine-detail.ts: how many, where, how big). */
function coverBolts(axis: 'x' | 'z', c: THREE.Vector3, r: number, face: 1 | -1, M: MachineMaterials): THREE.Object3D {
  const b = boltCircle(r * 1000), facing = axis === 'x' ? (face > 0 ? '+x' : '-x') : face > 0 ? '+z' : '-z';
  return b ? bolts(M.steel, circle(c, m(b.at), b.n, axis), facing, m(b.head)) : new THREE.Group();
}

/** A part of the body as the 3D shows it; `worm` collects what turns with the worm (the brake drum, the handwheel). */
export function buildPart(S: MachineShape, p: ShapePart, M: MachineMaterials, worm: THREE.Object3D[]): THREE.Object3D {
  const body = castOf(S, M);
  if (p.role === 'motor') {
    // the fan's cowl at the motor's outer end unless the brake sits there (on the motor's shaft past it)
    const b = partBox(p), out = Math.abs(b[3]) >= Math.abs(b[0]) ? 1 : -1;
    const beyond = S.parts.some((q) => q.role === 'brake' && (out > 0 ? partBox(q)[0] >= b[3] - 1 : partBox(q)[3] <= b[0] + 1));
    return motor(p, M, body, !beyond);
  }
  if ('box' in p) {
    const b = p.box.map(m);
    if (p.role === 'terminal') return terminal(p.box, M, body);
    const mat = p.role === 'magnet' || p.role === 'brake' ? M.alu : p.role === 'shaft' ? M.machined : body;
    const g = new THREE.Group();
    g.add(rounded(b[0], b[1], b[2], b[3], b[4], b[5], mat, p.role === 'arm' ? 0.006 : 0.014), ...ribs(S, p, M));
    return g;
  }
  if ('prism' in p) {
    const s = new THREE.Shape(p.prism.map(([x, y]) => new THREE.Vector2(m(x), m(y)))), depth = m(p.span[1] - p.span[0]);
    const geo = slab(s, depth, Math.min(0.012, depth / 6)), g = new THREE.Group();
    geo.translate(0, 0, m(p.span[0] + p.span[1]) / 2);
    g.add(mesh(geo, body), ...ribs(S, p, M));
    return g;
  }
  const r = m(p.r), [s0, s1] = [m(p.span[0]), m(p.span[1])], [a, b] = [m(p.at[0]), m(p.at[1])];
  if (p.role === 'eye') return eye(a, b, r, s0, s1, M);
  if (p.cyl === 'y') {
    // upright parts (a vertical worm's: SICOR SV110), built along X and stood up: the frame's X is the world's Y, so
    // what turns with the worm spins about it as on the others
    const outer = new THREE.Group(), spin = new THREE.Group(), len = s1 - s0;
    outer.position.set(a, (s0 + s1) / 2, b);
    outer.rotation.z = Math.PI / 2;
    outer.add(spin);
    if (p.role === 'handwheel') spin.add(handwheel(r, -len / 2, len / 2, M));
    else spin.add(mesh(turnedAlong('x', r, -len / 2, len / 2), p.role === 'shaft' ? M.machined : p.role === 'brake' || p.role === 'magnet' ? M.alu : body));
    if (p.role === 'handwheel' || p.role === 'brake' || p.role === 'shaft') worm.push(spin);
    return outer;
  }
  if (p.role === 'handwheel' && p.cyl === 'x') {
    const g = new THREE.Group(), w = handwheel(r, s0 - (s0 + s1) / 2, s1 - (s0 + s1) / 2, M);
    g.position.set((s0 + s1) / 2, a, b);
    g.add(w);
    worm.push(g);
    return g;
  }
  const mat = p.role === 'shaft' ? M.machined : p.role === 'brake' || p.role === 'magnet' ? M.alu : body;
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
