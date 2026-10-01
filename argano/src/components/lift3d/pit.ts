// The fittings of the shaft: in the pit the access ladder by the lowest landing, the stop switch within reach of
// that landing, the pit lamp and the perforated screen in front of the counterweight's run (0.3 m to 2.5 m over the
// pit floor); along the shaft the lighting, one fitting a floor and one under the ceiling, on their conduit. Plan
// and heights in millimetres, into the shaft's batch. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import type { Layout } from '@/shaft';
import type { Section } from '@/shaft/section';
import { onWall, type Batch } from './geom';
import { freeSides } from './governor';
import type { LiftMaterials } from './materials';

const LADDER_W = 400, RUNG = 280;

export function buildPit(L: Layout, S: Section, M: LiftMaterials, B: Batch): void {
  const { W, D } = L.inputs, c = L.car, zBot = S.pitFloor, z0 = S.levels[0] ?? 0, free = freeSides(L);
  // the cameras look in from the right: the fittings go on the left wall when it is free, the governor on the right
  const first = free[0], lamps = free[0];

  // ladder on a free side wall by the front corner, in the gap beside the car, up to 1.1 m over the lowest landing
  if (first) {
    const gap = first === 'left' ? c.x : W - (c.x + c.w), u0 = c.y + 20, u1 = u0 + LADDER_W;
    if (gap >= 120 && u1 < D - 100) {
      const vr = Math.min(gap - 25, 170), top = z0 + 1100;
      for (const u of [u0, u1]) {
        B.wallBox(first, W, D, u - 6, u + 6, vr - 30, vr + 20, zBot, top, M.galv);
        for (let z = zBot + 400; z < top - 200; z += 1200) B.wallBox(first, W, D, u - 25, u + 25, 0, vr - 30, z, z + 50, M.galv);
      }
      for (let z = zBot + 300; z < top - 50; z += RUNG) {
        const [ax, ay] = onWall(first, W, D, u0, vr), [bx, by] = onWall(first, W, D, u1, vr);
        B.rod([ax, ay, z], [bx, by, z], 12, M.galv, 10);
      }
      // pit lamp past the ladder
      B.wallBox(first, W, D, u1 + 420, u1 + 600, 0, 60, zBot + 1700, zBot + 1790, M.galv);
      B.wallBox(first, W, D, u1 + 430, u1 + 590, 60, 63, zBot + 1710, zBot + 1780, M.carLight);
    }
  }

  // stop switch on the front wall beside the lowest landing's frame, within reach from the landing and the pit
  const front = L.doors.find((d) => d.wall === 'front');
  if (front && front.frame0 > 140) {
    const u = front.frame0 - 75;
    B.wallBox('front', W, D, u - 45, u + 45, 0, 55, z0 - 330, z0 - 190, M.base);
    const [x, y] = onWall('front', W, D, u, 55);
    B.rod([x, y, z0 - 260], [x, y + 22, z0 - 260], 22, M.red, 18);
  }

  // screen in front of the counterweight's run, on the side toward the car, on two angle posts
  const cw = L.cw, alongX = cw.w >= cw.h, zs0 = zBot + 300, zs1 = zBot + 2500;
  if (alongX) {
    const y = cw.y + cw.h / 2 < c.y + c.h / 2 ? cw.y + cw.h + 22 : cw.y - 22, x0 = cw.x - 70, x1 = cw.x + cw.w + 70;
    B.box(x0, y - 1, zs0, x1, y + 1, zs1, M.screen);
    for (const x of [x0, x1]) B.box(x - 20, y - 20, zBot, x + 20, y + 20, zs1, M.galv);
  } else {
    const x = cw.x + cw.w / 2 < c.x + c.w / 2 ? cw.x + cw.w + 22 : cw.x - 22, y0 = cw.y - 70, y1 = cw.y + cw.h + 70;
    B.box(x - 1, y0, zs0, x + 1, y1, zs1, M.screen);
    for (const y of [y0, y1]) B.box(x - 20, y - 20, zBot, x + 20, y + 20, zs1, M.galv);
  }

  // shaft lighting on that wall by the back corner: a fitting a floor, one under the ceiling
  if (lamps) {
    const u = D - 130, zTop = S.ceiling - 500;
    const [cx, cy] = onWall(lamps, W, D, u - 60, 25);
    B.rod([cx, cy, zBot + 1000], [cx, cy, S.ceiling], 10, M.galv, 8);
    for (const z of [...S.levels.map((l) => l + 1500), zTop]) {
      if (z + 600 > S.ceiling - 80) continue;
      B.wallBox(lamps, W, D, u - 35, u + 35, 0, 50, z, z + 600, M.galv);
      B.wallBox(lamps, W, D, u - 22, u + 22, 50, 53, z + 20, z + 580, M.carLight);
    }
  }
}
