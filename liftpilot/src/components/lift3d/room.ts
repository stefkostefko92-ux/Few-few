// The machine and its room: the room's shell (roomshell.ts) — above the shaft; with the machine below, a room past the
// wall behind the counterweight at the lowest floor (the machine's front through an opening in that wall, its sheave
// in the gap behind the counterweight) and, for a pulley room, that room over the slab; or a room under the pit — the
// geared machine of the landing page scaled to the sheave of the calculation, or the maker's machine the proposal took
// as it is (machine/shape), turned onto the sheave's rope plane,
// its anti-vibration mounts on levelling shims on the floor beside the rope openings (slab.ts); its cable in a floor
// trunking to the controller and the main switch's feed (wiring.ts); the lifting hook over it; the diverting and head
// pulleys on their frames, each in its rope's plane, the car and counterweight pulleys of a 2:1 roping and its dead
// ends (pulleys.ts). Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { PROFILES, supportOf, type HebLayout, type Layout, type MachineSupport } from '@/shaft';
import { machineFrame, type MachineFrame, type MachineShape } from '@/shaft/machine-shape';
import type { RinvioFrame } from '@/shaft/rinvio';
import { groovePitch } from '@/shaft/ropes';
import { KL, planeAt, type RopePlane, type RopeRig } from '@/lib/lift';
import { belowMachine } from '@/lib/lift/bottom';
import { buildMachine, CONDUIT_END, DIM, ROPE_LENGTH } from '../machine/parts';
import { buildShaped } from '../machine/shape';
import { createMaterials, type MachineMaterials } from '../machine/materials';
import { Batch } from './geom';
import { pulley, pulleyFrames } from './pulleys';
import { ropeWidths, type Opening } from './slab';
import type { GovernorSpot } from './governor';
import { buildShell, shellsOf } from './roomshell';
import { buildSupport, hebBeams, wallsAlong } from './support';
import { mainFeed, rectOf, roomPoint, trunking, trunkingRoute, type Rect } from './wiring';
import type { LiftMaterials, Side } from './materials';

const SHIMS: MachineSupport = { kind: 'shims' };

export interface RoomModel {
  /** walls of the machine's room, by side (x-ray); the rest */
  sides: Record<Side, THREE.Group>;
  roof: THREE.Group;
  common: THREE.Group;
  /** what hangs from the roof (the lamps, the lifting hook): hidden while the roof is a ghost, else it hangs in the air */
  overhead: THREE.Group;
  /** sheave rotation [rad] (positive: car going up), car floor and counterweight plate for the moving pulleys */
  set(theta: number, i: number, carPulley: THREE.Vector3 | null, cwPulley: THREE.Vector3 | null): void;
  /** where the machine is, for the camera */
  focus: THREE.Vector3;
  /** the room's inside in plan and the top of its roof [mm], for the x-ray; null without a room */
  bounds: { x0: number; y0: number; x1: number; y1: number; top: number } | null;
  dispose(): void;
}

/** The opening the machine's front needs in the wall behind the counterweight (machine below, beside the shaft): along
 *  that wall [mm] from its start, from the room's floor to over the machine; null for the other schemes. */
export function machinePassage(rig: RopeRig, D: number): { side: Side; u0: number; u1: number; z0: number; z1: number } | null {
  const g = rig.scheme;
  if (!g || g.scheme === 'under') return null;
  // the slow shaft through the wall: a sleeve's opening round it, on the sheave's axis
  const [dx, dy] = rig.dir, alongX = Math.abs(dx) <= Math.abs(dy), [px, py] = planeAt(rig.sheave.plane, rig.sheave.u), r = 0.075 * (D / 560) * 1000 + 30;
  const side: Side = alongX ? (dy > 0 ? 'rear' : 'front') : dx > 0 ? 'right' : 'left', u = alongX ? px : py, z = rig.sheave.y * 1000;
  return { side, u0: u - r, u1: u + r, z0: z - r, z1: z + r };
}

/** Where the machine stands in plan: the direction of its worm (local X), its sheave's centre [world m] and, beside the
 *  shaft, how much longer its slow shaft is to carry the sheave through the wall into the gap behind the counterweight
 *  [mm] (the gearbox in the room, 50 mm clear of the wall). `turn`: above the shaft, its motor toward the
 *  counterweight's drop (1) or turned round toward the car's (−1), as the room's drawings have it (machine-room.ts). */
