// What carries the doors at the top. On each track the running bar with its rounded top, held from behind the
// rollers (away from the hanger plates) by a web up to a shelf on the header plate, so nothing fixed crosses the
// hangers' way. Over a car entrance the operator: the folded header on the car's front with the tracks, the drive in
// front of the hangers (motor behind its pulley, the toothed belt round the two pulleys, the tensioner), the cover
// over it all, the control box on the roof. Over a landing entrance the suspension, on the shaft side of the wall:
// header plate and cover, the tracks, the lock over the closing edge with its label, the closer at the stack. As long
// as the panels' travel needs, inside the shaft. Nothing of the car reaches the landing's parts as it passes: only the
// coupler's vanes, between which the lock's rollers go. Plan and heights in millimetres, into a batch.
// Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import type { DoorLayout } from '@/shaft';
import { HEADER, headerSpan } from '@/shaft/sill';
import { extrudeAlong, onWall, type Batch, type Point } from './geom';
import { TRACK_TOP, trackPlanes, type Tracks } from './doors';
import type { LiftMaterials, Side } from './materials';

// over the panels' top [mm]: the running bar's foot, the shelf the webs hang from; the web behind the rollers
const BAR = 50, SHELF = 150, WEB0 = 12.5, WEB1 = 15.5;


/** The running bar of a track centred on vc: its foot at zt + BAR, its rounded top at zt + TRACK_TOP (metres, from zt). */
function barSection(vc: number): THREE.Shape {
  const r = 6, top = TRACK_TOP - r, pts = [new THREE.Vector2((vc + r) / 1000, BAR / 1000)];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI;
    pts.push(new THREE.Vector2((vc + r * Math.cos(a)) / 1000, (top + r * Math.sin(a)) / 1000));
  }
  pts.push(new THREE.Vector2((vc - r) / 1000, BAR / 1000));
  return new THREE.Shape(pts);
}

/** The tracks of a door over its panels' top zt, between u0 and u1: the bars, each with its foot and web on the side
 *  away from the hanger plates (−s), and the shelf from the outermost web back to the header plate's face at vBack. */
function tracks(B: Batch, M: LiftMaterials, wall: Side, W: number, D: number, planes: readonly number[], s: 1 | -1, u0: number, u1: number, zt: number, vBack: number): void {
  for (const vc of planes) {
    B.add(extrudeAlong(wall, W, D, barSection(vc), u0, u1, zt), M.rail);
    B.wallBox(wall, W, D, u0, u1, vc - s * 6, vc - s * WEB1, zt + BAR, zt + BAR + 6, M.galv);
    B.wallBox(wall, W, D, u0, u1, vc - s * WEB0, vc - s * WEB1, zt + BAR, zt + SHELF + 6, M.galv);
  }
  const outer = s > 0 ? Math.max(...planes) - WEB0 : Math.min(...planes) + WEB0;
  B.wallBox(wall, W, D, u0, u1, vBack, outer, zt + SHELF, zt + SHELF + 6, M.galv);
}

/** The car door operator, as long as the layout makes it (the catalogues' length for the door, src/shaft/norme.ts).
 *  `tr`: the panels' tracks, `t` their thickness, `vCar`: the car's front face, `roof`: the roof's height, `belt`: the
 *  height of the belt's lower strand. */
