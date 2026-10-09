// The landing door of an entrance where the plan sets it apart from the car door (PlanFix.landA, landB): along its
// wall, the same at every floor. What belongs to the landing goes with it (the opening in the wall and its portal, the
// linings, the sill on Panev's brackets, the suspension and the panels, the call station); what belongs to the car
// stays with the car door (its door, the operator, the coupler, whose vanes the lock's rollers keep meeting). In the
// plans the axes of both doors and the distance between them (registry porte.disassamento). Pure.
import { chain, edit as E, line, type Entity } from '../drawing';
import { KV_VERT } from './norme-vert';
import { onWall } from './plan-walls';
import { toeOf } from './toe';
import type { DoorLayout, Layout, ShaftInputs, Wall } from './types';

/** The landing door of an entrance as a door of its own: its clear opening where the landing door is (the drawings and
 *  the 3D build a landing door from it as they build any door). */
export const landingOf = (d: DoorLayout): DoorLayout => (d.l0 === d.u0 ? d : { ...d, u0: d.l0, u1: d.l1 });

/** What a landing entrance puts in front of its wall on the shaft's side, along the wall (its u) and as high as it reaches
 *  over and under the landing level [mm], I.landingDepth from the wall's face: over the landing its frame with the panels
 *  stacked (`over`, up to the door's height `up`); under it the sill on its brackets past the landing door's opening and
 *  the plate under it (`under`: toe.ts, the car's entrance and KV_VERT.toeSide each side), down to the plate's bevel at
 *  the wall (`down`). The pit's ladder and control box (pit-kit.ts) and the counterweight's screen (screen.ts) keep
 *  clear of it. */
export function landingZone(I: ShaftInputs, d: DoorLayout): { over: readonly [number, number]; up: number; under: readonly [number, number]; down: number } {
  const l = landingOf(d), t = toeOf(I), side = KV_VERT.toeSide;
  return { over: [d.frame0, d.frame1], up: I.doorHeight, under: [Math.min(l.u0 - 60, d.u0 - side), Math.max(l.u1 + 60, d.u1 + side)], down: t.h + t.bevel };
}

/** How far the landing door stands from the car door along the wall [mm] (+: toward higher u). */
export const landingShift = (d: DoorLayout): number => d.l0 - d.u0;

/** The input that places the landing door of an entrance along its wall: where its clear opening starts. */
export const landingKey = (d: DoorLayout): string => `plan.land${d.side}`;

/** The car's inner face from the inner face of a wall [mm]. */
function carInside(L: Layout, w: Wall): number {
  const c = L.carInner, { W, D } = L.inputs;
  return { front: c.y, rear: D - (c.y + c.h), left: c.x, right: W - (c.x + c.w) }[w];
}

/** The axes of a landing door set apart and of its car door: from the landing through the wall into the car. */
export function shiftAxes(L: Layout, open: readonly DoorLayout[]): Entity[] {
  return open.filter((d) => landingShift(d) !== 0).flatMap((d) => {
    const v0 = -L.inputs.wall - 150, v1 = carInside(L, d.wall) + 320;
    return [(d.u0 + d.u1) / 2, (d.l0 + d.l1) / 2].map((u) => line(onWall(L, d.wall, u, v0), onWall(L, d.wall, u, v1), 'axis'));
  });
}

/** Inside the car, the distance between the two axes: its new length moves the landing door, the car door stays. */
export function shiftDims(L: Layout, open: readonly DoorLayout[]): Entity[] {
  return open.filter((d) => landingShift(d) !== 0).map((d) => {
    const s = landingShift(d), mc = (d.u0 + d.u1) / 2, along = d.wall === 'front' || d.wall === 'rear';
    const p = onWall(L, d.wall, mc, carInside(L, d.wall) + 260);
    return chain({ dir: along ? 'x' : 'y', pts: s > 0 ? [mc, mc + s] : [mc + s, mc], at: along ? p[1] : p[0], text: ['Disassamento {v}'],
      edit: [E(landingKey(d), d.u0, s > 0 ? 1 : -1)] });
  });
}
