// The machine and its room: the room's shell (roomshell.ts) — above the shaft, or with the machine below a room past
// the wall behind the counterweight, the ropes through that wall in their sleeves; the geared machine of the landing
// page scaled to the sheave of the calculation and turned onto the rope plane, its anti-vibration mounts on levelling
// shims on the floor beside the rope openings (slab.ts); its cable in a floor trunking to the controller and the main
// switch's feed (wiring.ts); the lifting hook over it; the diverting and top pulleys on their frames, the car and
// counterweight pulleys of a 2:1 roping and its dead ends (pulleys.ts). Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import type { Layout } from '@/shaft';
import { belt, type RopeRig } from '@/lib/lift';
import { buildMachine, CONDUIT_END, DIM, ROPE_LENGTH } from '../machine/parts';
import { createMaterials, type MachineMaterials } from '../machine/materials';
import { Batch } from './geom';
import { pulley, pulleyFrames } from './pulleys';
import { ropeWidths, type Opening } from './slab';
import type { GovernorSpot } from './governor';
import { buildShell, shellOf, switchAt } from './roomshell';
import { mainFeed, rectOf, roomPoint, trunking, trunkingRoute, type Rect } from './wiring';
import type { LiftMaterials, Side } from './materials';

export interface RoomModel {
  /** walls of the machine's room, by side (x-ray); the rest */
  sides: Record<Side, THREE.Group>;
  roof: THREE.Group;
  common: THREE.Group;
  /** sheave rotation [rad] (positive: car going up), car floor and counterweight plate for the moving pulleys */
  set(theta: number, i: number, carPulley: THREE.Vector3 | null, cwPulley: THREE.Vector3 | null): void;
  /** where the machine is, for the camera */
  focus: THREE.Vector3;
  /** the room's inside in plan and the top of its roof [mm], for the x-ray; null without a room */
  bounds: { x0: number; y0: number; x1: number; y1: number; top: number } | null;
  dispose(): void;
}

