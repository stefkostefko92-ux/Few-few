// The rooms of the machine and of the pulleys as shells: the room above the shaft from its design; with the machine
// below, a room past the wall behind the counterweight, 2.2 m along the ropes' plane, 2.6 m across and 2.4 m high,
// open on the shaft's side (the shaft's wall closes it), the controller's cabinet on the far wall beside the
// machine's motor and the door in the side wall across the ropes from the machine; for a pulley room over the slab,
// the room above from the design or one as large as the shaft, 1.5 m high, with a door of 0.6 × 1.4 m; for the
// machine under the pit, a room as large as the shaft under the pit's slab. The walls with the door (x-ray, by side),
// the roof (and the floor of a room below), the cabinet and the main switch of a machine's room, the lamp. Plan and
// heights in millimetres, in the shaft's coordinates. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import type { Layout, RoomInputs } from '@/shaft';
import { KL, type RopeRig } from '@/lib/lift';
import { section } from '@/shaft';
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
  floor: boolean;
  roof: boolean;
}

const OPPOSITE: Record<Side, Side> = { front: 'rear', rear: 'front', left: 'right', right: 'left' };
/** The side of a plan rectangle whose outward normal is (nx, ny): the larger component's. */
const facing = (nx: number, ny: number): Side => (Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? 'right' : 'left') : ny > 0 ? 'rear' : 'front');
/** Whether u along a wall runs along plan x (front and rear walls) or y. */
const alongX = (s: Side): boolean => s === 'front' || s === 'rear';

/** The rooms: the machine's — above from the design, below beside the shaft, or under the pit — and a pulley room over
 *  the slab. The machine's body stands across the ropes' plane toward (−dy, dx) of the plan's direction (room.ts). */
export function shellsOf(L: Layout, rig: RopeRig): Shell[] {
  const z0 = rig.roomFloor * 1000, I = L.inputs, g = rig.scheme;
  if (!rig.bottom || !g) return I.room ? [{ room: I.room, open: null, z0, kind: 'machine', floor: false, roof: true }] : [];
  const S = section(L), out: Shell[] = [];
  if (g.scheme === 'under') {
    // under the pit: as large as the shaft, the door on the entrance's wall, the cabinet on a side
    const room: RoomInputs = {
      W: I.W, D: I.D, shaftX: 0, shaftY: 0, H: KL.underRoomH, ridge: 0, slab: 0, doorWall: 'front', doorAt: 150, doorW: 800, doorH: 2000,
      panelWall: L.cwSide === 'left' ? 'right' : 'left', panelAt: 150, panelW: 800, panelD: 300, panelH: 1800,
    };
    out.push({ room, open: null, z0, kind: 'machine', floor: true, roof: false });
  } else {
    const [dx, dy] = rig.dir, [ox, oy] = rig.origin, u0 = rig.wallAt * 1000 + I.wall, u1 = u0 + 2200, half = 1300;
    const pts = [[u0, -half], [u1, -half], [u1, half], [u0, half]].map(([u, v]) => [ox + u * dx - v * dy, oy + u * dy + v * dx]);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys);
    const W = Math.max(...xs) - x0, D = Math.max(...ys) - y0, open = facing(-dx, -dy), far = OPPOSITE[open];
    const len = (s: Side): number => (alongX(s) ? W : D), doorWall = facing(dy, -dx);
    // the cabinet at the far wall's end on the motor's side, the door near the far end of the other side wall
    const toMotor = alongX(far) ? -dy : dx, toFar = alongX(doorWall) ? dx : dy;
    const room: RoomInputs = {
      W, D, shaftX: -x0, shaftY: -y0, H: 2400, ridge: 0, slab: 0,
      doorWall, doorAt: toFar > 0 ? len(doorWall) - 1000 : 200, doorW: 800, doorH: 2000,
      panelWall: far, panelAt: toMotor > 0 ? len(far) - 900 : 100, panelW: 800, panelD: 300, panelH: 1800,
    };
    out.push({ room, open, z0, kind: 'machine', floor: true, roof: true });
  }
  if (g.scheme === 'room') {
    const room: RoomInputs = I.room ?? {
      W: I.W, D: I.D, shaftX: 0, shaftY: 0, H: 1500, ridge: 0, slab: KL.slab, doorWall: 'front', doorAt: 150, doorW: 600, doorH: 1400,
      panelWall: 'rear', panelAt: 0, panelW: 0, panelD: 0, panelH: 0,
    };
    out.push({ room, open: null, z0: S.ceiling + room.slab, kind: 'pulleys', floor: false, roof: true });
  }
  return out;
}

