// The fixings of a guide rail, as the makers supply them. At a joint the fishplate of the rail's size behind the two
// feet (ISO 7465 tables, src/shaft/rails.ts), its eight bolts through plate and feet: heads on the plate, nuts on the
// feet's sloping faces. On a bracket the plate behind the foot and two forged clips over the foot's edges (the maker's
// size for the rail, from M10 22 × 32 to M16 34 × 50), their shanks through the plate, the nuts behind it; out to the
// wall a one-piece bracket when the wall is near, else the two-piece kind: an angle on the rail's plate and one on the
// wall, their legs side by side and clamped by four M12 bolts in slots, so the rail can be lined up and the building
// can settle. Millimetres in the rail's frame — a along the blade from the back of the foot, c across it, z up —
// into a batch. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { FISHPLATES, RAILS, railClip, type Rail, type RailType } from '@/shaft';
import { P, type Batch } from './geom';
import { N1, fastener, frameAt, type Fastener } from './hardware';
import type { LiftMaterials } from './materials';

/** The rail's frame: plan point of (a, c), the world's unit vectors along +a and +c. */
export interface RailFrame {
  plan(a: number, c: number): readonly [number, number];
  ea: THREE.Vector3;
  ec: THREE.Vector3;
}

const DIRS: Record<Rail['dir'], readonly [number, number]> = { right: [1, 0], left: [-1, 0], back: [0, 1], front: [0, -1] };

/** The frame of a rail of blade height h: a along the blade from the back of the foot, c across it. */
export function railFrameOf(r: Rail, h: number): RailFrame & { dx: number; dy: number } {
  const [dx, dy] = DIRS[r.dir], fx = r.x - dx * h, fy = r.y - dy * h;
  return {
    dx, dy, plan: (a, c) => [fx + dx * a - dy * c, fy + dy * a + dx * c],
    ea: P(dx, dy, 0).normalize(), ec: P(-dy, dx, 0).normalize(),
  };
}

// the bracket's plate behind the foot, its flanges, the wall plate [mm]; a two-piece bracket past this reach
const PLATE = 10, FLANGE = 8, WALL_PLATE = 12, ONE_PIECE = 150;

/** The foot's front face at c from the axis: from its thickness at the root (tf) down to the edge's (te). */
export function footFace(type: RailType, c: number): number {
  const { b, h, k } = RAILS[type], te = Math.max(5, 0.1 * h), tf = Math.max(8, 0.16 * h), fr = Math.min(6, 0.6 * k);
  const t = Math.min(1, Math.max(0, (b / 2 - Math.abs(c)) / (b / 2 - k / 2 - fr)));
  return te + (tf - te) * t;
}

/** Placing fasteners in the rail's frame: at (a, c, z), out along ±a or ±c, scaled to their size. */
function fixer(B: Batch, M: LiftMaterials, F: RailFrame) {
  const up = new THREE.Vector3(0, 1, 0);
  return (kind: Fastener, a: number, c: number, z: number, out: THREE.Vector3, x: THREE.Vector3, scale: readonly [number, number, number]): void => {
    const [px, py] = F.plan(a, c);
    fastener(B, kind, M.galv, frameAt(P(px, py, z), out, x.lengthSq() > 0 ? x : up).multiply(new THREE.Matrix4().makeScale(...scale)));
  };
}

/** The fishplate at the joint z behind the feet of the two lengths, with its eight bolts. */
export function fishplate(B: Batch, M: LiftMaterials, F: RailFrame, type: RailType, z: number, box: (a0: number, a1: number, c0: number, c1: number, z0: number, z1: number) => void): void {
  const fp = FISHPLATES[type], w = Math.max(RAILS[type].b, 50), fix = fixer(B, M, F), k = fp.bolt / 10, up = new THREE.Vector3(0, 1, 0);
  box(-fp.t, 0, -w / 2, w / 2, z - fp.l / 2, z + fp.l / 2);
  for (const r of fp.rows) for (const dz of [-r, r]) for (const c of [-fp.across / 2, fp.across / 2]) {
    fix('head', -fp.t, c, z + dz, F.ea.clone().negate(), up, [k, k, k]);
    fix('nut', footFace(type, c), c, z + dz, F.ea, up, [k, k, k]);
  }
}