export function carOperator(B: Batch, M: LiftMaterials, wall: Side, W: number, D: number, d: DoorLayout, tr: Tracks, t: number, vCar: number, roof: number, belt: number): void {
  const len = wall === 'front' || wall === 'rear' ? W : D, lo = Math.max(d.op0, 20), hi = Math.min(d.op1, len - 20), zt = d.height, top = roof + 235;
  // the belt runs just in front of the fast panel's hanger plate, over the clamp on it (doors.ts); the cover over it
  const vb = tr.fast - 4, front = vb - 10;
  const at = (u: number, v: number, z: number): Point => {
    const [x, y] = onWall(wall, W, D, u, v);
    return [x, y, z];
  };
  // folded header: back plate on the car's front, the cover over everything, a lip at the bottom
  B.wallBox(wall, W, D, lo, hi, vCar - 4, vCar - 1, zt + 20, top, M.galv);
  B.wallBox(wall, W, D, lo, hi, front, vCar - 1, top - 7, top, M.galv);
  B.wallBox(wall, W, D, lo, hi, front, front + 3, top - 45, top - 7, M.galv);
  B.wallBox(wall, W, D, lo, hi, vCar - 8, vCar - 1, zt + 20, zt + 26, M.galv);
  tracks(B, M, wall, W, D, trackPlanes(d, tr, t), -1, lo + 10, hi - 10, zt, vCar - 4);
  // between the shelf and the drive, on the header plate: the duct of the cables from the motor to the control box, a
  // row of mounting slots under it (as room allows: the door's head may come close to the roof)
  const box0 = d.stack === 'low' ? hi - 320 : lo + 40, [pd, pr] = d.stack === 'low' ? [lo + 70, hi - 60] : [hi - 70, lo + 60];
  const za = zt + SHELF + 6, zb = belt - 10;
  if (zb - za > 40) B.wallBox(wall, W, D, Math.min(pd, box0 + 140), Math.max(pd, box0 + 140), vCar - 24, vCar - 4, zb - 32, zb, M.frame);
  if (zb - za > 64) for (let u = lo + 90; u < hi - 90; u += 160) B.wallBox(wall, W, D, u - 20, u + 20, vCar - 5, vCar - 4, zb - 54, zb - 44, M.rubber);
  // drive at the stack's end: the pulley on the motor's shaft, the motor behind it; the return pulley on its tensioner
  const zp = belt + 35, r = 32;
  for (const u of [pd, pr]) {
    B.rod(at(u, vb - 4, zp), at(u, vb + 4, zp), r, M.rubber, 28);
    B.rod(at(u, vb - 6, zp), at(u, vb + 6, zp), r - 9, M.rail, 24);
  }
  B.rod(at(pr, vb + 6, zp), at(pr, vCar - 4, zp), 7, M.rail, 8);
  B.wallBox(wall, W, D, pr - 25, pr + 25, vb + 9, vCar - 4, zp - 40, zp + 40, M.galv);
  B.rod(at(pd, vb + 6, zp), at(pd, vb + 14, zp), 9, M.rail, 10);
  B.rod(at(pd, vb + 14, zp), at(pd, vCar - 16, zp), 42, M.frame, 28);
  B.rod(at(pd, vCar - 16, zp), at(pd, vCar - 4, zp), 34, M.frame, 20);
  // the belt: two strands between the pulleys
  B.wallBox(wall, W, D, Math.min(pd, pr), Math.max(pd, pr), vb - 4, vb + 4, zp + r, zp + r + 3, M.rubber);
  B.wallBox(wall, W, D, Math.min(pd, pr), Math.max(pd, pr), vb - 4, vb + 4, zp - r - 3, zp - r, M.rubber);
  // control box on the roof, behind the header
  B.wallBox(wall, W, D, box0, box0 + 280, vCar + 10, vCar + 130, roof, roof + 115, M.frame);
  B.wallBox(wall, W, D, box0 + 20, box0 + 60, vCar + 6, vCar + 10, roof + 70, roof + 90, M.led);
}

/** The suspension of a landing door over its panels' top zt (the landing's level + the door's height); `back`: where it
 *  starts from the wall — behind the door's own frame, which it is fixed to (src/shaft/frame.ts). */
export function landingHeader(B: Batch, M: LiftMaterials, wall: Side, W: number, D: number, d: DoorLayout, tr: Tracks, t: number, zt: number, depth: number, back = 0): void {
  const len = wall === 'front' || wall === 'rear' ? W : D, [lo, hi] = headerSpan(d, len), top = zt + HEADER.top;
  // the cover reaches 6 mm past the sill's edge, over the nuts of the hangers: the car's parts pass beyond it
  B.wallBox(wall, W, D, lo, hi, back, back + 3, zt + HEADER.foot, top, M.galv);
  B.wallBox(wall, W, D, lo, hi, back, depth + 6, top - 7, top, M.galv);
  B.wallBox(wall, W, D, lo, hi, depth + 3, depth + 6, top - 40, top - 7, M.galv);
  tracks(B, M, wall, W, D, trackPlanes(d, tr, t), 1, lo + 10, hi - 10, zt, 3);
  // the lock on the shelf over the closing edge, its label under the cover's lip; the closer at the stack's end
  const e = d.kind === 'C2' ? (d.u0 + d.u1) / 2 : d.stack === 'low' ? d.u1 : d.u0, k = d.kind === 'C2' || d.stack === 'low' ? -1 : 1;
  B.wallBox(wall, W, D, e - k * 30, e + k * 120, back + 3, depth + 3, zt + SHELF + 8, zt + 215, M.frame);
  B.wallBox(wall, W, D, e, e + k * 70, depth + 3, depth + 4, zt + SHELF + 15, zt + SHELF + 35, M.base);
  const c = d.kind === 'C2' ? hi - 150 : d.stack === 'low' ? lo + 20 : hi - 150;
  B.wallBox(wall, W, D, c, c + 130, back + 3, back + 40, zt + SHELF + 8, zt + 215, M.frame);
}
