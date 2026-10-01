// The car from its design: the platform and the galvanized shell of the walls (folded stiffeners outside) with the
// openings of its entrances; at each entrance the car doors, the aluminium sill, the apron (toe guard) under it and
// the door operator over it; the roof with the balustrade and the inspection station; the inside (car-inside.ts),
// the sling (sling.ts) and the people of the load (people.ts). Built in plan and heights from the car floor
// (millimetres); the group rides at the car floor level. Static parts are merged by material (geom.ts, Batch).
// Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import type { Layout } from '@/shaft';
import { Batch, onWall, type Point } from './geom';
import { doorPanels, type DoorPanels } from './shaft';
import { buildCarInside, type CarWall } from './car-inside';
import { buildSling, type Hitch } from './sling';
import type { GovernorSpot } from './governor';
import { buildPeople } from './people';
import { SIDES, type LiftMaterials, type Side } from './materials';

export interface CarModel {
  group: THREE.Group;
  setDoor(k: number): void;
  /** load in the car [kg]: one person every 75 kg */
  setLoad(kg: number): void;
  /** the floor display in the car */
  setDisplay(label: string, dir: -1 | 0 | 1): void;
  /** plan positions of the car buffers' plates (x, y) [mm] */
  bufferSpots: readonly (readonly [number, number])[];
  dispose(): void;
}

// UNI EN 81-20 5.4.5: the apron's vertical part at least 0.75 m, then bevelled back at 60° to the horizontal
const APRON = 750, BEVEL = 130;

