// The rooms of the machine and of the pulleys as shells: the room above the shaft from its design; with the machine
// below, the room the drawings show too (lib/lift/bottom.ts belowRoom) — past the wall behind the counterweight, open on
// the shaft's side (the shaft's wall closes it), the controller's cabinet on the far wall beside the machine's motor and
// the door in the side wall across the ropes from the machine, or under the pit's slab as large as the shaft, either
// grown round the machine where it reaches out; for a pulley room over the slab, the room above from the design or one
// as large as the shaft, 1.5 m high, with a door of 0.6 × 1.4 m. The walls with the door (x-ray, by side), the roof
// (and the floor of a room below), the cabinet and the main switch of a machine's room, the lamp. Plan and heights in
// millimetres, in the shaft's coordinates. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import type { Layout, RoomInputs } from '@/shaft';
import { KL, type RopeRig } from '@/lib/lift';
import { belowRoom } from '@/lib/lift/bottom';
import { section } from '@/shaft';
import { SWITCH, belowSwitchAt, switchSpan } from '@/shaft/room-floor';
import { Batch, box, onWall } from './geom';
import { SIDES, type LiftMaterials, type Side } from './materials';

const WALL = 250;

export interface Shell {
  room: RoomInputs;
  /** the side left open onto the shaft's wall (a room below) */
  open: Side | null;
  /** the floor [mm] */
  z0: number;
  /** the machine's room (cabinet, main switch) or the pulleys'; whether it has its own floor and roof */
  kind: 'machine' | 'pulleys';
  /** a machine's room: where the main switch runs along the door's wall [mm] (room-floor.ts) */
  switchSpan?: readonly [number, number];
  floor: boolean;
  roof: boolean;
  /** under the pit, a room larger than the shaft: its roof round the shaft's outer footprint [x0, y0, x1, y1] (the pit's
   *  slab, buildShaft, covers the rest), as thick as that slab */
  ring?: readonly [number, number, number, number];
}

/** Whether u along a wall runs along plan x (front and rear walls) or y. */
const alongX = (s: Side): boolean => s === 'front' || s === 'rear';

/** The rooms: the machine's — above from the design, below beside the shaft, or under the pit, grown round the machine's
 *  `body` (bottom.ts belowMachine) — and a pulley room over the slab. The machine's body stands across the ropes' plane
 *  toward (−dy, dx) of the plan's direction (room.ts). */
export function shellsOf(L: Layout, rig: RopeRig, body: readonly (readonly [number, number])[] | null = null): Shell[] {
  const z0 = rig.roomFloor * 1000, I = L.inputs, g = rig.scheme;
  if (!rig.bottom || !g) return I.room ? [{ room: I.room, open: null, z0, kind: 'machine', switchSpan: switchSpan(I.room), floor: false, roof: true }] : [];
  const S = section(L), out: Shell[] = [], below = belowRoom(L, g, body), T = I.wall;
  // under the pit no roof of its own but round the shaft (the pit's slab); beside the shaft open on its wall (bottom.ts)
  const sw = belowSwitchAt(below.room);
  out.push({ room: below.room, open: below.open, z0, kind: 'machine', switchSpan: [sw - 100, sw + 100], floor: true, roof: g.scheme !== 'under', ...(g.scheme === 'under' ? { ring: [-T, -T, I.W + T, I.D + T] as const } : {}) });
  if (g.scheme === 'room') {
    const room: RoomInputs = I.room ?? {
      W: I.W, D: I.D, shaftX: 0, shaftY: 0, H: 1500, ridge: 0, slab: KL.slab, doorWall: 'front', doorAt: 150, doorW: 600, doorH: 1400,
      panelWall: 'rear', panelAt: 0, panelW: 0, panelD: 0, panelH: 0,
    };
    out.push({ room, open: null, z0: S.ceiling + room.slab, kind: 'pulleys', floor: false, roof: true });
  }
  return out;
}

/** The shell's walls into `sides` (x-ray), its roof into `roof`, what hangs from the roof (the lamp) into `overhead` —
 *  shown and hidden with the roof —, the rest into `common`. */
