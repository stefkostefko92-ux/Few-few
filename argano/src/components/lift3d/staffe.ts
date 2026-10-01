// Panev's brackets in place, as the catalogue pairs and adjusts them. Under every landing sill the landing-door
// brackets: B anchored to the wall below the opening, A bolted to its rib through the joint and the lock, its platform
// under the sill, cut to the sill's depth. On a counterweight rail every 2.5 m: the SU or SD support anchored to the
// wall, the SG guide bracket bolted on its arm and the rail clamped to the SG's flange by two N1 clips whose shanks
// stand in the flange's slots. The support is the shortest whose printed range takes the rail's distance from the
// wall and whose flange fits behind the rail. Millimetres in an assembly frame (x along the wall, y up, z into the
// shaft), placed in metres. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import type { Rail } from '@/shaft';
import { onWall, type Batch } from './geom';
import { N1, fastener, frameAt, place, type Fastener } from './hardware';
import type { LiftMaterials, Side } from './materials';
import type { Frame } from './sheet/face';
import type { Sheet } from './sheet/part';
import { A_LEGS, B_SECTIONS, PLATES, SG_FLANGE, SG_T, STATIONS, SUPPORT_H, bracketB, flangeRuns, guideSG, plateA, supportArm, type ArmKind, type SgLength } from './sheet/panev';

const WALL: Frame = { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };
const PLATFORM: Frame = { o: [0, 0, 0], u: [0, 0, 1], v: [1, 0, 0], n: [0, 1, 0] };
const ALONG_ARM: Frame = { o: [0, 0, 0], u: [0, 0, 1], v: [-1, 0, 0], n: [0, 1, 0] };

const cache = new Map<string, readonly [THREE.BufferGeometry, THREE.BufferGeometry]>();
/** A part's coated and cut geometries in its assembly pose [m], built once. */
function part(key: string, make: () => Sheet, frame: Frame): readonly [THREE.BufferGeometry, THREE.BufferGeometry] {
  let g = cache.get(key);
  if (!g) {
    g = make().build(frame).geometries();
    cache.set(key, g);
  }
  return g;
}

/** The assembly frame on a wall: origin at (u, z) on its face [mm], x along +u (−u when mirrored), z into the shaft. */
function wallFrame(wall: Side, W: number, D: number, u: number, z: number, mirror: boolean): THREE.Matrix4 {
  const [ox, oy] = onWall(wall, W, D, u, 0), [ux, uy] = onWall(wall, W, D, u + 1, 0), [vx, vy] = onWall(wall, W, D, u, 1);
  const ex = new THREE.Vector3(ux - ox, 0, -(uy - oy)).multiplyScalar(mirror ? -1 : 1), ez = new THREE.Vector3(vx - ox, 0, -(vy - oy));
  return new THREE.Matrix4().makeBasis(ex, new THREE.Vector3(0, 1, 0), ez).setPosition(ox / 1000, z / 1000, -oy / 1000);
}

/** Things placed in one assembly frame. */
function assembly(B: Batch, M: LiftMaterials, frame: THREE.Matrix4) {
  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z).multiplyScalar(0.001).applyMatrix4(frame);
  const axis = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z).transformDirection(frame);
  return {
    part(geos: readonly [THREE.BufferGeometry, THREE.BufferGeometry], x = 0, y = 0, z = 0): void {
      const m = frame.clone().multiply(new THREE.Matrix4().makeTranslation(x / 1000, y / 1000, z / 1000));
      place(B, geos[0], M.zinc, m);
      place(B, geos[1], M.cut, m);
    },
    /** A fastener at (x, y, z), its +Y along `out`, its +X along `side` (assembly axes). */
    fix(kind: Fastener, at: readonly [number, number, number], out: readonly [number, number, number], side: readonly [number, number, number] = [0, 1, 0]): void {
      fastener(B, kind, M.zinc, frameAt(v(...at), axis(...out), axis(...side)));
    },
  };
}

// ---- landing doors

/** A + B under the sill of a landing door at level z: section 65, B 320 (the catalogue's A 65 170 7 + B 65 320),
 *  A cut to the sill's `depth`; sill on the platform at z − sillH; brackets along it from u0 to u1. */
