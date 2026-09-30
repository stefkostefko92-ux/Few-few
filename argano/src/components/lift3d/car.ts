// The car from its design: platform, walls with the openings of its entrances, roof, car doors and their operators,
// the sling (central on the two side walls, or cantilever "a zaino" on the wall opposite a side entrance) with its
// guide shoes, the buffer plates, the balustrade, the light, and the people of the load. Built in plan and heights
// from the car floor (millimetres); the group rides at the car floor level. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import type { Layout } from '@/shaft';
import { KV } from '@/shaft/norme';
import { P, box, wallBox } from './geom';
import { doorPanels, type DoorPanels } from './shaft';
import type { LiftMaterials, Side } from './materials';

export interface CarModel {
  group: THREE.Group;
  setDoor(k: number): void;
  /** load in the car [kg]: one person every 75 kg */
  setLoad(kg: number): void;
  /** plan positions of the car buffers' plates (x, y) [mm] */
  bufferSpots: readonly (readonly [number, number])[];
}

export function buildCar(L: Layout, M: LiftMaterials): CarModel {
  const I = L.inputs, V = I.vertical, W = I.W, D = I.D, c = L.car, ci = L.carInner, t = I.carWall;
  const group = new THREE.Group();
  const H = V.carH, Ho = V.carOutH;
  // platform and floor
  group.add(box(c.x, c.y, -V.platform, c.x + c.w, c.y + c.h, 0, M.frame));
  group.add(box(ci.x, ci.y, 0, ci.x + ci.w, ci.y + ci.h, 12, M.carFloor));
  // walls: the sides of the car with an entrance keep its opening
  const doorsBySide = new Map(L.doors.map((d) => [d.wall, d] as const));
  const sideSpan: Record<Side, readonly [number, number, number]> = {
    // along-wall span of the car side and the depth of its outer face from that shaft wall
    front: [c.x, c.x + c.w, c.y], rear: [c.x, c.x + c.w, D - (c.y + c.h)], left: [c.y, c.y + c.h, c.x], right: [c.y, c.y + c.h, W - (c.x + c.w)],
  };
  const panels: DoorPanels[] = [];
  for (const side of ['front', 'rear', 'left', 'right'] as const) {
    const [a0, a1, v] = sideSpan[side], d = doorsBySide.get(side);
    const piece = (u0: number, u1: number, z0: number, z1: number): void => {
      if (u1 - u0 > 1 && z1 - z0 > 1) group.add(wallBox(side, W, D, u0, u1, v, v + t, z0, z1, M.car));
    };
    if (!d) { piece(a0, a1, 0, H); continue; }
    piece(a0, d.u0, 0, H);
    piece(d.u1, a1, 0, H);
    piece(d.u0, d.u1, d.height, H);
    // car door panels in front of the car, sill, and the operator on the roof over the door
    const v0 = I.landingDepth + I.sillGap;
    const p = doorPanels(side, W, D, d, 0, v0 + 10, v0 + 42, 24, M.carDoor);
    panels.push(p);
    group.add(p.group);
    group.add(wallBox(side, W, D, d.u0 - 40, d.u1 + 40, v0, v, -20, 0, M.frame));
    group.add(wallBox(side, W, D, d.op0, d.op1, v0, v0 + KV.doorOpDepth, Ho, V.opTop, M.frame));
  }
  // roof and light
  group.add(box(c.x, c.y, H, c.x + c.w, c.y + c.h, Ho, M.car));
  group.add(box(ci.x + ci.w * 0.18, ci.y + ci.h * 0.18, H - 14, ci.x + ci.w * 0.82, ci.y + ci.h * 0.82, H - 4, M.carLight));
  const lamp = new THREE.PointLight(0xfff1dc, 1.6, 3.2, 2);
  lamp.position.copy(P(ci.x + ci.w / 2, ci.y + ci.h / 2, H - 200));
  group.add(lamp);

  // sling: two channels flanking each car rail's blade, the guide shoes round its tip, crosshead and safety plank
  const f = L.frame, carRails = L.rails.filter((r) => r.kind === 'car');
  const upright = (r: (typeof carRails)[number]): void => {
    const toCar = r.dir === 'right' || r.dir === 'back' ? 1 : -1, alongX = r.dir === 'right' || r.dir === 'left';
    const a = alongX ? r.x : r.y, b = alongX ? r.y : r.x;
    const span = (a0: number, a1: number, b0: number, b1: number, z0: number, z1: number, mat: THREE.Material): void => {
      const [p0, p1] = [Math.min(a0, a1), Math.max(a0, a1)];
      group.add(alongX ? box(p0, b0, z0, p1, b1, z1, mat) : box(b0, p0, z0, b1, p1, z1, mat));
    };
    for (const [b0, b1] of [[b - 85, b - 35], [b + 35, b + 85]] as const) span(a - toCar * 50, a + toCar * 25, b0, b1, -V.frameBelow, V.frameTop, M.steel);
    for (const z of [-V.frameBelow + 60, V.frameTop - 130]) span(a - toCar * 45, a + toCar * 15, b - 35, b + 35, z, z + 110, M.rubber);
  };
  carRails.forEach(upright);
  if (f.kind === 'central') {
    const xl = Math.min(...carRails.map((r) => r.x)) - 50, xr = Math.max(...carRails.map((r) => r.x)) + 50;
    group.add(box(xl, f.axis - 85, V.frameTop - 180, xr, f.axis + 85, V.frameTop, M.steel));
    group.add(box(xl, f.axis - 85, -V.frameBelow, xr, f.axis + 85, -V.frameBelow + 160, M.steel));
  } else {
    const ys = carRails.map((r) => r.y), y0 = Math.min(...ys) - 50, y1 = Math.max(...ys) + 50, x = f.axis, far = x < c.x + c.w / 2 ? c.x + c.w : c.x;
    group.add(box(x - 85, y0, V.frameTop - 180, x + 85, y1, V.frameTop, M.steel));
    group.add(box(x - 85, y0, -V.frameBelow, x + 85, y1, -V.frameBelow + 160, M.steel));
    // the arms that carry the car off the rails
    for (const yr of ys) group.add(box(Math.min(x, far), yr - 45, -V.platform - 150, Math.max(x, far), yr + 45, -V.platform, M.steel));
  }

  // balustrade on the roof along the sides without an entrance
  if (V.parapet > 0) {
    const zb = Ho, zt = Ho + V.parapet, bar = 30;
    const rail = (x0: number, y0: number, x1: number, y1: number): void => {
      group.add(box(x0, y0, zt - bar, x1, y1, zt, M.base));
      group.add(box(x0, y0, zb + (zt - zb) / 2 - bar / 2, x1, y1, zb + (zt - zb) / 2 + bar / 2, M.base));
      for (const [px, py] of [[x0, y0], [x1, y1]] as const) group.add(box(px - bar / 2, py - bar / 2, zb, px + bar / 2, py + bar / 2, zt, M.base));
    };
    const e = 100;
    if (!doorsBySide.has('rear')) rail(c.x + e, c.y + c.h - e - bar, c.x + c.w - e, c.y + c.h - e);
    if (!doorsBySide.has('left')) rail(c.x + e, c.y + e, c.x + e + bar, c.y + c.h - e);
    if (!doorsBySide.has('right')) rail(c.x + c.w - e - bar, c.y + e, c.x + c.w - e, c.y + c.h - e);
  }

  // buffer plates under the car, where the buffers stand
  const n = Math.max(1, V.carBuffers), yb = f.kind === 'central' ? f.axis : c.y + c.h / 2;
  const bufferSpots = Array.from({ length: n }, (_, i) => [c.x + (c.w * (i + 1)) / (n + 1), yb] as const);
  for (const [bx, by] of bufferSpots) group.add(box(bx - 90, by - 90, -V.frameBelow - 12, bx + 90, by + 90, -V.frameBelow, M.steel));

  // people of the load: capsules on a grid, as many as the load allows at 75 kg each
  const cols = Math.max(1, Math.floor(ci.w / 420)), rows = Math.max(1, Math.floor(ci.h / 420)), max = cols * rows;
  const people = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.17, 1.2, 6, 12), M.person, max);
  const m4 = new THREE.Matrix4();
  for (let k = 0; k < max; k++) {
    const i = k % cols, j = Math.floor(k / cols);
    const px = ci.x + (ci.w * (i + 0.5)) / cols, py = ci.y + ci.h - (ci.h * (j + 0.5)) / rows;
    people.setMatrixAt(k, m4.makeTranslation(px / 1000, 0.77, -py / 1000));
  }
  people.count = 0;
  people.castShadow = true;
  group.add(people);

  return {
    group,
    bufferSpots,
    setDoor(k) {
      for (const p of panels) p.set(k);
    },
    setLoad(kg) {
      people.count = Math.min(max, Math.max(0, Math.round(kg / KV.personMass)));
    },
  };
}