export function machinePose(rig: RopeRig, wall: number, n: number, d: number, F: MachineFrame, turn: 1 | -1 = 1): { xDir: readonly [number, number]; centre: THREE.Vector3; ext: number } {
  const g = rig.scheme, S = rig.sheave, [px, py] = planeAt(S.plane, S.u);
  // above: the worm along the drops' plane; below: along the wall, the gearbox past the sheave away from the shaft
  // (through the wall) or, under the pit, toward the car
  const xDir = !g ? ([turn * rig.dir[0], turn * rig.dir[1]] as const) : g.scheme === 'under' ? g.across : ([-g.across[0], -g.across[1]] as const);
  const ext = g && g.scheme !== 'under' ? Math.max(0, KL.bottomClear + ropeWidths(n, d).ropes + wall + 50 - (F.zSheave - F.face)) : 0;
  return { xDir, centre: new THREE.Vector3(px / 1000, S.y, -py / 1000), ext };
}

/** `ceiling`: the slab's underside over the shaft [mm]; `openings`: the slab's (slab.ts); `gov`: the governor's spot;
 *  `shape`: the maker's machine as it is (null: the generic one scaled to the sheave); `rinvio`: where the diverting
 *  pulley turns in the room (src/shaft/rinvio.ts); `heb`: the HEB beams on the shaft's walls the support stands on;
 *  `turn`: the machine above turned round, its motor toward the car's drop (−1; machine-room.ts RoomGeo.dir). */