export function buildCar(L: Layout, M: LiftMaterials, hitch: Hitch | null, gov: GovernorSpot | null, labels: readonly string[]): CarModel {
  const I = L.inputs, V = I.vertical, W = I.W, D = I.D, c = L.car, t = I.carWall;
  const group = new THREE.Group(), B = new Batch();
  const H = V.carH, Ho = V.carOutH;
  B.box(c.x, c.y, -V.platform, c.x + c.w, c.y + c.h, 0, M.frame);

  const doorsBySide = new Map(L.doors.map((d) => [d.wall, d] as const));
  const sideSpan: Record<Side, readonly [number, number, number]> = {
    // along-wall span of the car side and the depth of its outer face from that shaft wall
    front: [c.x, c.x + c.w, c.y], rear: [c.x, c.x + c.w, D - (c.y + c.h)], left: [c.y, c.y + c.h, c.x], right: [c.y, c.y + c.h, W - (c.x + c.w)],
  };
  const walls: CarWall[] = [], panels: DoorPanels[] = [];
  for (const side of SIDES) {
    const [a0, a1, v] = sideSpan[side], d = doorsBySide.get(side), len = side === 'front' || side === 'rear' ? W : D;
    walls.push({ side, face: v + t, a0: a0 + t, a1: a1 - t, door: d });
    const pieces: readonly (readonly [number, number, number, number])[] = d ? [[a0, d.u0, 0, H], [d.u1, a1, 0, H], [d.u0, d.u1, d.height, H]] : [[a0, a1, 0, H]];
    for (const [u0, u1, z0, z1] of pieces) if (u1 - u0 > 1) B.wallBox(side, W, D, u0, u1, v + 12, v + t - 2, z0, z1, M.galv);
    // folded stiffeners at the corners and the panel joints, inside the wall's allowance
    const n = Math.max(2, Math.round((a1 - a0) / 420));
    for (let k = 0; k <= n; k++) {
      const u = a0 + 12 + ((a1 - a0 - 24) * k) / n;
      if (!d || u < d.u0 - 30 || u > d.u1 + 30) B.wallBox(side, W, D, u - 12, u + 12, v, v + 12, 0, H, M.galv);
    }
    if (d) B.wallBox(side, W, D, d.u0, d.u1, v, v + 12, d.height + 30, d.height + 60, M.galv);
    if (!d) continue;

    // car door panels in front of the car, the sill with the grooves of their tracks, the apron under the sill
    const v0 = I.landingDepth + I.sillGap, tracks = d.kind === 'C2' ? [v0 + 10] : [v0 + 10, v0 + 42];
    const p = doorPanels(side, W, D, d, 0, v0 + 10, v0 + 42, 24, M.carDoor);
    panels.push(p);
    group.add(p.group);
    B.wallBox(side, W, D, d.u0 - 40, d.u1 + 40, v0, v, -25, 12, M.alu);
    B.wallBox(side, W, D, d.u0, d.u1, v, v + t, -25, 12, M.alu);
    for (const tr of tracks) B.wallBox(side, W, D, d.u0 - 40, d.u1 + 40, tr + 6, tr + 18, 12, 12.6, M.glass);
    B.wallBox(side, W, D, d.u0 - 25, d.u1 + 25, v0, v0 + 3, -APRON, -25, M.galv);
    const rad = Math.PI / 3;
    B.plate(side, W, D, d.u0 - 25, d.u1 + 25, [v0 + 1.5, -APRON], [v0 + 1.5 + BEVEL * Math.cos(rad), -APRON - BEVEL * Math.sin(rad)], 3, M.galv);
    for (const u of [d.u0 + 60, (d.u0 + d.u1) / 2, d.u1 - 60]) B.wallBox(side, W, D, u - 3, u + 3, v0 + 3, v0 + 45, -APRON + 40, -25, M.galv);

    // operator over the door: as long as the panels' travel needs (inside the shaft), its fascia over the hangers,
    // the track, the motor at the stack's end and the control box
    const Lw = d.width, ext = 40;
    const [h0, h1] = d.kind === 'C2' ? [(d.u0 + d.u1) / 2 - Lw - ext, (d.u0 + d.u1) / 2 + Lw + ext]
      : d.stack === 'low' ? [d.u1 - 1.5 * Lw - 20 - ext, d.u1 + ext] : [d.u0 - ext, d.u0 + 1.5 * Lw + 20 + ext];
    const lo = Math.max(h0, 20), hi = Math.min(h1, len - 20);
    const at = (u: number, vv: number, z: number): Point => {
      const [x, y] = onWall(side, W, D, u, vv);
      return [x, y, z];
    };
    B.wallBox(side, W, D, lo, hi, v0 + 2, v0 + 5, d.height + 15, Ho + 40, M.galv);
    B.wallBox(side, W, D, lo + 20, hi - 20, v0 + 8, v0 + 74, d.height + 95, d.height + 125, M.alu);
    B.wallBox(side, W, D, lo, hi, v0 + 5, v0 + 150, Ho, Ho + 10, M.galv);
    B.wallBox(side, W, D, lo, hi, v0 + 140, v0 + 150, Ho + 10, Ho + 170, M.galv);
    const motorAt = d.stack === 'low' ? lo + 120 : hi - 120, sgn = d.stack === 'low' ? -1 : 1;
    B.rod(at(motorAt - sgn * 80, v0 + 85, Ho + 70), at(motorAt + sgn * 80, v0 + 85, Ho + 70), 48, M.frame, 20);
    B.rod(at(motorAt + sgn * 80, v0 + 85, Ho + 70), at(motorAt + sgn * 95, v0 + 85, Ho + 70), 30, M.alu, 16);
    const box0 = d.stack === 'low' ? hi - 260 : lo + 40;
    B.wallBox(side, W, D, box0, box0 + 220, v0 + 40, v0 + 130, Ho + 10, Ho + 120, M.frame);
  }

  // roof, its balustrade (kneebar, handrail, toe board) on the sides without an entrance, the inspection station
  B.box(c.x, c.y, H, c.x + c.w, c.y + c.h, Ho, M.galv);
  if (V.parapet > 0) {
    const zb = Ho, zt = Ho + V.parapet, bar = 30;
    const rail = (x0: number, y0: number, x1: number, y1: number): void => {
      B.box(x0, y0, zt - bar, x1, y1, zt, M.base);
      B.box(x0, y0, zb + (zt - zb) / 2 - bar / 2, x1, y1, zb + (zt - zb) / 2 + bar / 2, M.base);
      B.box(x0, y0, zb, x1, y1, zb + 100, M.base);
      for (const [px, py] of [[x0, y0], [x1, y1]] as const) B.box(px - bar / 2, py - bar / 2, zb, px + bar / 2, py + bar / 2, zt, M.base);
    };
    const e = 100;
    if (!doorsBySide.has('rear')) rail(c.x + e, c.y + c.h - e - bar, c.x + c.w - e, c.y + c.h - e);
    if (!doorsBySide.has('left')) rail(c.x + e, c.y + e, c.x + e + bar, c.y + c.h - e);
    if (!doorsBySide.has('right')) rail(c.x + c.w - e - bar, c.y + e, c.x + c.w - e, c.y + c.h - e);
  }
  // inspection station within reach of the main entrance: stop (red), up, down and run buttons
  const main = L.doors.find((d) => d.side === 'A') ?? L.doors[0];
  if (main) {
    const [sx, sy] = onWall(main.wall, W, D, (main.wall === 'front' || main.wall === 'rear' ? c.x : c.y) + 300, I.landingDepth + I.sillGap + 330);
    const z0 = Ho + 820;
    B.rod([sx, sy, Ho], [sx, sy, z0], 18, M.galv, 10);
    B.box(sx - 80, sy - 55, z0, sx + 80, sy + 55, z0 + 200, M.base);
    B.rod([sx - 45, sy, z0 + 200], [sx - 45, sy, z0 + 228], 24, M.red, 18);
    for (const dx of [0, 30, 60]) B.rod([sx + dx, sy, z0 + 200], [sx + dx, sy, z0 + 210], 10, M.glass, 12);
  }

  const bufferSpots = buildSling(L, M, B, hitch, gov);
  const inside = buildCarInside(L, walls, H, labels, M, B, group);
  const people = buildPeople(L, M);
  group.add(people.group);
  B.into(group);

  return {
    group,
    bufferSpots,
    setDoor(k) {
      for (const p of panels) p.set(k);
    },
    setLoad: people.set,
    setDisplay: inside.setDisplay,
    dispose: inside.dispose,
  };
}
