// The machine and its room: the room above the shaft (walls with the door, roof, the controller cabinet, the main
// switch by the door, the lifting hook over the machine, the lamp) or, with the machine below, a room past the wall
// behind the counterweight; the geared machine of the landing page scaled to the sheave of the calculation and
// turned onto the rope plane; the diverting and top pulleys, and the car and counterweight pulleys of a 2:1 roping.
// Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import type { Layout } from '@/shaft';
import type { RopeRig } from '@/lib/lift';
import { buildMachine, DIM, ROPE_LENGTH } from '../machine/parts';
import { createMaterials, type MachineMaterials } from '../machine/materials';
import { Batch, box, onWall } from './geom';
import { SIDES, type LiftMaterials, type Side } from './materials';

const WALL = 250;

export interface RoomModel {
  /** walls of the room above, by side (x-ray); the rest */
  sides: Record<Side, THREE.Group>;
  roof: THREE.Group;
  common: THREE.Group;
  /** sheave rotation [rad] (positive: car going up), car floor and counterweight plate for the moving pulleys */
  set(theta: number, i: number, carPulley: THREE.Vector3 | null, cwPulley: THREE.Vector3 | null): void;
  /** where the machine is, for the camera */
  focus: THREE.Vector3;
  dispose(): void;
}

/** A pulley with its axis across the rope plane (plan direction perpendicular to dir). */
function pulley(r: number, width: number, dir: readonly [number, number], mat: THREE.Material): THREE.Group {
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

export function buildRoom(L: Layout, rig: RopeRig, n: number, d: number, D: number, M: LiftMaterials): RoomModel {
  const I = L.inputs, R = I.room, sides = { front: new THREE.Group(), rear: new THREE.Group(), left: new THREE.Group(), right: new THREE.Group() } as Record<Side, THREE.Group>;
  const roof = new THREE.Group(), common = new THREE.Group();
  const [dx, dy] = rig.dir, [ox, oy] = rig.origin;
  const at = (u: number, y: number): THREE.Vector3 => new THREE.Vector3(ox / 1000 + u * dx, y, -(oy / 1000 + u * dy));
  const z0 = rig.roomFloor * 1000;
  if (!rig.bottom && R) {
    // the room above: plan in the shaft's coordinates (the shaft's corner at shaftX, shaftY of the room)
    const x0 = -R.shaftX, y0 = -R.shaftY, Wr = R.W, Dr = R.D, H = R.H;
    for (const side of SIDES) {
      const along = side === 'front' || side === 'rear';
      const a0 = along ? -WALL : 0, a1 = along ? Wr + WALL : Dr, g = sides[side];
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
    roof.add(box(x0 - WALL, y0 - WALL, z0 + H, x0 + Wr + WALL, y0 + Dr + WALL, z0 + H + 200, M.roof));
    // a box against a wall of the room: u along it, v out from it, z over the floor
    const B = new Batch();
    const fix = (wall: Side, u0: number, u1: number, v0: number, v1: number, za: number, zb: number, m: THREE.Material): void => {
      const [p, q] = [onWall(wall, Wr, Dr, u0, v0), onWall(wall, Wr, Dr, u1, v1)];
      B.box(p[0] + x0, p[1] + y0, z0 + za, q[0] + x0, q[1] + y0, z0 + zb, m);
    };
    // the controller cabinet: two doors with their handles, the display and the lamps of its state, the louvres
    const pw = R.panelWall, a = R.panelAt, w = R.panelW, dp = R.panelD, h = R.panelH;
    fix(pw, a, a + w, 0, dp, 0, h, M.panel);
    fix(pw, a + w / 2 - 2, a + w / 2 + 2, dp, dp + 1, 40, h - 40, M.glass);
    for (const u of [a + w / 2 - 40, a + w / 2 + 28]) fix(pw, u, u + 12, dp, dp + 22, h / 2 - 90, h / 2 + 90, M.chrome);
    fix(pw, a + 60, a + 200, dp, dp + 2, h - 300, h - 210, M.glass);
    for (const [k, m] of [[0, M.led], [1, M.carLight], [2, M.red]] as const) fix(pw, a + 240 + k * 40, a + 260 + k * 40, dp, dp + 4, h - 265, h - 245, m);
    for (let k = 0; k < 5; k++) fix(pw, a + w / 2 + 60, a + w - 60, dp, dp + 3, 120 + k * 36, 132 + k * 36, M.glass);
    // the main switch by the door, its handle
    const dw = R.doorWall, sw = R.doorAt > 400 ? R.doorAt - 300 : R.doorAt + R.doorW + 100;
    fix(dw, sw, sw + 200, 0, 130, 1450, 1750, M.panel);
    fix(dw, sw + 70, sw + 130, 130, 145, 1560, 1640, M.base);
    fix(dw, sw + 92, sw + 108, 145, 175, 1540, 1660, M.red);
    // the lamp under the roof
    fix('front', Wr / 2 - 300, Wr / 2 + 300, Dr / 2 - 60, Dr / 2 + 60, H - 70, H, M.galv);
    fix('front', Wr / 2 - 280, Wr / 2 + 280, Dr / 2 - 45, Dr / 2 + 45, H - 74, H - 70, M.carLight);
    B.into(common);
    const lamp = new THREE.PointLight(0xfff2de, 2.2, 7, 2);
    lamp.position.set((x0 + Wr / 2) / 1000, (z0 + H - 150) / 1000, -(y0 + Dr / 2) / 1000);
    common.add(lamp);
  } else if (rig.bottom) {
    // the room below, past the wall behind the counterweight: floor, far wall, roof
    const u0 = rig.wallAt + I.wall / 1000, u1 = u0 + 2.2, half = 1.3, h = 2.4;
    const corners = [[u0, -half], [u1, -half], [u1, half], [u0, half]].map(([u, v]) => at(u, 0).add(new THREE.Vector3(-dy * v, 0, -dx * v)));
    const xs = corners.map((c) => c.x * 1000), zs = corners.map((c) => -c.z * 1000);
    common.add(box(Math.min(...xs), Math.min(...zs), -200, Math.max(...xs), Math.max(...zs), 0, M.slab));
    roof.add(box(Math.min(...xs), Math.min(...zs), h * 1000, Math.max(...xs), Math.max(...zs), h * 1000 + 200, M.roof));
    const lamp = new THREE.PointLight(0xfff2de, 2, 6, 2);
    lamp.position.copy(at((u0 + u1) / 2, h - 0.2));
    common.add(lamp);
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
  // the lifting hook over the machine, on its plate under the roof of the room above
  if (!rig.bottom && R) {
    const top = (z0 + R.H) / 1000, hook = new Batch(), hx = centre.x * 1000, hy = -centre.z * 1000;
    hook.box(hx - 110, hy - 110, z0 + R.H - 14, hx + 110, hy + 110, z0 + R.H, M.galv);
    hook.rod([hx, hy, z0 + R.H - 14], [hx, hy, z0 + R.H - 90], 14, M.steel, 12);
    hook.add(new THREE.TorusGeometry(0.045, 0.012, 10, 24).translate(centre.x, top - 0.135, centre.z), M.steel);
    hook.into(common);
  }

  // pulleys: diverting and top ones fixed; car and counterweight pulleys of a 2:1 roping follow them
  const width = n * Math.max(d + 6, 1.7 * d) / 1000 + 0.03;
  for (const w of rig.wheels) {
    if (w.role === 'sheave') continue;
    const p = pulley(w.r, width, rig.dir, M.pulley);
    p.position.copy(at(w.u, w.y));
    common.add(p);
    common.add(box(p.position.x * 1000 - 40, -p.position.z * 1000 - 40, w.y * 1000, p.position.x * 1000 + 40, -p.position.z * 1000 + 40, (w.y + w.r + 0.15) * 1000, M.steel));
  }
  const moving = rig.elements(0, 0).filter((e) => e.kind === 'wheel' && !rig.wheels.some((w) => Math.abs(w.u - e.u) < 1e-9 && Math.abs(w.y - e.y) < 1e-9));
  const carP = moving[0]?.kind === 'wheel' ? pulley(moving[0].r, width, rig.dir, M.pulley) : null;
  const cwP = moving[1]?.kind === 'wheel' ? pulley(moving[1].r, width, rig.dir, M.pulley) : null;
  if (carP) common.add(carP);
  if (cwP) common.add(cwP);

  return {
    sides, roof, common, focus: centre,
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
