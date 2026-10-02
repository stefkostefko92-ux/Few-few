// A maker's machine in 3D (src/shaft/machine-shape.ts, the data in src/lib/catalog/shapes.ts): its body from the parts
// of the shape, finished by what each part is (parts.ts), the sheave at the calculation's diameter where the sheet puts
// it (sheave.ts), standing on our bedframe — two beams under the rows of the feet's holes, cross members at the ends,
// posts down to anti-vibration mounts when the frame is tall, the feet's bolts — and the motor's supply conduit from
// the terminal box to the floor. The group's origin is the bedframe's underside under the sheave's axis, as the
// generic machine's (parts/index.ts), so the room places either the same way. Metres. Loaded only through boot.ts.
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { partBox, type MachineFrame, type MachineShape } from '@/shaft/machine-shape';
import type { MachineMaterials } from '../materials';
import { P3, bolts, mesh } from '../parts/common';
import type { Machine } from '../parts';
import { buildPart } from './parts';
import { shapedSheave } from './sheave';

const m = (v: number): number => v / 1000;

/** The bedframe under the feet, its underside at y = 0 and its top at the feet's plane. */
function bedframe(F: MachineFrame, M: MachineMaterials): THREE.Group {
  const g = new THREE.Group(), bed = m(F.bed), [x0, x1] = [m(F.x[0]), m(F.x[1])], [za, zb] = F.beams.map(m), mount = 0.022;
  const hb = Math.min(0.12, bed - mount), bw = 0.07, tf = 0.009, tw = 0.007, y1 = bed, y0 = bed - hb;
  for (const [z, s] of [[za, -1], [zb, 1]]) {
    // a channel's top and bottom flanges and its web, the back toward the machine's middle
    g.add(mesh(new THREE.BoxGeometry(x1 - x0, tf, bw), M.frame, (x0 + x1) / 2, y1 - tf / 2, z), mesh(new THREE.BoxGeometry(x1 - x0, tf, bw), M.frame, (x0 + x1) / 2, y0 + tf / 2, z));
    g.add(mesh(new THREE.BoxGeometry(x1 - x0, hb - 2 * tf, tw), M.frame, (x0 + x1) / 2, (y0 + y1) / 2, z - s * (bw / 2 - tw / 2)));
    for (const xm of F.mounts.map(m)) {
      // posts down to the mounts when the frame stands taller than its beams; the mounts: plate, rubber, plate
      if (y0 - mount > 0.004) g.add(mesh(new RoundedBoxGeometry(0.08, y0 - mount, 0.08, 1, 0.004), M.frame, xm, mount + (y0 - mount) / 2, z));
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

export interface ShapedMachine extends Machine {
  /** where the conduit ends on the floor [m, the machine's frame]: the installation's trunking takes the cable on */
  conduitEnd: readonly [number, number, number];
}

/** The machine of `F.shape` with its sheave at D for n ropes of d. */
export function buildShaped(M: MachineMaterials, F: MachineFrame, D: number, n: number, d: number): ShapedMachine {
  const S = F.shape;
  if (!S) throw new Error('buildShaped: no shape');
  const group = new THREE.Group(), body = new THREE.Group(), worm: THREE.Object3D[] = [];
  body.position.y = m(F.bed);
  for (const p of S.parts) body.add(buildPart(p, M, worm));
  // the feet's bolts on a cast base; a machine without one is bolted from under the frame's flange
  const base = S.parts.find((p) => p.role === 'base');
  if (base) body.add(bolts(M.steel, S.holes.map(([x, z]) => P3(m(x), m(partBox(base)[4]), m(z))), '+y', 0.012));
  const sheave = shapedSheave(M, D, F.width, n, d);
  sheave.position.set(0, m(F.axis), m(F.zSheave));
  const c = conduit(S, F, M);
  group.add(bedframe(F, M), body, sheave, c.mesh);
  return { group, sheave, worm, conduitEnd: c.end };
}
