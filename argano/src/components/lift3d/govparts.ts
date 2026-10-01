// The overspeed governor's parts, after the usual two-cheek governor: the pulley — turned, its V groove undercut into
// a seat for the rope, two flyweights pivoted on its web and held in by their springs — turns between the cheeks of
// a cast A-frame bolted on a base plate, under the housing of the rope-gripping jaw; the electric safety switch on a
// cheek, its cable down to a floor gland. In the pit, the tension pulley on a lever hinged at the side wall, the
// weight at the lever's far end and the slack-rope switch under it. Built in millimetres in the governor's own frame —
// a along the axle (plan x), w along the rope's plane (plan y), h up — round a pulley's centre. Loaded only through
// boot.ts (lazy).
// Motion: the pulleys turn as the car travels; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { P, type Batch, type Point } from './geom';
import { fastener, frameAt } from './hardware';
import type { LiftMaterials } from './materials';
import { coil } from './sling';

/** The pulleys: pitch radius (the rope's centre), the rope's radius, half the rim's width; the governor's axle over
 *  its base [mm]. */
export const GOV = { R: 150, rope: 4, half: 20, axle: 330 } as const;
// the cheeks' inner face and their thickness, the top of the A-frame [mm]
const CHEEK = 26, CHEEK_T = 14, TOP = 210;

/** A turned part from its (r, t) profile [mm] — out along the side t < 0, over the outside, back along t > 0 — its
 *  axis along X, in metres; crisp at the profile's corners, smooth round. */
function turned(profile: readonly (readonly [number, number])[], segments = 72): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, t]) => new THREE.Vector2(r, t)), segments).rotateZ(-Math.PI / 2);
  return toCreasedNormals(g, Math.PI / 5).scale(0.001, 0.001, 0.001);
}

/** The rim: the flanges, the groove's flanks and the seat the rope lies in, its centre on R. */
function rim(): THREE.BufferGeometry {
  const { R, rope, half } = GOV, lip = R + 14, seat = rope + 0.5, inner = R - 22;
  const pts: [number, number][] = [[inner, -half], [lip - 1.5, -half], [lip, -half + 1.5], [lip, -11]];
  for (let k = -4; k <= 4; k++) pts.push([R - seat * Math.cos((k * Math.PI) / 12), seat * Math.sin((k * Math.PI) / 12)]);
  pts.push([lip, 11], [lip, half - 1.5], [lip - 1.5, half], [inner, half], [inner, -half]);
  return turned(pts);
}

/** The web and the hub, cast in one with the rim. */
const web = (): THREE.BufferGeometry => turned([[0.5, -32], [38, -32], [44, -26], [44, -8], [GOV.R - 21, -8], [GOV.R - 21, 8], [44, 8], [44, 26], [38, 32], [0.5, 32]]);

/** A flat part in the pulley's plane (p, q [mm] → world Y, Z) extruded along X from t0 to t0 + depth, in metres. */
function radial(shape: THREE.Shape, t0: number, depth: number): THREE.BufferGeometry {
  const g = toCreasedNormals(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 }), Math.PI / 6);
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
  return g.applyMatrix4(basis.setPosition(t0, 0, 0)).scale(0.001, 0.001, 0.001);
}

/** The flyweights on the web's face toward s: annular sectors pivoted at one end, a spring from each one's free end
 *  to the other's pivot, across the hub. */
function flyweights(M: LiftMaterials, s: 1 | -1): THREE.Mesh[] {
  const weights: THREE.BufferGeometry[] = [], pins: THREE.BufferGeometry[] = [], springs: THREE.BufferGeometry[] = [];
  const t0 = s > 0 ? 8 : -18, tm = s * 13, rad = Math.PI / 180;
  for (const a of [0, 180]) {
    const a0 = (a - 50) * rad, a1 = (a + 50) * rad, sh = new THREE.Shape();
    sh.moveTo(114 * Math.cos(a0), 114 * Math.sin(a0));
    sh.absarc(0, 0, 114, a0, a1, false);
    sh.lineTo(66 * Math.cos(a1), 66 * Math.sin(a1));
    sh.absarc(0, 0, 66, a1, a0, true);
    weights.push(radial(sh, t0, 10));
    const pa = (a - 38) * rad;
    pins.push(new THREE.CylinderGeometry(0.007, 0.007, 0.007, 12).rotateZ(Math.PI / 2).translate((s * 21.5) / 1000, (90 * Math.cos(pa)) / 1000, (90 * Math.sin(pa)) / 1000));
    // the spring: from this weight's free end (a + 45°) to the other's pivot end (a + 135°)
    const from = new THREE.Vector3(tm, 90 * Math.cos((a + 45) * rad), 90 * Math.sin((a + 45) * rad)).multiplyScalar(0.001);
    const to = new THREE.Vector3(tm, 90 * Math.cos((a + 135) * rad), 90 * Math.sin((a + 135) * rad)).multiplyScalar(0.001);
    const along = to.clone().sub(from), spring = coil(6, 1.4, along.length() * 1000, 10);
    spring.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), along.normalize()));
    springs.push(spring.translate(from.x, from.y, from.z));
  }
  return ([[weights, M.base], [pins, M.galv], [springs, M.spring]] as const).map(([list, m]) => {
    const merged = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    for (const g of list) g.dispose();
    return new THREE.Mesh(merged ?? new THREE.BufferGeometry(), m);
  });
}

