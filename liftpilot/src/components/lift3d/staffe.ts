// Panev's brackets in place, as the catalogue pairs and adjusts them. Under every landing sill the landing-door
// brackets of the design's pair (src/shaft/staffe-porte.ts): B anchored to the wall below the opening, A bolted to its
// rib through the joint and the lock, its platform under the sill, cut to the sill's depth; over the door the same pair
// upside down, the suspension hanging from A. On a counterweight rail at
// each height of the bracket rule (src/shaft/brackets.ts), the bracket src/shaft/staffe-scelta.ts chooses: the SU or SD
// support anchored to the wall with the SG bolted on its arm, or the SC on the wall behind the rail's foot with the SG
// along it; the rail clamped to the SG's flange by two N1 clips whose shanks stand in the flange's slots. Millimetres
// in an assembly frame (x along the wall, y up, z into the shaft), placed in metres. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { seatRail, type Support } from '@/shaft/staffe';
import { SC_RUNS, scBoltRow } from '@/shaft/staffe-sc';
import { plateReach, type DoorPair } from '@/shaft/staffe-porte';
import type { SlideBracket } from '@/shaft/staffe-scelta';
import { onWall, type Batch } from './geom';
import { fastener, frameAt, place, type Fastener } from './hardware';
import type { LiftMaterials, Side } from './materials';
import type { Frame } from './sheet/face';
import type { Sheet } from './sheet/part';
import { A_LEGS, B_SECTIONS, PLATES, SG_FLANGE, SG_T, STATIONS, SUPPORT_H, bracketB, guideSG, plateA, supportArm, supportSliding } from './sheet/panev';

const WALL: Frame = { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };
const PLATFORM: Frame = { o: [0, 0, 0], u: [0, 0, 1], v: [1, 0, 0], n: [0, 1, 0] };
const ALONG_ARM: Frame = { o: [0, 0, 0], u: [0, 0, 1], v: [-1, 0, 0], n: [0, 1, 0] };
const ALONG_WALL: Frame = { o: [0, 0, 0], u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0] };

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

/** The assembly frame on a wall: origin at (u, z) on its face [mm] (`inset` behind it: the back of a niche), x along
 *  +u (−u when mirrored), z into the shaft. */
function wallFrame(wall: Side, W: number, D: number, u: number, z: number, mirror: boolean, inset = 0): THREE.Matrix4 {
  const [ox, oy] = onWall(wall, W, D, u, -inset), [ux, uy] = onWall(wall, W, D, u + 1, -inset), [vx, vy] = onWall(wall, W, D, u, 1 - inset);
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

const TURN = new THREE.Matrix4().makeRotationZ(Math.PI);

/** Pairs A + B at the along-wall positions `at`, A cut to the sill's `depth`, the face of its platform at the height
 *  `face`: under a landing's sill, the sill on it; or `over` a landing door upside down, B on the wall over the
 *  suspension that hangs from A. */
export function doorBrackets(B: Batch, M: LiftMaterials, wall: Side, W: number, D: number, at: readonly number[], face: number, depth: number, pair: DoorPair, over = false): void {
  const { a: pa, b: pb } = pair, sec = pa.section, s = B_SECTIONS[sec], g = A_LEGS[sec], L = pb.length;
  const [hx, hy] = g.holes[0], [lx, ly] = g.holes[1], pivotY = L - s.pivot, aY = pivotY - (g.t - hy), zA = s.col - hx;
  const { cut } = plateReach(pa, depth), base = over ? face + (aY + g.t) : face - (aY + g.t);
  const geoB = part(`B${sec}-${L}`, () => bracketB(sec, L), WALL), geoA = part(`${pa.code}-${cut}`, () => plateA(sec, pa.length, pa.width, pa.slots, pa.count, cut), PLATFORM);
  at.forEach((uc, i) => {
    // the bracket at the right-hand end is the mirror (SX), its rib facing out like the left one's; upside down, the
    // left-hand end's
    const mirror = over ? i === 0 : i === at.length - 1, x0 = mirror !== over ? uc + s.face / 2 : uc - s.face / 2;
    const frame = wallFrame(wall, W, D, x0, base, mirror), a = assembly(B, M, over ? frame.multiply(TURN) : frame);
    a.part(geoB);
    a.part(geoA, -g.t, aY, zA);
    // the joint and the lock: bolt heads on A's rib, nuts on B's
    for (const [y, zz] of [[pivotY, s.col], [pivotY + hy - ly, s.col + lx - hx]]) {
      a.fix('head', [-g.t, y, zz], [-1, 0, 0]);
      a.fix('nut', [s.t, y, zz], [1, 0, 0]);
    }
    // the anchors in the fixing face's slots
    for (const y of [L - 95, 70]) a.fix('anchor', [s.face / 2, y, s.t], [0, 0, 1]);
  });
}

// ---- counterweight rails

/** A counterweight rail's bracket at height z: the rail's foot back at u = foot on the wall, its axis `reach` from
 *  it, the blade toward +u (`mirror`: toward −u), the foot `half` wide each side of the axis. */
export function railSupport(B: Batch, M: LiftMaterials, wall: Side, W: number, D: number, foot: number, reach: number, z: number, mirror: boolean, half: number, sup: Support, inset = 0): void {
  const k = PLATES[sup.kind], xf = k.arm[1], a = assembly(B, M, wallFrame(wall, W, D, mirror ? foot + xf : foot - xf, z, mirror, inset));
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

/** An SC on the wall behind a counterweight rail's foot at height z, with its SG along the wall and the clips. */
export function railSliding(B: Batch, M: LiftMaterials, W: number, D: number, br: SlideBracket, z: number): void {
  const { sc, place: p, gap } = br, { w, l } = sc.sg, a = assembly(B, M, wallFrame(br.wall, W, D, p.s, z, false, br.inset));
  a.part(part(`SC${sc.W}-${sc.L}`, () => supportSliding(sc.W, sc.L), WALL));
  for (const [x0, x1] of SC_RUNS[sc.L].flange) a.fix('anchor', [(x0 + x1) / 2, SUPPORT_H / 2, 4], [0, 0, 1]);
  // the SG on the SC's plate along the wall, its flange under the rail's foot
  const x0 = p.a - p.s, st = STATIONS[l], row = scBoltRow(sc, gap);
  a.part(part(`SG${w}-${l}`, () => guideSG(w, l), ALONG_WALL), x0, SUPPORT_H, gap);
  // its two bolts through the stations into the SC's slots, the nuts under the plate
  for (const s of [st[1], st[st.length - 2]]) {
    a.fix('head', [x0 + s, SUPPORT_H + SG_T, row], [0, 1, 0], [1, 0, 0]);
    a.fix('nut', [x0 + s, SUPPORT_H - 4, row], [0, -1, 0], [1, 0, 0]);
  }
  // the clips over the foot's edges, their nuts behind the flange
  for (const [side, d] of p.seats) {
    const at = [x0 + p.c + side * d, SUPPORT_H + SG_FLANGE / 2, gap] as const;
    a.fix('clip', at, [0, 0, 1], [side, 0, 0]);
    a.fix('nut', [at[0], at[1], gap - SG_T], [0, 0, -1], [side, 0, 0]);
  }
}
