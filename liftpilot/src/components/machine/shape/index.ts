// A maker's machine in 3D (src/shaft/machine-shape.ts, the data in src/lib/catalog/shapes.ts): its body from the parts
// of the shape, finished by what each part is (parts.ts), the drum brake built whole round its drum, arms and magnet
// (brake.ts), the gearbox's oil sight glass, filler and drain plugs, the sheave at the calculation's diameter where the
// sheet puts it (sheave.ts), standing on what the room gives it — our bedframe (three irons round the sheave, under the
// rows of the feet's holes and past the sheave, as tall as the frame on anti-vibration mounts, never on posts; cross
// members at the ends), the maker's pedestal on the maker's bedplate, or the irons of our bedplate with the diverting
// pulley — with the feet's bolts, and the motor's supply conduit from the terminal box to the floor. The group's origin
// is where the machine stands under the sheave's axis, as the generic machine's (parts/index.ts), so the room places
// either the same way. Metres. Loaded only through boot.ts.
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { IRON, partBox, type MachineFrame, type MachineShape, type ShapePart } from '@/shaft/machine-shape';
import { brakeOf, ribsOf } from '@/shaft/machine-detail';
import type { MachineMaterials } from '../materials';
import { P3, bolts, cylY, cylZ, hexZ, mesh } from '../parts/common';
import type { Machine } from '../parts';
import { shapedBrake } from './brake';
import { buildPart } from './parts';
import { shapedSheave } from './sheave';

const m = (v: number): number => v / 1000;

/** What the feet stand on, its underside at y = 0 and its top at the feet's plane: our bedframe — a channel under each
 *  iron (src/shaft/machine-shape.ts machineFrame) as tall as the frame on its mounts, never on posts, the end ones
 *  across from the first to the last, past the rope falls —, the maker's pedestal on the maker's bedplate (a welded box
 *  under the feet between its plates), on our bedplate with the diverting pulley our riser like it when something hangs
 *  under the feet (machine-shape.ts padOf), or nothing (the feet on its irons). */
function bedframe(F: MachineFrame, M: MachineMaterials): THREE.Group {
  const g = new THREE.Group(), S = F.shape, bed = m(F.bed);
  if (F.on === 'bedplate' || !S) return g;
  if (F.on === 'pedestal' || F.on === 'pad') {
    // (our riser on the bedplate's irons is the same welded box)
    const [x0, z0, x1, z1] = S.feet.map(m), t = 0.012, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    g.add(mesh(new THREE.BoxGeometry(x1 - x0 + 0.03, t, z1 - z0 + 0.03), M.frame, cx, t / 2, cz), mesh(new THREE.BoxGeometry(x1 - x0, t, z1 - z0), M.frame, cx, bed - t / 2, cz));
    g.add(mesh(new RoundedBoxGeometry(x1 - x0 - 0.03, bed - 2 * t, z1 - z0 - 0.03, 2, 0.006), M.frame, cx, bed / 2, cz));
    return g;
  }
  const [x0, x1] = [m(F.run[0]), m(F.run[1])], zs = F.beams.map(m), mount = 0.022;
  const za = zs[0], zb = zs[zs.length - 1], bw = m(IRON), tf = 0.009, tw = 0.007, y1 = bed, y0 = mount, hb = y1 - y0;
  for (const [z, s] of zs.map((z, i) => [z, i === 0 ? -1 : 1] as const)) {
    // a channel's top and bottom flanges and its web, the back toward the machine's middle
    g.add(mesh(new THREE.BoxGeometry(x1 - x0, tf, bw), M.frame, (x0 + x1) / 2, y1 - tf / 2, z), mesh(new THREE.BoxGeometry(x1 - x0, tf, bw), M.frame, (x0 + x1) / 2, y0 + tf / 2, z));
    g.add(mesh(new THREE.BoxGeometry(x1 - x0, hb - 2 * tf, tw), M.frame, (x0 + x1) / 2, (y0 + y1) / 2, z - s * (bw / 2 - tw / 2)));
    // the mounts at its ends: plate, rubber, plate
    for (const xm of F.mounts.map(m)) {
      g.add(mesh(new THREE.BoxGeometry(0.12, 0.004, 0.1), M.frame, xm, 0.002, z), mesh(new RoundedBoxGeometry(0.1, 0.014, 0.085, 2, 0.004), M.rubber, xm, 0.011, z),
        mesh(new THREE.BoxGeometry(0.12, 0.004, 0.1), M.frame, xm, 0.02, z));
    }
  }
  for (const x of [x0 + 0.035, x1 - 0.035]) g.add(mesh(new THREE.BoxGeometry(0.07, hb - 2 * tf, zb - za - bw), M.frame, x, (y0 + y1) / 2, (za + zb) / 2));
  return g;
}