export function doorBrackets(B: Batch, M: LiftMaterials, wall: Side, W: number, D: number, u0: number, u1: number, z: number, depth: number, sillH: number): void {
  const s = B_SECTIONS[65], g = A_LEGS[65], L = 320;
  const [hx, hy] = g.holes[0], [lx, ly] = g.holes[1], pivotY = L - s.pivot, aY = pivotY - (g.t - hy), zA = s.col - hx;
  const cut = Math.round(depth - zA - 4), base = z - sillH - (aY + g.t);
  const geoB = part(`B65-${L}`, () => bracketB(65, L), WALL), geoA = part(`A65-${cut}`, () => plateA(65, 170, 75, 'cross', 7, cut), PLATFORM);
  const n = Math.max(3, Math.ceil((u1 - u0) / 400) + 1);
  for (let i = 0; i < n; i++) {
    // the right-hand end's bracket is the mirror (SX), its rib facing out like the left one's
    const uc = u0 + ((u1 - u0) * i) / (n - 1), mirror = i === n - 1, x0 = mirror ? uc + s.face / 2 : uc - s.face / 2;
    const a = assembly(B, M, wallFrame(wall, W, D, x0, base, mirror));
    a.part(geoB);
    a.part(geoA, -g.t, aY, zA);
    // the joint and the lock: bolt heads on A's rib, nuts on B's
    for (const [y, zz] of [[pivotY, s.col], [pivotY + hy - ly, s.col + lx - hx]]) {
      a.fix('head', [-g.t, y, zz], [-1, 0, 0]);
      a.fix('nut', [s.t, y, zz], [1, 0, 0]);
    }
    // the anchors in the fixing face's slots
    for (const y of [L - 95, 70]) a.fix('anchor', [s.face / 2, y, s.t], [0, 0, 1]);
  }
}

// ---- counterweight rails

/** Adjustment range printed on each support's page (pp. 20-38), and the SG it is paired with. */
const SUPPORTS: readonly { kind: ArmKind; Lp: 160 | 180 | 200; range: readonly [number, number]; sg: SgLength }[] = [
  { kind: 'SU', Lp: 160, range: [45, 155], sg: 150 }, { kind: 'SU', Lp: 180, range: [45, 195], sg: 170 }, { kind: 'SU', Lp: 200, range: [45, 215], sg: 190 },
  { kind: 'SD220', Lp: 160, range: [50, 155], sg: 150 }, { kind: 'SD220', Lp: 180, range: [45, 195], sg: 170 }, { kind: 'SD220', Lp: 200, range: [45, 215], sg: 190 },
  { kind: 'SD150', Lp: 160, range: [45, 155], sg: 150 }, { kind: 'SD150', Lp: 180, range: [45, 195], sg: 170 }, { kind: 'SD150', Lp: 200, range: [45, 215], sg: 190 },
];

/** Where the rail sits on an SG `l` long: c from its start, the place nearest `want` in [lo, hi] where both clips'
 *  shanks stand in the flange's slots (5 mm in from their ends) and their heels stay on the SG, each clip as near
 *  35 mm from the rail's centre as its slot allows (the foot `half` wide each side). */
function seatRail(l: number, want: number, lo: number, hi: number, half: number): { c: number; seats: [number, number][] } {
  const runs = flangeRuns(l), min = half - N1.pad + 0.5, max = half + N1.nose - 4;
  const miss = (s: number, side: number): number => {
    const heel = s + side * N1.heel;
    return Math.min(...runs.map(([a, b]) => Math.max(a + 5 - s, s - (b - 5), 0))) + Math.max(0, -heel, heel - l);
  };
  const clipAt = (c: number, side: number): { d: number; m: number; score: number } => {
    let pick = { d: min, m: Infinity, score: Infinity };
    for (let d = min; d <= max + 1e-9; d += 0.5) {
      const m = miss(c + side * d, side), score = m * 1000 + Math.abs(d - 35);
      if (score < pick.score) pick = { d, m, score };
    }
    return pick;
  };
  let best = { c: 0, seats: [[-1, min], [1, min]] as [number, number][], score: Infinity };
  for (let c = Math.max(0, lo); c <= Math.min(l, hi) + 1e-9; c += 0.5) {
    const [a, b] = [clipAt(c, -1), clipAt(c, 1)], score = (a.m + b.m) * 1000 + Math.abs(c - want);
    if (score < best.score) best = { c, seats: [[-1, a.d], [1, b.d]], score };
  }
  return best;
}