/** `ceiling`: the slab's underside over the shaft [mm]; `openings`: the slab's (slab.ts); `gov`: the governor's spot. */
export function buildRoom(L: Layout, rig: RopeRig, n: number, d: number, D: number, ceiling: number, M: LiftMaterials, openings: readonly Opening[], gov: GovernorSpot | null): RoomModel {
  const I = L.inputs, sides = { front: new THREE.Group(), rear: new THREE.Group(), left: new THREE.Group(), right: new THREE.Group() } as Record<Side, THREE.Group>;
  const roof = new THREE.Group(), common = new THREE.Group();
  const [dx, dy] = rig.dir, [ox, oy] = rig.origin, turn = Math.atan2(dy, dx);
  const at = (u: number, y: number): THREE.Vector3 => new THREE.Vector3(ox / 1000 + u * dx, y, -(oy / 1000 + u * dy));
  const z0 = rig.roomFloor * 1000, shell = shellOf(L, rig), R = shell?.room ?? null;
  if (shell) buildShell(shell, M, sides, roof, common);
  if (rig.bottom) {
    // the ropes through the shaft's wall into the room below: a steel sleeve round each run where it crosses the wall
    const sleeves = new Batch(), wd = ropeWidths(n, d), w0 = rig.wallAt, w1 = rig.wallAt + I.wall / 1000, mid = (w0 + w1) / 2;
    for (const [[ua, ya], [ub, yb]] of belt(rig.elements(0, 0)).runs) {
      if ((ua - mid) * (ub - mid) >= 0) continue;
      const y = ya + ((yb - ya) * (mid - ua)) / (ub - ua), len = (w1 - w0) * 1000 + 30, c = at(mid, y);
      const g = new THREE.BoxGeometry(len / 1000, (d + 50) / 1000, (2 * wd.ropes + 50) / 1000).rotateY(turn);
      sleeves.add(g.translate(c.x, c.y, c.z), M.galv);
    }
    sleeves.into(common);
  }

  // the machine: scaled to the sheave, its rope plane on the drops' plane, the car side of the sheave toward the car
  const MM: MachineMaterials = createMaterials(ROPE_LENGTH);
  const machine = buildMachine(MM, false), s = D / 560;
  machine.group.scale.setScalar(s);
  machine.group.rotation.y = Math.atan2(dy, dx);
  const centre = at(rig.sheave.u, rig.sheave.y);
  const local = new THREE.Vector3(0, DIM.yWheel * s, DIM.zSheave * s).applyEuler(machine.group.rotation);
  machine.group.position.copy(centre).sub(local);
  common.add(machine.group);
  // levelling shims under the four mounts, down to the floor (the sheave's axis sits at its height over the floor)
  const gap = (rig.sheave.y - rig.roomFloor) / s - DIM.yWheel;
  if (gap > 0.0002) {
    const shim = new THREE.BoxGeometry(0.12, gap, 0.1);
    for (const x of [-0.36, 0.95]) for (const z of [-DIM.zBeam, DIM.zBeam]) {
      const m = new THREE.Mesh(shim, M.galv);
      m.position.set(x, -gap / 2, z);
      m.receiveShadow = true;
      machine.group.add(m);
    }
  }
  // the motor's cable: in a floor trunking to the controller's cabinet, or into the floor; the main switch's feed
  machine.group.updateMatrixWorld(true);
  const end = new THREE.Vector3(...CONDUIT_END).applyMatrix4(machine.group.matrixWorld), wires = new Batch();
  const tip = [end.x * 1000, -end.z * 1000] as const, tipH = end.y * 1000 - z0;
  if (R) {
    const x0 = -R.shaftX, y0 = -R.shaftY, pw = R.panelWall, across = pw === 'front' || pw === 'rear' ? 0 : 1;
    const uc = Math.min(R.panelAt + R.panelW - 120, Math.max(R.panelAt + 120, tip[across] - (across ? y0 : x0)));
    const from = roomPoint(R, x0, y0, pw, uc, R.panelD - 60), o = roomPoint(R, x0, y0, pw, uc, R.panelD - 59);
    const blocked: Rect[] = rig.bottom ? [] : openings.map((op) => rectOf(op.pts, op.curb ? 25 : 0));
    // the bedframe, the pulleys' stands on the floor, the governor, the way through the door (it opens outward)
    blocked.push(rectOf([[-0.52, -0.2], [1.12, -0.2], [1.12, 0.2], [-0.52, 0.2]].map(([x, zz]) => {
      const p = new THREE.Vector3(x, 0, zz).applyMatrix4(machine.group.matrixWorld);
      return [p.x * 1000, -p.z * 1000] as const;
    })));
    const half = ropeWidths(n, d).pulley;
    for (const w of rig.wheels) {
      if (rig.bottom || w.role === 'sheave' || w.y * 1000 <= ceiling) continue;
      const u0 = (w.u - w.r) * 1000 - 110, u1 = (w.u + w.r) * 1000 + 110, a = half + 40;
      blocked.push(rectOf([[u0, -a], [u1, -a], [u1, a], [u0, a]].map(([u, v]) => [ox + u * dx - v * dy, oy + u * dy + v * dx] as const)));
    }
    if (gov && !rig.bottom) blocked.push(rectOf([[gov.x - 175, gov.y1 - 30], [gov.x + 175, gov.y2 + 30]]));
    blocked.push(rectOf([roomPoint(R, x0, y0, R.doorWall, R.doorAt, 0), roomPoint(R, x0, y0, R.doorWall, R.doorAt + R.doorW, 600)]));
    const way = trunkingRoute(from, [o[0] - from[0], o[1] - from[1]], tip, blocked, { x0, y0, x1: x0 + R.W, y1: y0 + R.D });
    trunking(wires, M, way, tip, tipH, z0);
    mainFeed(wires, M, R, x0, y0, z0, switchAt(R), z0 + 1750);
  } else trunking(wires, M, null, tip, tipH, z0);
  wires.into(common);

  // the lifting hook over the machine, on its plate under the roof
  if (R) {
    const top = (z0 + R.H) / 1000, hook = new Batch(), hx = centre.x * 1000, hy = -centre.z * 1000;
    hook.box(hx - 110, hy - 110, z0 + R.H - 14, hx + 110, hy + 110, z0 + R.H, M.galv);
    hook.rod([hx, hy, z0 + R.H - 14], [hx, hy, z0 + R.H - 90], 14, M.steel, 12);
    hook.add(new THREE.TorusGeometry(0.045, 0.012, 10, 24).translate(centre.x, top - 0.135, centre.z), M.steel);
    hook.into(common);
  }

  // pulleys: diverting and top ones fixed on their frames; car and counterweight pulleys of a 2:1 roping follow them
  const width = n * Math.max(d + 6, 1.7 * d) / 1000 + 0.03, frames = new Batch();
  for (const w of rig.wheels) {
    if (w.role === 'sheave') continue;
    const p = pulley(w.r, width, rig.dir, M.pulley);
    p.position.copy(at(w.u, w.y));
    common.add(p);
  }
  pulleyFrames(frames, M, rig, n, d, rig.bottom ? null : z0, ceiling);
  frames.into(common);
  const moving = rig.elements(0, 0).filter((e) => e.kind === 'wheel' && !rig.wheels.some((w) => Math.abs(w.u - e.u) < 1e-9 && Math.abs(w.y - e.y) < 1e-9));
  const carP = moving[0]?.kind === 'wheel' ? pulley(moving[0].r, width, rig.dir, M.pulley) : null;
  const cwP = moving[1]?.kind === 'wheel' ? pulley(moving[1].r, width, rig.dir, M.pulley) : null;
  if (carP) common.add(carP);
  if (cwP) common.add(cwP);

  return {
    sides, roof, common, focus: centre,
    bounds: R ? { x0: -R.shaftX, y0: -R.shaftY, x1: R.W - R.shaftX, y1: R.D - R.shaftY, top: z0 + R.H + 200 } : null,
    set(theta, i, carPos, cwPos) {
      machine.sheave.rotation.z = -theta;
      for (const part of machine.worm) part.rotation.x = theta * i;
      MM.ropeShift.value = 0;
      if (carP && carPos) carP.position.copy(carPos);
      if (cwP && cwPos) cwP.position.copy(cwPos);
    },
    dispose() {
      MM.dispose();
    },
  };
}