/** The main switch's place along the door's wall: beside the door. */
export const switchAt = (R: RoomInputs): number => (R.doorAt > 400 ? R.doorAt - 300 : R.doorAt + R.doorW + 100);

/** The shell's walls into `sides` (x-ray), its roof into `roof`, the rest into `common`. */
export function buildShell(sh: Shell, M: LiftMaterials, sides: Record<Side, THREE.Group>, roof: THREE.Group, common: THREE.Group): void {
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
  if (sh.roof) roof.add(box(x0 - WALL, y0 - WALL, z0 + H, x0 + Wr + WALL, y0 + Dr + WALL, z0 + H + 200, M.roof));
  if (sh.floor) common.add(box(x0 - WALL, y0 - WALL, z0 - 200, x0 + Wr + WALL, y0 + Dr + WALL, z0, M.slab));
  // a box against a wall of the room: u along it, v out from it, z over the floor
  const B = new Batch();
  const fix = (wall: Side, u0: number, u1: number, v0: number, v1: number, za: number, zb: number, m: THREE.Material): void => {
    const [p, q] = [onWall(wall, Wr, Dr, u0, v0), onWall(wall, Wr, Dr, u1, v1)];
    B.box(p[0] + x0, p[1] + y0, z0 + za, q[0] + x0, q[1] + y0, z0 + zb, m);
  };
  if (sh.kind === 'machine') machineFittings(fix, R, M);
  // the lamp under the roof
  fix('front', Wr / 2 - 300, Wr / 2 + 300, Dr / 2 - 60, Dr / 2 + 60, H - 70, H, M.galv);
  fix('front', Wr / 2 - 280, Wr / 2 + 280, Dr / 2 - 45, Dr / 2 + 45, H - 74, H - 70, M.carLight);
  B.into(common);
  const lamp = new THREE.PointLight(0xfff2de, 2.2, 7, 2);
  lamp.position.set((x0 + Wr / 2) / 1000, (z0 + H - 150) / 1000, -(y0 + Dr / 2) / 1000);
  common.add(lamp);
}

type Fix = (wall: Side, u0: number, u1: number, v0: number, v1: number, za: number, zb: number, m: THREE.Material) => void;

/** The controller cabinet: two doors with their handles, the display and the lamps of its state, the louvres; the
 *  main switch by the door with its handle. */
function machineFittings(fix: Fix, R: RoomInputs, M: LiftMaterials): void {
  const pw = R.panelWall, a = R.panelAt, w = R.panelW, dp = R.panelD, h = R.panelH;
  fix(pw, a, a + w, 0, dp, 0, h, M.panel);
  fix(pw, a + w / 2 - 2, a + w / 2 + 2, dp, dp + 1, 40, h - 40, M.glass);
  for (const u of [a + w / 2 - 40, a + w / 2 + 28]) fix(pw, u, u + 12, dp, dp + 22, h / 2 - 90, h / 2 + 90, M.chrome);
  fix(pw, a + 60, a + 200, dp, dp + 2, h - 300, h - 210, M.glass);
  for (const [k, m] of [[0, M.led], [1, M.carLight], [2, M.red]] as const) fix(pw, a + 240 + k * 40, a + 260 + k * 40, dp, dp + 4, h - 265, h - 245, m);
  for (let k = 0; k < 5; k++) fix(pw, a + w / 2 + 60, a + w - 60, dp, dp + 3, 120 + k * 36, 132 + k * 36, M.glass);
  // the main switch by the door, its handle
  const dw = R.doorWall, sw = switchAt(R) - 100;
  fix(dw, sw, sw + 200, 0, 130, 1450, 1750, M.panel);
  fix(dw, sw + 70, sw + 130, 130, 145, 1560, 1640, M.base);
  fix(dw, sw + 92, sw + 108, 145, 175, 1540, 1660, M.red);
}