type Support = (typeof SUPPORTS)[number];

/** The support for a rail `reach` mm from the wall, with `back` mm free on the wall behind its foot and `ahead` in
 *  front of it (an SD's flange runs on past the arm), or null. */
function supportFor(reach: number, back: number, ahead: number): Support | null {
  return SUPPORTS.find((s) => reach >= s.range[0] && reach <= s.range[1] && PLATES[s.kind].arm[1] + 10 <= back && PLATES[s.kind].flange - PLATES[s.kind].arm[1] + 10 <= ahead) ?? null;
}

/** Where a counterweight rail's Panev support goes: the rail's blade must run along the wall it is fixed to (the
 *  catalogue's supports carry the rail's foot square to the wall). `h` the blade's height, null when none fits. */
export function cwSupport(r: Rail, h: number, W: number, D: number): { wall: Side; foot: number; reach: number; mirror: boolean; sup: Support } | null {
  const across = r.bracketAxis === 'y', along = across ? r.dir === 'left' || r.dir === 'right' : r.dir === 'back' || r.dir === 'front';
  const far = across ? D : W;
  if (!along || (Math.abs(r.bracketTo) > 1 && Math.abs(r.bracketTo - far) > 1)) return null;
  const wall: Side = across ? (r.bracketTo > 1 ? 'rear' : 'front') : r.bracketTo > 1 ? 'right' : 'left';
  const sign = r.dir === 'right' || r.dir === 'back' ? 1 : -1, len = across ? W : D;
  const foot = (across ? r.x : r.y) - sign * h, reach = Math.abs(r.bracketTo - (across ? r.y : r.x));
  const back = sign > 0 ? foot : len - foot, sup = supportFor(reach, back, len - back);
  return sup ? { wall, foot, reach, mirror: sign < 0, sup } : null;
}

/** A counterweight rail's bracket at height z: the rail's foot back at u = foot on the wall, its axis `reach` from
 *  it, the blade toward +u (`mirror`: toward −u), the foot `half` wide each side of the axis. */
export function railSupport(B: Batch, M: LiftMaterials, wall: Side, W: number, D: number, foot: number, reach: number, z: number, mirror: boolean, half: number, sup: Support): void {
  const k = PLATES[sup.kind], xf = k.arm[1], a = assembly(B, M, wallFrame(wall, W, D, mirror ? foot + xf : foot - xf, z, mirror));
  a.part(part(`${sup.kind}-${sup.Lp}`, () => supportArm(sup.kind, sup.Lp), WALL));
  for (const [x0, x1] of k.slots) a.fix('anchor', [(x0 + x1) / 2, SUPPORT_H / 2, 5], [0, 0, 1]);
  // the SG along the arm, its flange at the arm's outer edge under the rail's foot, turned round when the rail is far out
  const l = sup.sg, far = reach > (sup.range[0] + sup.range[1]) / 2, { c, seats } = seatRail(l, far ? l : 0, 0, reach - 10, half), z0 = reach - c;
  a.part(part(`SG80-${l}`, () => guideSG(80, l), ALONG_ARM), xf, SUPPORT_H, z0);
  // its bolts through the stations over the arm's two slots, the nuts under the arm
  const xc = (k.arm[0] + k.arm[1]) / 2, mid = (sup.Lp + 15) / 2;
  for (const [s0, s1] of [[30, mid - 10], [mid + 10, sup.Lp - 15]]) {
    const at = STATIONS[l].map((s) => z0 + s).find((v) => v >= s0 && v <= s1);
    if (at === undefined) continue;
    a.fix('head', [xc, SUPPORT_H + SG_T, at], [0, 1, 0], [1, 0, 0]);
    a.fix('nut', [xc, SUPPORT_H - 5, at], [0, -1, 0], [1, 0, 0]);
  }
  // the clips over the foot's edges, their nuts behind the flange
  for (const [side, d] of seats) {
    const at = [xf, SUPPORT_H + SG_FLANGE / 2, reach + side * d] as const;
    a.fix('clip', at, [1, 0, 0], [0, 0, side]);
    a.fix('nut', [xf - SG_T, at[1], at[2]], [-1, 0, 0], [0, 0, side]);
  }
}
