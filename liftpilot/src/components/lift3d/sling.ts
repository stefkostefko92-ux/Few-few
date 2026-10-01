// The sling of the car (arcata) from its design: central, two uprights of back-to-back channels on the side walls
// joined by the crosshead and the safety plank; or cantilever (a zaino), on the wall opposite a side entrance, the
// car carried on arms. On it the sliding guide shoes round the blades of the rails (oil cups on the top ones), the
// progressive safety gear at the foot of each upright with its pull rod, the rope hitch of a 1:1 roping (sockets on
// the crosshead, springs under it) or the cheeks of the car pulley of a 2:1, and the buffer plates under the car.
// Built in plan and heights from the car floor (millimetres) into the car's batch. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { RAILS, type Layout, type Rail } from '@/shaft';
import { P, type Batch } from './geom';
import type { GovernorSpot } from './governor';
import type { LiftMaterials } from './materials';

/** Where the ropes end on the car: the sockets of a 1:1 roping (plan positions), or the car pulley of a 2:1. */
export type Hitch =
  | { kind: 'ropes'; at: readonly (readonly [number, number])[] }
  | { kind: 'pulley'; x: number; y: number; across: readonly [number, number]; r: number; width: number };

/** A helical spring of height h standing on y = 0 at the origin, coil radius r and wire w [mm], as geometry [m]. */
export function coil(r: number, w: number, h: number, turns: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [], n = Math.round(turns * 16);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * turns * Math.PI * 2;
    pts.push(new THREE.Vector3((Math.cos(a) * r) / 1000, (w + (i / n) * (h - 2 * w)) / 1000, (Math.sin(a) * r) / 1000));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, w / 1000, 8);
}

/** A rail's own frame: a along the blade from its tip (toward the guided part positive), b across it. */
function railFrame(r: Rail) {
  const toCar = r.dir === 'right' || r.dir === 'back' ? 1 : -1, alongX = r.dir === 'right' || r.dir === 'left';
  const a = alongX ? r.x : r.y, b = alongX ? r.y : r.x;
  return {
    box(B: Batch, a0: number, a1: number, b0: number, b1: number, z0: number, z1: number, m: THREE.Material): void {
      const [p0, p1] = [a + toCar * a0, a + toCar * a1];
      if (alongX) B.box(p0, b + b0, z0, p1, b + b1, z1, m);
      else B.box(b + b0, p0, z0, b + b1, p1, z1, m);
    },
    point: (da: number, db: number, z: number): readonly [number, number, number] => (alongX ? [a + toCar * da, b + db, z] : [b + db, a + toCar * da, z]),
  };
}

/** A sliding guide shoe round the blade (thickness k) of a rail at height z: cheeks with their liners, the back, and an
 *  oil cup on a top shoe. Heights in the guided part's own frame. */
export function guideShoe(B: Batch, M: LiftMaterials, r: Rail, k: number, h: number, z: number, oil: boolean): void {
  const { box } = railFrame(r), reach = Math.min(40, h - 18); // the jaws stay clear of the clips on the rail's foot
  for (const s of [-1, 1]) {
    const [c0, c1] = s > 0 ? [k / 2 + 3, 33] : [-33, -k / 2 - 3], [l0, l1] = s > 0 ? [k / 2 + 0.5, k / 2 + 3] : [-k / 2 - 3, -k / 2 - 0.5];
    box(B, -reach, 12, c0, c1, z, z + 110, M.galv);
    box(B, 2 - reach, 10, l0, l1, z + 4, z + 106, M.rubber);
  }
  box(B, 12, 24, -33, 33, z, z + 110, M.galv);
  if (!oil) return;
  box(B, 10 - reach, 10, -22, 22, z + 110, z + 182, M.oil);
  box(B, 8 - reach, 12, -24, 24, z + 182, z + 190, M.glass);
}