/** The plate behind the foot at the bracket's height z (its middle) and the two clips over the foot's edges; the
 *  plate's half width across the rail. */
export function clippedPlate(B: Batch, M: LiftMaterials, F: RailFrame, type: RailType, z: number, box: (a0: number, a1: number, c0: number, c1: number, z0: number, z1: number) => void): number {
  const { b, h } = RAILS[type], half = b / 2, te = Math.max(5, 0.1 * h), fix = fixer(B, M, F), clip = railClip(type);
  // the clip of Panev's drawings (N1) brought to the size: its nose down on the foot's edge
  const sx = clip.length / (N1.nose + N1.heel), sy = te / (N1.foot + N1.relief), sz = clip.width / N1.width, kb = clip.bolt / 10;
  const shank = half + clip.shank, outer = half + clip.reach;
  box(-PLATE, 0, -outer, outer, z - 75, z + 75);
  for (const s of [-1, 1] as const) {
    const away = F.ec.clone().multiplyScalar(s);
    fix('clip', 0, s * shank, z, F.ea, away, [sx, sy, sz]);
    fix('nut', -PLATE, s * shank, z, F.ea.clone().negate(), away, [kb, kb, kb]);
  }
  return outer;
}

/** The bracket from the plate behind the foot out to the wall, in its own frame: s along e from the start s0 to the
 *  wall `reach` further, q across it along n from the line q0 (e, n: units in the (a, c) plane). One piece up to
 *  150 mm: a flange along the bottom and a web up one side, welded to the wall plate. Past it two angles, their webs
 *  back to back over 80 mm in the middle and clamped there by four M12 bolts, their flanges turned away from each
 *  other; the wall angle on the wall plate. The wall plate's two anchors. */
export function wallArm(B: Batch, M: LiftMaterials, F: RailFrame, z: number, e: readonly [number, number], n: readonly [number, number], s0: number, reach: number, q0: number,
  box: (a0: number, a1: number, c0: number, c1: number, z0: number, z1: number) => void): void {
  const fix = fixer(B, M, F);
  const at = (s: number, q: number): readonly [number, number] => [e[0] * s + n[0] * (q0 + q), e[1] * s + n[1] * (q0 + q)];
  const piece = (s1: number, s2: number, q1: number, q2: number, z1: number, z2: number): void => {
    const [p, r] = [at(s1, q1), at(s2, q2)];
    box(Math.min(p[0], r[0]), Math.max(p[0], r[0]), Math.min(p[1], r[1]), Math.max(p[1], r[1]), z1, z2);
  };
  const end = s0 + reach - WALL_PLATE, toWall = new THREE.Vector3().addScaledVector(F.ea, e[0]).addScaledVector(F.ec, e[1]);
  const across = new THREE.Vector3().addScaledVector(F.ea, n[0]).addScaledVector(F.ec, n[1]), m12: readonly [number, number, number] = [1.2, 1.2, 1.2];
  let plate: readonly [number, number] = [-80, 80];
  if (reach <= ONE_PIECE) {
    piece(s0, end, -45, 45, z, z + FLANGE);
    piece(s0, end, 37, 45, z, z + 100);
  } else {
    const mid = s0 + reach / 2;
    piece(s0, mid + 40, -45, 37, z, z + FLANGE);
    piece(s0, mid + 40, 29, 37, z, z + 100);
    piece(mid - 40, end, 37, 121, z, z + FLANGE);
    piece(mid - 40, end, 37, 45, z, z + 100);
    for (const s of [mid - 22, mid + 22]) for (const dz of [32, 74]) {
      const [a, c] = at(s, 45), [a2, c2] = at(s, 29);
      fix('head', a, c, z + dz, across, toWall, m12);
      fix('nut', a2, c2, z + dz, across.clone().negate(), toWall, m12);
    }
    plate = [-45, 121];
  }
  piece(end, end + WALL_PLATE, plate[0], plate[1], z - 30, z + 170);
  const qc = (plate[0] + plate[1]) / 2;
  for (const q of [qc - 56, qc + 56]) {
    const [a, c] = at(end, q);
    fix('anchor', a, c, z + 120, toWall.clone().negate(), across, m12);
  }
}