/** The supply conduit: from the terminal box's glands (its back, −Z) down to the floor behind the machine; its end. */
function conduit(S: MachineShape, F: MachineFrame, M: MachineMaterials): { mesh: THREE.Mesh; end: [number, number, number] } {
  const t = S.parts.find((p) => p.role === 'terminal'), b = t ? partBox(t) : partBox(S.parts[0]), bed = m(F.bed);
  const x = m((b[0] + b[3]) / 2), y = bed + m((b[1] + b[4]) / 2), z = m(b[2]) - 0.02, zf = Math.min(m(F.z[0]), m(F.beams[0]) - 0.06) - 0.12;
  const end: [number, number, number] = [x + 0.12, 0.012, zf];
  const path = new THREE.CatmullRomCurve3([P3(x, y, z), P3(x, y - 0.01, z - 0.1), P3(x + 0.04, Math.max(0.2, y * 0.45), zf + 0.06), P3(x + 0.08, 0.03, zf), P3(...end)]);
  return { mesh: mesh(new THREE.TubeGeometry(path, 60, 0.011, 10), M.rubber), end };
}

/** The gearbox's oil fittings on its largest casting: the sight glass on its back between the ribs, the drain plug
 *  low on the back, the filler with its breather on the highest casting's top. */
function oilFittings(S: MachineShape, M: MachineMaterials): THREE.Group {
  const g = new THREE.Group(), cast = S.parts.filter((p) => p.role === 'housing');
  if (!cast.length) return g;
  const vol = (p: ShapePart): number => { const b = partBox(p); return (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]); };
  const main = cast.reduce((a, b) => (vol(b) > vol(a) ? b : a)), [x0, y0, z0, x1, y1] = partBox(main).map(m);
  const xs = (ribsOf(S, main)?.ribs ?? []).map((r) => m((r[0] + r[2]) / 2)).sort((a, b) => a - b);
  const xg = xs.length > 1 ? (xs[0] + xs[1]) / 2 : x0 + 0.3 * (x1 - x0), yg = y0 + 0.38 * (Math.min(y1, m(S.yWheel)) - y0 || y1 - y0);
  g.add(mesh(cylZ(0.016, 0.006, 32), M.steel, xg, yg, z0 - 0.003), mesh(cylZ(0.011, 0.002, 32), M.glass, xg, yg, z0 - 0.0065));
  g.add(mesh(hexZ(0.011, 0.01), M.steel, x0 + 0.72 * (x1 - x0), y0 + 0.028, z0 - 0.005));
  const top = cast.reduce((a, b) => (partBox(b)[4] > partBox(a)[4] ? b : a)), t = partBox(top).map(m), xf = t[0] + 0.3 * (t[3] - t[0]);
  g.add(mesh(cylY(0.013, 0.012, 24), M.red, xf, t[4] + 0.006, (t[2] + t[5]) / 2), mesh(cylY(0.005, 0.014, 12), M.steel, xf, t[4] + 0.019, (t[2] + t[5]) / 2));
  return g;
}

export interface ShapedMachine extends Machine {
  /** where the conduit ends on the floor [m, the machine's frame]: the installation's trunking takes the cable on */
  conduitEnd: readonly [number, number, number];
}

/** A part of an inclined worm turned about Z round its pivot (machine-shape.ts); the others as they are. */
function onTilt(p: ShapePart, o: THREE.Object3D): THREE.Object3D {
  if (!p.tilt) return o;
  const g = new THREE.Group(), [px, py] = p.tilt.at;
  g.position.set(m(px), m(py), 0);
  g.rotation.z = p.tilt.a;
  o.position.x -= m(px);
  o.position.y -= m(py);
  g.add(o);
  return g;
}

/** The machine of `F.shape` with its sheave at D for n ropes of d. */
export function buildShaped(M: MachineMaterials, F: MachineFrame, D: number, n: number, d: number): ShapedMachine {
  const S = F.shape;
  if (!S) throw new Error('buildShaped: no shape');
  const group = new THREE.Group(), body = new THREE.Group(), worm: THREE.Object3D[] = [];
  body.position.y = m(F.bed);
  // the drum brake whole; its drum, levers and magnet are not built as parts then (an arm across both sides stays one)
  const brake = brakeOf(S), whole = (p: ShapePart): boolean => {
    if (!brake || !(p.role === 'brake' || p.role === 'magnet' || p.role === 'arm')) return false;
    const b = partBox(p);
    return p.role !== 'arm' || b[2] > 0 || b[5] < 0;
  };
  for (const p of S.parts) if (!whole(p)) body.add(onTilt(p, buildPart(S, p, M, worm)));
  if (brake) body.add(shapedBrake(brake, M, worm));
  body.add(oilFittings(S, M));
  // the feet's bolts on a cast base; a machine without one is bolted from under the frame's flange
  const base = S.parts.find((p) => p.role === 'base');
  if (base) body.add(bolts(M.steel, S.holes.map(([x, z]) => P3(m(x), m(partBox(base)[4]), m(z))), '+y', 0.012));
  const sheave = shapedSheave(M, D, F.width, n, d);
  sheave.position.set(0, m(F.axis), m(F.zSheave));
  const c = conduit(S, F, M);
  group.add(bedframe(F, M), body, sheave, c.mesh);
  return { group, sheave, worm, conduitEnd: c.end };
}