/** A pulley that turns: the rim, the web with its hub and, on the governor's, the flyweights on the face toward s. */
export function governorWheel(M: LiftMaterials, flyweightsOn: 1 | -1 | null): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(rim(), M.pulley), new THREE.Mesh(web(), M.frame));
  if (flyweightsOn !== null) g.add(...flyweights(M, flyweightsOn));
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true;
  });
  return g;
}

/** A box and a point in the governor's frame round o. */
function frame(B: Batch, o: Point) {
  const [x, y, z] = o;
  return {
    at: (a: number, w: number, h: number): Point => [x + a, y + w, z + h],
    box: (a0: number, a1: number, w0: number, w1: number, h0: number, h1: number, m: THREE.Material): void => B.box(x + a0, y + w0, z + h0, x + a1, y + w1, z + h1, m),
  };
}

/** A plate in the plane of the rope (its outline and holes in w, h [mm]) from a0 to a1 along the axle, round o. */
function cheek(B: Batch, o: Point, outline: readonly (readonly [number, number])[], holes: readonly (readonly (readonly [number, number])[])[], a0: number, a1: number, m: THREE.Material): void {
  const v = (pts: readonly (readonly [number, number])[]): THREE.Vector2[] => pts.map(([w, h]) => new THREE.Vector2(w / 1000, h / 1000));
  const shape = new THREE.Shape(v(outline));
  for (const h of holes) shape.holes.push(new THREE.Path(v(h)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: (a1 - a0) / 1000, bevelEnabled: false });
  // the outline's w runs along plan y (world −Z), h up, the thickness along the axle (world X): a right-handed frame
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
  B.add(g.applyMatrix4(basis.setPosition(P(o[0] + a0, o[1], o[2]))), m);
}

/** A cable of radius r through plan points [mm]. */
function cable(B: Batch, pts: readonly Point[], r: number, m: THREE.Material): void {
  B.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => P(...p))), 48, r / 1000, 8), m);
}

/** The governor's frame round its pulley's centre o [mm]: the base plate with its anchors (cut at the wall when
 *  `wall`, its a from the axle, is near), the A-frame's foot and cheeks with their windows, the axle and its nuts, the
 *  jaw's housing, the switch on the cheek toward `side` and its cable down to a gland in the floor (`gland`). */