export function buildShell(sh: Shell, M: LiftMaterials, sides: Record<Side, THREE.Group>, roof: THREE.Group, common: THREE.Group, overhead: THREE.Group): void {
  const { room: R, z0 } = sh, x0 = -R.shaftX, y0 = -R.shaftY, Wr = R.W, Dr = R.D, H = R.H;
  for (const side of SIDES) {
    if (side === sh.open) continue;
    const a0 = alongX(side) ? -WALL : 0, a1 = alongX(side) ? Wr + WALL : Dr, g = sides[side];
    const piece = (u0: number, u1: number, zz0: number, zz1: number): void => {
      if (u1 - u0 < 1 || zz1 - zz0 < 1) return;
      const [p, q] = [onWall(side, Wr, Dr, u0, -WALL), onWall(side, Wr, Dr, u1, 0)];
      g.add(box(p[0] + x0, p[1] + y0, zz0, q[0] + x0, q[1] + y0, zz1, M.roomWalls[side]));
    };
    if (R.doorWall === side) {
      piece(a0, R.doorAt, z0, z0 + H);
      piece(R.doorAt + R.doorW, a1, z0, z0 + H);
      piece(R.doorAt, R.doorAt + R.doorW, z0 + R.doorH, z0 + H);
    } else piece(a0, a1, z0, z0 + H);
  }
  // the roof and the floor over the walls, but on the side open onto the shaft only to the shaft wall's outer face (the
  // room starts there): never into the shaft
  const past = (side: Side): number => (side === sh.open ? 0 : WALL), X0 = x0 - past('left'), Y0 = y0 - past('front'), X1 = x0 + Wr + past('right'), Y1 = y0 + Dr + past('rear');
  if (sh.roof) roof.add(box(X0, Y0, z0 + H, X1, Y1, z0 + H + 200, M.roof));
  if (sh.ring) {
    const [h0, k0, h1, k1] = sh.ring, za = z0 + H, zb = za + KL.underSlab;
    for (const [a, b, c, d] of [[X0, Y0, h0, Y1], [h1, Y0, X1, Y1], [h0, Y0, h1, k0], [h0, k1, h1, Y1]] as const) {
      if (c - a > 1 && d - b > 1) roof.add(box(a, b, za, c, d, zb, M.slab));
    }
  }
  if (sh.floor) common.add(box(X0, Y0, z0 - 200, X1, Y1, z0, M.slab));
  // a box against a wall of the room: u along it, v out from it, z over the floor
  const B = new Batch();
  const fix = (wall: Side, u0: number, u1: number, v0: number, v1: number, za: number, zb: number, m: THREE.Material, into: Batch = B): void => {
    const [p, q] = [onWall(wall, Wr, Dr, u0, v0), onWall(wall, Wr, Dr, u1, v1)];
    into.box(p[0] + x0, p[1] + y0, z0 + za, q[0] + x0, q[1] + y0, z0 + zb, m);
  };
  if (sh.kind === 'machine' && sh.switchSpan) machineFittings(fix, R, M, sh.switchSpan);
  B.into(common);
  // the lamp under the roof (hidden with the roof turned into a ghost: it would hang in the air)
  const fitting = new Batch();
  fix('front', Wr / 2 - 300, Wr / 2 + 300, Dr / 2 - 60, Dr / 2 + 60, H - 70, H, M.galv, fitting);
  fix('front', Wr / 2 - 280, Wr / 2 + 280, Dr / 2 - 45, Dr / 2 + 45, H - 74, H - 70, M.carLight, fitting);
  fitting.into(overhead);
  const lamp = new THREE.PointLight(0xfff2de, 2.2, 7, 2);
  lamp.position.set((x0 + Wr / 2) / 1000, (z0 + H - 150) / 1000, -(y0 + Dr / 2) / 1000);
  common.add(lamp);
}

type Fix = (wall: Side, u0: number, u1: number, v0: number, v1: number, za: number, zb: number, m: THREE.Material) => void;

/** The controller cabinet: two doors with their handles, the display and the lamps of its state, the louvres; the
 *  main switch by the door (along it from `sw[0]` to `sw[1]`) with its handle. */
function machineFittings(fix: Fix, R: RoomInputs, M: LiftMaterials, [s0, s1]: readonly [number, number]): void {
  const pw = R.panelWall, a = R.panelAt, w = R.panelW, dp = R.panelD, h = R.panelH;
  fix(pw, a, a + w, 0, dp, 0, h, M.panel);
  fix(pw, a + w / 2 - 2, a + w / 2 + 2, dp, dp + 1, 40, h - 40, M.glass);
  for (const u of [a + w / 2 - 40, a + w / 2 + 28]) fix(pw, u, u + 12, dp, dp + 22, h / 2 - 90, h / 2 + 90, M.chrome);
  fix(pw, a + 60, a + 200, dp, dp + 2, h - 300, h - 210, M.glass);
  for (const [k, m] of [[0, M.led], [1, M.carLight], [2, M.red]] as const) fix(pw, a + 240 + k * 40, a + 260 + k * 40, dp, dp + 4, h - 265, h - 245, m);
  for (let k = 0; k < 5; k++) fix(pw, a + w / 2 + 60, a + w - 60, dp, dp + 3, 120 + k * 36, 132 + k * 36, M.glass);
  // the main switch by the door, its handle
  const dw = R.doorWall, c = (s0 + s1) / 2, d = SWITCH.depth;
  fix(dw, s0, s1, 0, d, 1450, 1750, M.panel);
  fix(dw, c - 30, c + 30, d, d + 15, 1560, 1640, M.base);
  fix(dw, c - 8, c + 8, d + 15, d + 45, 1540, 1660, M.red);
}
