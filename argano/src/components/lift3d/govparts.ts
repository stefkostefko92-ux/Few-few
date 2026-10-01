// The overspeed governor's parts, after the usual two-cheek governor: the pulley — turned, its V groove undercut into
// a seat for the rope, two flyweights pivoted on its web and held in by their springs — turns between the cheeks of
// a cast A-frame bolted on a base plate, under the housing of the rope-gripping jaw; the electric safety switch on a
// cheek, its cable down to a floor gland. Two sizes by the rated speed: up to 1,48 m/s a pulley of Ø 200 on a 6 mm
// rope in a frame 370 high on a base 165 × 220 (PFB LK200, Montanari RQ200, Dynatech VEGA); above, Ø 300 on 8 mm
// (PFB LK300, Wittur OL35; its frame scaled from the smaller one). Built in millimetres in the governor's own frame —
// a along the axle (plan x), w along the rope's plane (plan y), h up — round a pulley's centre. The tension weight in
// the pit is in tension.ts. Loaded only through boot.ts (lazy).
// Motion: the pulleys turn as the car travels; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { P, type Batch, type Point } from './geom';
import { fastener, frameAt } from './hardware';
import type { LiftMaterials } from './materials';
import { coil } from './sling';

/** A governor's size: the pulleys' pitch radius (the rope's centre), the rope's radius, half the rim's width; the
 *  axle over the base, the frame's top over the axle, half the base plate along the axle and along the rope [mm]. */
export interface GovSize {
  R: number;
  rope: number;
  half: number;
  axle: number;
  top: number;
  baseA: number;
  baseW: number;
}
const SMALL: GovSize = { R: 100, rope: 3, half: 15, axle: 240, top: 130, baseA: 82.5, baseW: 110 };
const LARGE: GovSize = { R: 150, rope: 4, half: 20, axle: 330, top: 210, baseA: 120, baseW: 118 };
/** The governor for a rated speed [m/s]. */
export const govSize = (v: number): GovSize => (v <= 1.48 ? SMALL : LARGE);
// the cheeks' inner face and their thickness [mm]
const CHEEK = 26, CHEEK_T = 14;

/** A turned part from its (r, t) profile [mm] — out along the side t < 0, over the outside, back along t > 0 — its
 *  axis along X, in metres; crisp at the profile's corners, smooth round. */
function turned(profile: readonly (readonly [number, number])[], segments = 72): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, t]) => new THREE.Vector2(r, t)), segments).rotateZ(-Math.PI / 2);
  return toCreasedNormals(g, Math.PI / 5).scale(0.001, 0.001, 0.001);
}

/** The rim: the flanges, the groove's flanks and the seat the rope lies in, its centre on R. */
function rim(G: GovSize): THREE.BufferGeometry {
  const { R, rope, half } = G, lip = R + 14, seat = rope + 0.5, inner = R - 22;
  const pts: [number, number][] = [[inner, -half], [lip - 1.5, -half], [lip, -half + 1.5], [lip, -11]];
  for (let k = -4; k <= 4; k++) pts.push([R - seat * Math.cos((k * Math.PI) / 12), seat * Math.sin((k * Math.PI) / 12)]);
  pts.push([lip, 11], [lip, half - 1.5], [lip - 1.5, half], [inner, half], [inner, -half]);
  return turned(pts);
}

/** The web and the hub, cast in one with the rim. */
const web = (G: GovSize): THREE.BufferGeometry => turned([[0.5, -32], [38, -32], [44, -26], [44, -8], [G.R - 21, -8], [G.R - 21, 8], [44, 8], [44, 26], [38, 32], [0.5, 32]]);

/** A flat part in the pulley's plane (p, q [mm] → world Y, Z) extruded along X from t0 to t0 + depth, in metres. */
function radial(shape: THREE.Shape, t0: number, depth: number): THREE.BufferGeometry {
  const g = toCreasedNormals(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 }), Math.PI / 6);
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
  return g.applyMatrix4(basis.setPosition(t0, 0, 0)).scale(0.001, 0.001, 0.001);
}

/** The flyweights on the web's face toward s: annular sectors pivoted at one end, a spring from each one's free end
 *  to the other's pivot, across the hub; drawn for the Ø 300 pulley and scaled to the pulley. */
function flyweights(M: LiftMaterials, s: 1 | -1, G: GovSize): THREE.Mesh[] {
  const weights: THREE.BufferGeometry[] = [], pins: THREE.BufferGeometry[] = [], springs: THREE.BufferGeometry[] = [];
  const t0 = s > 0 ? 8 : -18, tm = s * 13, rad = Math.PI / 180, kr = G.R / 150;
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
    // in the pulley's plane only (y, z): the thickness along the axle stays
    return new THREE.Mesh((merged ?? new THREE.BufferGeometry()).scale(1, kr, kr), m);
  });
}