export function governorFrame(B: Batch, M: LiftMaterials, o: Point, side: 1 | -1, wall: number | null, gland: boolean): void {
  const { at, box } = frame(B, o), hb = -GOV.axle, hf = hb + 26, up = new THREE.Vector3(0, 1, 0), ax = new THREE.Vector3(1, 0, 0);
  const lo = wall !== null && wall < 0 ? Math.max(-120, wall) : -120, hi = wall !== null && wall > 0 ? Math.min(120, wall) : 120;
  box(lo, hi, -118, 118, hb, hb + 12, M.steel);
  for (const a of [-100, 100]) for (const w of [-100, 100]) if (a > lo + 15 && a < hi - 15) fastener(B, 'anchor', M.galv, frameAt(P(...at(a, w, hb + 12)), up, ax));
  box(Math.max(lo, -80), Math.min(hi, 80), -112, 112, hb + 12, hf, M.steel);
  for (const a of [-62, 62]) for (const w of [-92, 92]) fastener(B, 'head', M.galv, frameAt(P(...at(a, w, hf)), up, ax));
  // the cheeks: an A from the foot to the top, a window under the axle and one over it
  const half = (h: number): number => 112 - ((h - hf) * (112 - 46)) / (TOP - hf);
  const win = (h0: number, h1: number, inset: number): [number, number][] => [[-(half(h0) - inset), h0], [half(h0) - inset, h0], [half(h1) - inset, h1], [-(half(h1) - inset), h1]];
  const outline: [number, number][] = [[-112, hf], [112, hf], [46, TOP - 10], [36, TOP], [-36, TOP], [-46, TOP - 10]];
  for (const s of [-1, 1]) {
    cheek(B, o, outline, [win(hf + 40, -62, 24), win(62, TOP - 46, 20)], s > 0 ? CHEEK : -CHEEK - CHEEK_T, s > 0 ? CHEEK + CHEEK_T : -CHEEK, M.steel);
    B.rod(at(s * (CHEEK + CHEEK_T), 0, 0), at(s * (CHEEK + CHEEK_T + 7), 0, 0), 32, M.steel, 28);
    B.rod(at(s * (CHEEK + CHEEK_T + 7), 0, 0), at(s * (CHEEK + CHEEK_T + 17), 0, 0), 17, M.galv, 6);
  }
  B.rod(at(-(CHEEK + CHEEK_T + 21), 0, 0), at(CHEEK + CHEEK_T + 21, 0, 0), 15, M.rail, 20);
  // the jaw's housing across the top, its pivot through the cheeks
  box(-CHEEK, CHEEK, -48, 48, TOP - 38, TOP, M.steel);
  B.rod(at(-(CHEEK + CHEEK_T + 6), -30, TOP - 19), at(CHEEK + CHEEK_T + 6, -30, TOP - 19), 6, M.galv, 10);
  // the safety switch, its lever and roller on the trip cam, its cable down to the floor
  const a = side * 57, out = CHEEK + CHEEK_T;
  box(side * out, side * (out + 34), -104, -50, 60, 146, M.panel);
  B.rod(at(a, -77, 146), at(a, -40, 186), 3, M.galv, 8);
  B.rod(at(a - 7, -40, 186), at(a + 7, -40, 186), 8, M.rubber, 14);
  B.rod(at(a, -77, 60), at(a, -77, 50), 8, M.rubber, 12);
  cable(B, [at(a, -77, 50), at(a, -77, hb + 80), at(side * 95, -77, hb + 30), at(side * 140, -77, hb + 12), at(side * 150, -77, hb + 4)], 6, M.rubber);
  if (gland) box(side * 130, side * 170, -97, -57, hb, hb + 6, M.galv);
}

/** The tension pulley round its centre o [mm]: two flat bars carry its axle, hinged on a bracket at the side wall (its
 *  plan x `wallX`, `inward` from it) on the far side from the car's rail; the weight hangs under the pulley from a
 *  stirrup on the axle; the slack-rope switch on the bracket, its roller under the bar on the wall's side. */
export function tensionFrame(B: Batch, M: LiftMaterials, o: Point, wallX: number, inward: 1 | -1): void {
  const { at, box } = frame(B, o), [x, y, z] = o, hinge = 230;
  for (const s of [-1, 1]) {
    box(s * CHEEK, s * (CHEEK + 8), -40, hinge + 25, -22, 22, M.steel);
    box(s * 36, s * 44, hinge - 40, hinge + 40, -45, 35, M.galv);
    box(s * 36, s * 42, -25, 25, -212, 16, M.steel);
    B.rod(at(s * 42, 0, 0), at(s * 50, 0, 0), 14, M.galv, 6);
  }
  B.rod(at(-50, 0, 0), at(50, 0, 0), 12, M.rail, 16);
  B.rod(at(-50, hinge, 0), at(50, hinge, 0), 8, M.galv, 12);
  // the bracket: a plate anchored on the wall, an arm out under the hinge
  B.box(wallX, y + 100, z - 175, wallX + inward * 10, y + hinge + 70, z + 40, M.galv);
  B.box(wallX + inward * 10, y + hinge - 40, z - 65, x + inward * 44, y + hinge + 40, z - 45, M.galv);
  for (const [w, h] of [[hinge, -110], [hinge, 10], [125, -60]] as const) {
    fastener(B, 'anchor', M.galv, frameAt(P(wallX + inward * 10, y + w, z + h), new THREE.Vector3(inward, 0, 0), new THREE.Vector3(0, 1, 0)));
  }
  // the weight under the pulley, on the stirrup's plate
  box(-62, 62, -66, 66, -224, -212, M.steel);
  box(-55, 55, -60, 60, -460, -224, M.cwFill);
  // the slack-rope switch, its lever up to a roller under the bar on the wall's side
  const near = -inward * 30;
  B.box(wallX + inward * 10, y + 150, z - 165, x - inward * 40, y + 200, z - 100, M.panel);
  B.rod(at(-inward * 40, 175, -100), at(near, 175, -36), 3, M.galv, 8);
  B.rod(at(near - 5, 175, -29), at(near + 5, 175, -29), 7, M.rubber, 14);
}