export function buildRoom(L: Layout, rig: RopeRig, n: number, d: number, D: number, ceiling: number, M: LiftMaterials, openings: readonly Opening[], gov: GovernorSpot | null,
  shape: MachineShape | null = null, rinvio: RinvioFrame | null = null, heb: HebLayout | null = null, turn: 1 | -1 = 1): RoomModel {
  const I = L.inputs, sides = { front: new THREE.Group(), rear: new THREE.Group(), left: new THREE.Group(), right: new THREE.Group() } as Record<Side, THREE.Group>;
  const roof = new THREE.Group(), common = new THREE.Group(), overhead = new THREE.Group();
  const at = (p: RopePlane, u: number, y: number): THREE.Vector3 => {
    const [x, yy] = planeAt(p, u);
    return new THREE.Vector3(x / 1000, y, -yy / 1000);
  };
  // below, the room grown round the machine's body where it reaches out (bottom.ts)
  const body = rig.bottom && rig.scheme ? belowMachine(L, rig.scheme, D, n, d, shape).body : null;
  const z0 = rig.roomFloor * 1000, shells = shellsOf(L, rig, body), shell = shells.find((sh) => sh.kind === 'machine') ?? null, R = shell?.room ?? null;
  for (const sh of shells) buildShell(sh, M, sides, roof, common, overhead);

  // the machine: the generic one scaled to the sheave or the maker's as it is, its rope plane on the sheave's, the
  // sheave's centre where the rig puts it; on its frame of three irons round the sheave (below beside the shaft, the
  // sheave through the wall, the machine's own)
  const MM: MachineMaterials = createMaterials(ROPE_LENGTH), F = machineFrame(D, shape, rinvio?.bed ?? null, !!rig.scheme && rig.scheme.scheme !== 'under');
  // the group's own units: the generic machine's metres at Ø 560 (scaled by s), the maker's in metres as they are
  const s = F.shape ? 1 : D / 560, irons = F.beams.map((z) => z / 1000 / s);
  const shaped = F.shape ? buildShaped(MM, F, D, n, d) : null;
  // the generic sheave grooved for the ropes it carries, at their pitch (in its own units, scaled by s)
  const machine = shaped ?? buildMachine(MM, false, irons, { n, pitch: groovePitch(d) / 1000 / s, ropeR: d / 2000 / s });
  const pose = machinePose(rig, I.wall, n, d, F, rig.bottom ? 1 : turn), e = pose.ext / 1000 / s;
  const yAxis = F.shape ? F.axis / 1000 : DIM.yWheel, zSh = F.shape ? F.zSheave / 1000 : DIM.zSheave, face = F.shape ? F.face / 1000 : 0.2;
  machine.group.scale.setScalar(s);
  machine.group.rotation.y = Math.atan2(pose.xDir[1], pose.xDir[0]);
  const centre = pose.centre;
  if (e > 0) {
    // the sheave on the longer slow shaft, out through the wall
    machine.sheave.position.z += e;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, zSh + e - face, 24).rotateX(Math.PI / 2), MM.machined);
    shaft.position.set(0, yAxis, (face + zSh + e) / 2);
    shaft.castShadow = true;
    machine.group.add(shaft);
  }
  const local = new THREE.Vector3(0, yAxis * s, (zSh + e) * s).applyEuler(machine.group.rotation);
  machine.group.position.copy(centre).sub(local);
  common.add(machine.group);
  // what the machine stands on, down to the floor (the sheave's axis sits at its height over the floor): above the
  // shaft the room's support (shims, frame, beams, plates, plinth), below it levelling shims
  const gap = F.shape ? rig.sheave.y - rig.roomFloor - yAxis : ((rig.sheave.y - rig.roomFloor) / s - DIM.yWheel) * s, sup = rig.bottom ? SHIMS : supportOf(I.room, rinvio !== null);
  // each beam's own walls along the machine's x: the line under its iron (the group's z across, in plan (x, −z))
  const o = [machine.group.position.x * 1000, -machine.group.position.z * 1000] as const, across = [pose.xDir[1], -pose.xDir[0]] as const;
  const walls = R ? F.beams.map((z) => wallsAlong([o[0] + z * across[0], o[1] + z * across[1]], pose.xDir, { x0: -R.shaftX, y0: -R.shaftY, x1: R.W - R.shaftX, y1: R.D - R.shaftY })) : null;
  // the diverting pulley in the bedplate: along the machine from the sheave, as the rig places it (the machine turned
  // round, on its other side)
  const defl = rig.wheels.find((w) => w.role === 'deflector'), framed = !rig.bottom && rinvio?.on === 'frame' && defl !== undefined;
  const inFrame = framed && defl && rinvio ? { x: turn * (defl.u - rig.sheave.u), r: defl.r, half: ropeWidths(n, d).pulley, frame: rinvio } : null;
  // the HEB beams on the shaft's walls under it all (the support, the pulleys' stands), on the floor
  const beams = !rig.bottom && R && heb ? heb : null, hebH = beams ? PROFILES[beams.profile].h : 0;
  if (beams && R) {
    const hb = new Batch();
    hebBeams(hb, beams, R, z0, M);
    hb.into(common);
  }
  const base = buildSupport(sup, F, D, gap, walls, M, inFrame, hebH / 1000);
  base.position.copy(machine.group.position);
  base.rotation.copy(machine.group.rotation);
  common.add(base);
  // the motor's cable: in a floor trunking to the controller's cabinet, or into the floor; the main switch's feed
  machine.group.updateMatrixWorld(true);
  const end = new THREE.Vector3(...(shaped ? shaped.conduitEnd : CONDUIT_END)).applyMatrix4(machine.group.matrixWorld), wires = new Batch();
  const tip = [end.x * 1000, -end.z * 1000] as const, tipH = end.y * 1000 - z0;
  if (R) {
    const x0 = -R.shaftX, y0 = -R.shaftY, pw = R.panelWall, across = pw === 'front' || pw === 'rear' ? 0 : 1;
    const uc = Math.min(R.panelAt + R.panelW - 120, Math.max(R.panelAt + 120, tip[across] - (across ? y0 : x0)));
    const from = roomPoint(R, x0, y0, pw, uc, R.panelD - 60), o = roomPoint(R, x0, y0, pw, uc, R.panelD - 59);
    const blocked: Rect[] = rig.bottom ? [] : openings.map((op) => rectOf(op.pts, op.curb ? 25 : 0));
    // the bedframe (and a frame or plinth under it), the pulleys' stands on the floor, the governor, the way through
    // the door (it opens outward)
    base.updateMatrixWorld(true);
    const foot = new THREE.Box3().setFromObject(base), wide = sup.kind === 'frame' || sup.kind === 'plinth' || sup.kind === 'rinvio';
    const out = F.shape ? 0.07 : 0.04, [fz0, fz1] = [irons[0] - out, irons[irons.length - 1] + out], [fx0, fx1] = F.shape ? [F.x[0] / 1000, F.x[1] / 1000] : [-0.52, 1.12];
    blocked.push(rectOf([[fx0, fz0], [fx1, fz0], [fx1, fz1], [fx0, fz1]].map(([x, zz]) => {
      const p = new THREE.Vector3(x, 0, zz).applyMatrix4(machine.group.matrixWorld);
      return [p.x * 1000, -p.z * 1000] as const;
    })));
    if (wide) blocked.push(rectOf([[foot.min.x * 1000, -foot.max.z * 1000], [foot.max.x * 1000, -foot.min.z * 1000]]));
    const half = ropeWidths(n, d).pulley;
    for (const w of rig.wheels) {
      if (rig.bottom || w.role === 'sheave' || w.y * 1000 <= ceiling) continue;
      const u0 = (w.u - w.r) * 1000 - 110, u1 = (w.u + w.r) * 1000 + 110, a = half + 40, [ox, oy] = w.plane.origin, [dx, dy] = w.plane.dir;
      blocked.push(rectOf([[u0, -a], [u1, -a], [u1, a], [u0, a]].map(([u, v]) => [ox + u * dx - v * dy, oy + u * dy + v * dx] as const)));
    }
    if (gov && !rig.bottom) blocked.push(rectOf([[gov.x - 175, gov.y1 - 30], [gov.x + 175, gov.y2 + 30]]));
    blocked.push(rectOf([roomPoint(R, x0, y0, R.doorWall, R.doorAt, 0), roomPoint(R, x0, y0, R.doorWall, R.doorAt + R.doorW, 600)]));
    const way = trunkingRoute(from, [o[0] - from[0], o[1] - from[1]], tip, blocked, { x0, y0, x1: x0 + R.W, y1: y0 + R.D });
    trunking(wires, M, way, tip, tipH, z0);
    const sw = shell?.switchSpan ?? [0, 0];
    mainFeed(wires, M, R, x0, y0, z0, (sw[0] + sw[1]) / 2, z0 + 1750);
  } else trunking(wires, M, null, tip, tipH, z0);
  wires.into(common);

  // the lifting hook over the machine, on its plate under the roof
  if (R) {
    const top = (z0 + R.H) / 1000, hook = new Batch(), hx = centre.x * 1000, hy = -centre.z * 1000;
    hook.box(hx - 110, hy - 110, z0 + R.H - 14, hx + 110, hy + 110, z0 + R.H, M.galv);
    hook.rod([hx, hy, z0 + R.H - 14], [hx, hy, z0 + R.H - 90], 14, M.steel, 12);
    hook.add(new THREE.TorusGeometry(0.045, 0.012, 10, 24).translate(centre.x, top - 0.135, centre.z), M.steel);
    hook.into(overhead);
  }

  // pulleys: diverting and head ones fixed on their frames; car and counterweight pulleys of a 2:1 roping follow them
  const width = n * groovePitch(d) / 1000 + 0.03, frames = new Batch();
  for (const w of rig.wheels) {
    if (w.role === 'sheave') continue;
    const p = pulley(w.r, width, w.plane.dir, M.pulley);
    p.position.copy(at(w.plane, w.u, w.y));
    common.add(p);
  }
  const over = !rig.bottom ? z0 + hebH : rig.scheme?.scheme === 'room' ? ceiling + (I.room?.slab ?? KL.slab) : null;
  pulleyFrames(frames, M, rig, n, d, over, ceiling, framed);
  frames.into(common);
  const pcs = rig.pieces(0, 0), first = pcs[0], last = pcs[pcs.length - 1];
  const moving = (pc: typeof first, e: (typeof first.els)[number] | undefined): THREE.Group | null =>
    e?.kind === 'wheel' && !rig.wheels.some((w) => w.plane === pc.plane && Math.abs(w.u - e.u) < 1e-9 && Math.abs(w.y - e.y) < 1e-9) ? pulley(e.r, width, pc.plane.dir, M.pulley) : null;
  const carP = moving(first, first.els[1]), cwP = moving(last, last.els[last.els.length - 2]);
  if (carP) common.add(carP);
  if (cwP) common.add(cwP);

  return {
    sides, roof, common, overhead, focus: centre,
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