/** A pulley that turns: the rim, the web with its hub and, on the governor's, the flyweights on the face toward s. */
export function governorWheel(M: LiftMaterials, flyweightsOn: 1 | -1 | null, G: GovSize): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(rim(G), M.pulley), new THREE.Mesh(web(G), M.frame));
  if (flyweightsOn !== null) g.add(...flyweights(M, flyweightsOn, G));
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
 *  jaw's housing over the rim, the switch on the cheek toward `side` and its cable down to a gland in the floor. */
export function governorFrame(B: Batch, M: LiftMaterials, o: Point, side: 1 | -1, wall: number | null, gland: boolean, G: GovSize): void {
  const { at, box } = frame(B, o), hb = -G.axle, hf = hb + 26, TOP = G.top, up = new THREE.Vector3(0, 1, 0), ax = new THREE.Vector3(1, 0, 0);
  const lo = wall !== null && wall < 0 ? Math.max(-G.baseA, wall) : -G.baseA, hi = wall !== null && wall > 0 ? Math.min(G.baseA, wall) : G.baseA;
  const fw = G.baseW - 6, tw = 0.41 * fw, foot = Math.max(G.baseA - 40, CHEEK + CHEEK_T + 2);
  box(lo, hi, -G.baseW, G.baseW, hb, hb + 12, M.steel);
  for (const a of [-(G.baseA - 20), G.baseA - 20]) for (const w of [-(G.baseW - 18), G.baseW - 18]) if (a > lo + 15 && a < hi - 15) fastener(B, 'anchor', M.galv, frameAt(P(...at(a, w, hb + 12)), up, ax));
  box(Math.max(lo, -foot), Math.min(hi, foot), -fw, fw, hb + 12, hf, M.steel);
  for (const a of [-(foot - 18), foot - 18]) for (const w of [-(fw - 20), fw - 20]) fastener(B, 'head', M.galv, frameAt(P(...at(a, w, hf)), up, ax));
  // the cheeks: an A from the foot to the top, a window under the axle and one over it
  const half = (h: number): number => fw - ((h - hf) * (fw - tw)) / (TOP - hf);
  const win = (h0: number, h1: number, inset: number): [number, number][] => [[-(half(h0) - inset), h0], [half(h0) - inset, h0], [half(h1) - inset, h1], [-(half(h1) - inset), h1]];
  const outline: [number, number][] = [[-fw, hf], [fw, hf], [tw, TOP - 10], [tw - 10, TOP], [-(tw - 10), TOP], [-tw, TOP - 10]];
  for (const s of [-1, 1]) {
    cheek(B, o, outline, [win(hf + 40, -0.41 * G.R, 24), win(0.41 * G.R, TOP - 0.22 * TOP, 20)], s > 0 ? CHEEK : -CHEEK - CHEEK_T, s > 0 ? CHEEK + CHEEK_T : -CHEEK, M.steel);
    B.rod(at(s * (CHEEK + CHEEK_T), 0, 0), at(s * (CHEEK + CHEEK_T + 7), 0, 0), 32, M.steel, 28);
    B.rod(at(s * (CHEEK + CHEEK_T + 7), 0, 0), at(s * (CHEEK + CHEEK_T + 17), 0, 0), 17, M.galv, 6);
  }
  B.rod(at(-(CHEEK + CHEEK_T + 21), 0, 0), at(CHEEK + CHEEK_T + 21, 0, 0), 15, M.rail, 20);
  // the jaw's housing across the top, over the rim, its pivot through the cheeks
  const j0 = Math.max(G.R + 18, TOP - 38);
  box(-CHEEK, CHEEK, -48, 48, j0, TOP, M.steel);
  B.rod(at(-(CHEEK + CHEEK_T + 6), -30, (j0 + TOP) / 2), at(CHEEK + CHEEK_T + 6, -30, (j0 + TOP) / 2), 6, M.galv, 10);
  // the safety switch, its lever and roller on the trip cam, its cable down to the floor
  const a = side * 57, out = CHEEK + CHEEK_T, s0 = 0.28 * TOP, s1 = 0.7 * TOP, ws = -(fw - 35);
  box(side * out, side * (out + 34), -(fw - 8), -(fw - 62), s0, s1, M.panel);
  B.rod(at(a, ws, s1), at(a, -40, TOP - 24), 3, M.galv, 8);
  B.rod(at(a - 7, -40, TOP - 24), at(a + 7, -40, TOP - 24), 8, M.rubber, 14);
  B.rod(at(a, ws, s0), at(a, ws, s0 - 10), 8, M.rubber, 12);
  cable(B, [at(a, ws, s0 - 10), at(a, ws, hb + 80), at(side * 95, ws, hb + 30), at(side * 140, ws, hb + 12), at(side * 150, ws, hb + 4)], 6, M.rubber);
  if (gland) box(side * 130, side * 170, ws - 20, ws + 20, hb, hb + 6, M.galv);
}