export function buildSling(L: Layout, M: LiftMaterials, B: Batch, hitch: Hitch | null, gov: GovernorSpot | null): readonly (readonly [number, number])[] {
  const I = L.inputs, V = I.vertical, c = L.car, f = L.frame, carRails = L.rails.filter((r) => r.kind === 'car');
  const { k, h } = RAILS[I.carRail], zTop = V.frameTop, zLow = -V.frameBelow;

  const upright = (r: Rail): void => {
    const F = railFrame(r), point = F.point;
    const box = (a0: number, a1: number, b0: number, b1: number, z0: number, z1: number, m: THREE.Material): void => F.box(B, a0, a1, b0, b1, z0, z1, m);
    // two channels, webs facing the blade, flanges outward
    for (const s of [-1, 1]) {
      const lo = (x: number, y: number): readonly [number, number] => (s > 0 ? [x, y] : [-y, -x]);
      const [w0, w1] = lo(35, 41), [f0, f1] = lo(35, 85);
      box(-50, 25, w0, w1, zLow, zTop, M.steel);
      box(-50, -42, f0, f1, zLow, zTop, M.steel);
      box(17, 25, f0, f1, zLow, zTop, M.steel);
    }
    // sliding guide shoes, oil cups on the top ones
    guideShoe(B, M, r, k, h, zLow + 60, false);
    guideShoe(B, M, r, k, h, zTop - 130, true);
    // progressive safety gear above the lower shoe, its pull rod up the channel
    box(-52, 28, -33, 33, -150, -15, M.frame);
    box(-58, -52, -40, 40, -140, -25, M.galv);
    B.rod(point(-12, 62, -70), point(-12, 62, zTop - 220), 7, M.alu, 8);
  };
  carRails.forEach(upright);

  // a channel along x or y: web at the outer side (s) of a beam of depth d, flanges 10 thick
  const beam = (alongX: boolean, p0: number, p1: number, mid: number, z0: number, z1: number): void => {
    for (const s of [-1, 1]) {
      const q = (q0: number, q1: number, za: number, zb: number): void => {
        const [m0, m1] = [mid + s * q0, mid + s * q1].sort((x, y) => x - y);
        if (alongX) B.box(p0, m0, za, p1, m1, zb, M.steel);
        else B.box(m0, p0, za, m1, p1, zb, M.steel);
      };
      q(10, 16, z0, z1);
      q(10, 85, z0, z0 + 10);
      q(10, 85, z1 - 10, z1);
    }
  };
  if (f.kind === 'central') {
    const xl = Math.min(...carRails.map((r) => r.x)) - 50, xr = Math.max(...carRails.map((r) => r.x)) + 50;
    beam(true, xl, xr, f.axis, zTop - 180, zTop);
    beam(true, xl, xr, f.axis, zLow, zLow + 160);
    // the two safety gears move together: the synchronising bar under the platform
    const ra = carRails.map((r) => r.x).sort((x, y) => x - y);
    if (ra.length === 2) B.rod([ra[0] + 30, f.axis + 62, -125], [ra[1] - 30, f.axis + 62, -125], 9, M.alu, 8);
  } else {
    const ys = carRails.map((r) => r.y), y0 = Math.min(...ys) - 50, y1 = Math.max(...ys) + 50, x = f.axis, far = x < c.x + c.w / 2 ? c.x + c.w : c.x;
    beam(false, y0, y1, x, zTop - 180, zTop);
    beam(false, y0, y1, x, zLow, zLow + 160);
    // the arms that carry the car off the rails
    for (const yr of ys) B.box(Math.min(x, far), yr - 45, -V.platform - 150, Math.max(x, far), yr + 45, -V.platform, M.steel);
    // the ropes come down over the car: a hitch beam from the crosshead across the roof carries them
    const hy = hitch ? (hitch.kind === 'ropes' ? hitch.at.reduce((t, p) => t + p[1], 0) / hitch.at.length : hitch.y) : null;
    if (hy !== null) beam(true, Math.min(x, far), Math.max(x, far), hy, zTop - 180, zTop);
  }

  // the safety gear's lever out to the governor rope, clamped on it
  const govRail = gov ? carRails.find((r) => (gov.side === 'left' ? r.dir === 'right' : r.dir === 'left')) : undefined;
  if (gov && govRail) {
    B.box(gov.x - 12, govRail.y + 30, -100, gov.x + 12, gov.y1 + 25, -80, M.galv);
    B.box(gov.x - 18, gov.y1 - 18, -125, gov.x + 18, gov.y1 + 18, -55, M.frame);
  }

  // the rope hitch: wedge sockets on a plate over the crosshead, rods through it, springs and nuts under it
  if (hitch?.kind === 'ropes') {
    const xs = hitch.at.map((p) => p[0]), ys = hitch.at.map((p) => p[1]);
    B.box(Math.min(...xs) - 40, Math.min(...ys) - 40, zTop, Math.max(...xs) + 40, Math.max(...ys) + 40, zTop + 14, M.steel);
    const spring = coil(22, 4.5, 120, 5);
    for (const [x, y] of hitch.at) {
      B.box(x - 13, y - 9, zTop + 14, x + 13, y + 9, zTop + 150, M.galv);
      B.rod([x, y, zTop + 14], [x, y, zTop - 340], 8, M.alu, 8);
      const base = P(x, y, zTop - 180 - 125);
      B.add(spring.clone().translate(base.x, base.y, base.z), M.spring);
      B.box(x - 16, y - 16, zTop - 335, x + 16, y + 16, zTop - 305, M.steel);
    }
    spring.dispose();
  } else if (hitch?.kind === 'pulley') {
    // the cheeks that carry the car pulley's axle over the crosshead
    const [ax, ay] = hitch.across, zAxle = zTop + hitch.r + 30;
    for (const s of [-1, 1]) {
      const o = s * (hitch.width / 2 + 14), x = hitch.x + ax * o, y = hitch.y + ay * o;
      const [dx, dy] = [Math.abs(ay) * hitch.r * 0.55 + Math.abs(ax) * 6, Math.abs(ax) * hitch.r * 0.55 + Math.abs(ay) * 6];
      B.box(x - dx, y - dy, zTop, x + dx, y + dy, zAxle + 70, M.galv);
    }
    const o = hitch.width / 2 + 30;
    B.rod([hitch.x - ax * o, hitch.y - ay * o, zAxle], [hitch.x + ax * o, hitch.y + ay * o, zAxle], 22, M.alu, 16);
  }

  // buffer plates under the car, where the buffers stand
  const n = Math.max(1, V.carBuffers), yb = f.kind === 'central' ? f.axis : c.y + c.h / 2;
  const spots = Array.from({ length: n }, (_, i) => [c.x + (c.w * (i + 1)) / (n + 1), yb] as const);
  for (const [bx, by] of spots) B.box(bx - 90, by - 90, zLow - 12, bx + 90, by + 90, zLow, M.steel);
  return spots;
}
