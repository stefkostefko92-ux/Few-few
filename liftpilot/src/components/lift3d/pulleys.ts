// The pulleys of the rope rig other than the sheave and what holds them. A diverting or top pulley turns on an axle
// with a nut at each end, between two cheeks: in the machine's bedplate (its plates: support.ts), standing on the
// room's floor across the slab's opening (side members with their feet bolted down beyond its ends) when its axle is
// over the slab's underside, otherwise hung under the slab from a top plate anchored to it (a machine below's head
// pulleys; never a diverting pulley of a machine above, registry locale.rinvio, unless an h entered by hand puts it
// there). The car and counterweight pulleys of a 2:1 roping ride with the car and the
// counterweight; its dead ends hang from a plate under the slab, each rope in its socket. Plan and heights in
// millimetres. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import type { BeltEl, RopePlane, RopeRig } from '@/lib/lift';
import type { Batch, Point } from './geom';
import type { LiftMaterials } from './materials';
import { ropeWidths } from './slab';

/** A pulley with its axis across the rope plane (plan direction perpendicular to dir); r and width in metres. */
export function pulley(r: number, width: number, dir: readonly [number, number], mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.97, r * 0.97, width, 40), mat);
  const lip = new THREE.CylinderGeometry(r * 1.08, r * 1.08, 0.008, 40);
  const a = new THREE.Mesh(lip, mat), b = new THREE.Mesh(lip, mat);
  a.position.y = width / 2;
  b.position.y = -width / 2;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.28, r * 0.28, width + 0.06, 20), mat);
  g.add(body, a, b, hub);
  for (const m of [body, a, b, hub]) m.castShadow = true;
  // cylinder axis (local Y) → across the rope plane: world (−dy, 0, −dx)
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-dir[1], 0, -dir[0]).normalize());
  return g;
}

/** The frames of the fixed pulleys and the dead ends of a 2:1 roping, each in the plane of its wheel or rope.
 *  floor: the floor of the room over the slab [mm], null without one; ceiling: the slab's underside [mm]; `framed`:
 *  the diverting pulley turns in the machine's bedplate, which holds it. */
export function pulleyFrames(B: Batch, M: LiftMaterials, rig: RopeRig, n: number, d: number, floor: number | null, ceiling: number, framed = false): void {
  const wd = ropeWidths(n, d), half = wd.pulley;
  const frame = (p: RopePlane) => {
    const [ox, oy] = p.origin, [dx, dy] = p.dir, turn = Math.atan2(dy, dx);
    const at = (u: number, a: number, z: number): Point => [ox + u * dx - a * dy, oy + u * dy + a * dx, z];
    // a box in the rope plane's axes: u along it, a across it, z up
    const ob = (u0: number, u1: number, a0: number, a1: number, z0: number, z1: number, m: THREE.Material): void => {
      const g = new THREE.BoxGeometry(Math.abs(u1 - u0) / 1000, Math.abs(z1 - z0) / 1000, Math.abs(a1 - a0) / 1000).rotateY(turn);
      const [x, y] = at((u0 + u1) / 2, (a0 + a1) / 2, 0);
      B.add(g.translate(x / 1000, (z0 + z1) / 2000, -y / 1000), m);
    };
    // a hexagon bolt head with its washer on a face at z, pointing up (s = 1) or down (s = −1)
    const bolt = (u: number, a: number, z: number, s: 1 | -1): void => {
      B.rod(at(u, a, z), at(u, a, z + s * 2), 13, M.galv, 16);
      B.rod(at(u, a, z + s * 2), at(u, a, z + s * 9), 9.5, M.galv, 6);
    };
    return { at, ob, bolt };
  };
  for (const w of rig.wheels) {
    if (w.role === 'sheave') continue;
    const { at, ob, bolt } = frame(w.plane), uc = w.u * 1000, yc = w.y * 1000, R = w.r * 1000;
    B.rod(at(uc, -half - 22, yc), at(uc, half + 22, yc), 20, M.rail, 16);
    for (const s of [-1, 1]) B.rod(at(uc, s * (half + 4), yc), at(uc, s * (half + 22), yc), 26, M.galv, 6);
    if (framed && w.role === 'deflector') continue;
    if (floor !== null && yc > ceiling) {
      const u0 = uc - R - 110, u1 = uc + R + 110, zb = Math.min(floor, yc - 70), zt = Math.max(floor + 140, yc + 70);
      for (const s of [-1, 1]) {
        ob(u0, u1, s * (half - 10), s * half, floor, floor + 140, M.galv);
        ob(uc - 80, uc + 80, s * (half - 10), s * half, zb, zt, M.galv);
      }
      for (const [ua, ub] of [[u0, u0 + 70], [u1 - 70, u1]] as const) {
        ob(ua, ub, -half - 40, half + 40, floor, floor + 12, M.galv);
        for (const s of [-1, 1]) bolt((ua + ub) / 2, s * (half + 22), floor + 12, 1);
      }
    } else {
      ob(uc - 140, uc + 140, -half - 40, half + 40, ceiling - 14, ceiling, M.galv);
      for (const s of [-1, 1]) {
        ob(uc - 80, uc + 80, s * (half - 10), s * half, yc - 70, ceiling - 14, M.galv);
        for (const k of [-1, 1]) bolt(uc + k * 110, s * (half + 22), ceiling - 14, -1);
      }
    }
  }
  // the dead ends of a 2:1 roping: a plate anchored under the slab, a socket on each rope's end, its nut on the plate.
  // A rope's end is a dead end only before the car's or the counterweight's pulley: a 1:1 rope ends on the car's
  // crosshead or on the counterweight, before a wheel at rest
  const pcs = rig.pieces(0, 0), pitch = Math.max(d + 6, 1.7 * d);
  const atRest = (e: BeltEl, p: RopePlane): boolean => e.kind === 'wheel' && rig.wheels.some((w) => w.plane === p && Math.abs(w.u - e.u) < 1e-9 && Math.abs(w.y - e.y) < 1e-9);
  const first = pcs[0], last = pcs[pcs.length - 1];
  const ends = [[first, first.els[0], first.els[1]], [last, last.els.at(-1), last.els.at(-2)]] as const;
  for (const [pc, e, next] of ends) {
    if (e?.kind !== 'pt' || next?.kind !== 'wheel' || atRest(next, pc.plane)) continue;
    const { at, ob, bolt } = frame(pc.plane), u = e.u * 1000, y = e.y * 1000, a = wd.ropes + 50;
    ob(u - 90, u + 90, -a, a, ceiling - 16, ceiling, M.galv);
    for (const s of [-1, 1]) for (const k of [-1, 1]) bolt(u + k * 65, s * (a - 22), ceiling - 16, -1);
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * pitch;
      B.rod(at(u, off, ceiling - 16), at(u, off, ceiling - 26), pitch / 2 - 0.5, M.galv, 6);
      B.rod(at(u, off, ceiling - 26), at(u, off, y - 140), pitch / 2 - 1.5, M.steel, 12);
    }
  }
}
