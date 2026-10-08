// The reactions of the machine's support on the building, R1…Rn (registry carichi.reazioni): the load of the machine
// on its support — its mass with its bedframe at the middle of its outline, the static load on its axis times the
// dynamic coefficient on the ropes' falls (support-check.ts loadCentre) — shared out over the support's bearings as a
// rigid body on bearings equally stiff (the lever rule in two directions): on the slab under the anti-vibration mounts
// (shims, plates), the ends of a frame's profiles, the legs of the bedplate with the diverting pulley, the blocks of a
// plinth; in the walls at the bearings of beams from wall to wall or of the HEB beams over the shaft (each beam its
// share across, simply supported along, with its own weight). The sheet writes them, the plan marks them. Room axes
// [mm], forces [daN]; pure.
import type { HebLayout } from './heb';
import { dropSpan, machineU, machineV, supportRunIn, type MachineSpec, type RoomGeo } from './machine-room';
import { KV_VERT } from './norme-vert';
import { PROFILES } from './profiles';
import { bedplateLegs } from './rinvio';
import { onHeb, profileOf, supportOf } from './support';
import { loadCentre, rowShares, type SupportLoad } from './support-check';

type Pt = readonly [number, number];
const G_ACC = 9.81;

export interface Reactions {
  /** on the slab (under the support's feet) or in the walls (at the bearings of beams) */
  on: 'slab' | 'walls';
  /** each bearing in plan (room axes), and its reaction [daN] in the same order (R1…Rn); below 0: pulled up */
  pts: Pt[];
  R: number[];
}

const onDrop = (G: RoomGeo, u: number, v: number): Pt => [G.carDrop[0] + u * G.ux - v * G.uy, G.carDrop[1] + u * G.uy + v * G.ux];

/** A load F at c shared over the points `pts` as by a rigid body on bearings equally stiff: R = a + b·x + c·y with the
 *  sums of R, R·x and R·y those of the load; on a line (or one point), the lever rule along it. */
export function rigidShares(pts: readonly Pt[], c: Pt, F: number): number[] {
  const n = pts.length;
  if (!n) return [];
  const mx = pts.reduce((t, p) => t + p[0], 0) / n, my = pts.reduce((t, p) => t + p[1], 0) / n;
  const xs = pts.map((p) => p[0] - mx), ys = pts.map((p) => p[1] - my), cx = c[0] - mx, cy = c[1] - my;
  const sxx = xs.reduce((t, x) => t + x * x, 0), syy = ys.reduce((t, y) => t + y * y, 0), sxy = xs.reduce((t, x, i) => t + x * ys[i], 0);
  const det = sxx * syy - sxy * sxy, scale = Math.max(sxx, syy);
  if (scale < 1e-6) return pts.map(() => F / n);
  if (det <= 1e-9 * scale * scale) {
    // all on one line: along its direction
    const L = Math.sqrt(scale), dx = (sxx >= syy ? Math.sqrt(sxx) : sxy / Math.sqrt(syy)) / L, dy = (sxx >= syy ? sxy / Math.sqrt(sxx) : Math.sqrt(syy)) / L;
    const ts = xs.map((x, i) => x * dx + ys[i] * dy), tc = cx * dx + cy * dy, s = ts.reduce((t, x) => t + x * x, 0);
    return ts.map((t) => F * (1 / n + (s > 1e-9 ? (tc * t) / s : 0)));
  }
  // the moments about the centroid: b·sxx + c·sxy = F·cx, b·sxy + c·syy = F·cy
  const b = (F * cx * syy - F * cy * sxy) / det, k = (F * cy * sxx - F * cx * sxy) / det;
  return xs.map((x, i) => F / n + b * x + k * ys[i]);
}

/** A beam simply supported between bearings `L` apart carrying F at `t` from the first, and its own weight q·L: the two
 *  reactions [N]. */
const beamEnds = (F: number, t: number, L: number, q: number): [number, number] => {
  const s = Math.min(Math.max(t, 0), L);
  return [(F * (L - s)) / L + (q * L) / 2, (F * s) / L + (q * L) / 2];
};

/** The bearings of the machine's support in plan and the reactions on them at `load`; `heb`: the HEB beams it stands on
 *  (heb.ts hebDrawn); null for a machine without a room. */
export function supportReactions(G: RoomGeo, M: MachineSpec, load: SupportLoad, heb: HebLayout | null = null): Reactions {
  const R = G.room, s = supportOf(R, M.Dp > 0), F = G.frame, c = loadCentre(G, M, load), Fn = c.F * G_ACC, at = onDrop(G, c.u, c.v);
  const daN = (x: number): number => x / 10;
  if (heb && onHeb(R, M.Dp > 0)) {
    // the HEB beams: each its share across them, simply supported between its bearings' centres along them
    const P = PROFILES[heb.profile], along = heb.dir === 'x' ? 0 : 1, across = 1 - along, [a, b] = heb.at, d = b - a, bear = KV_VERT.hebBearing;
    const shares = d > 1 ? [(b - at[across]) / d, (at[across] - a) / d] : [0.5, 0.5], L = heb.span[1] - heb.span[0] + bear, t = at[along] - (heb.span[0] - bear / 2);
    const pts: Pt[] = [], out: number[] = [];
    heb.at.forEach((ax, i) => {
      const [r0, r1] = beamEnds(Fn * shares[i], t, L, (P.mass * G_ACC) / 1000);
      const p = (x: number): Pt => (along ? [ax, x] : [x, ax]);
      pts.push(p(heb.span[0] - bear / 2), p(heb.span[1] + bear / 2));
      out.push(daN(r0), daN(r1));
    });
    return { on: 'walls', pts, R: out };
  }
  if (s.kind === 'beams') {
    // beams from wall to wall: one under each iron, the share across them, each simply supported along its own span
    const P = PROFILES[profileOf(s)], rows = F.beams.map((z) => machineV(G, z)), shares = rowShares(rows, c.v), bear = KV_VERT.supportBearing;
    const pts: Pt[] = [], out: number[] = [];
    rows.forEach((v, i) => {
      const [r0, r1] = dropSpan(G, 0, 0, R.W, R.D, v), L = r1 - r0 + bear, [e0, e1] = beamEnds(Fn * shares[i], c.u - (r0 - bear / 2), L, (P.mass * G_ACC) / 1000);
      pts.push(onDrop(G, r0 - bear / 2, v), onDrop(G, r1 + bear / 2, v));
      out.push(daN(e0), daN(e1));
    });
    return { on: 'walls', pts, R: out };
  }
  const pts = feetOf(G, M);
  return { on: 'slab', pts, R: rigidShares(pts, at, Fn).map(daN) };
}

/** Where the support bears on the slab (room axes): the legs of the bedplate with the diverting pulley, the blocks of a
 *  plinth (their middles), the ends of a frame's profiles, the mounts on shims or plates under each iron. */
function feetOf(G: RoomGeo, M: MachineSpec): Pt[] {
  const s = supportOf(G.room, M.Dp > 0), F = G.frame;
  if (s.kind === 'rinvio' && M.rinvio?.on === 'frame') return bedplateLegs(G, M, null).map(([u, v]) => onDrop(G, u, v));
  const span = supportRunIn(G, M);
  if (s.kind === 'plinth') {
    const um = span ? machineU(G, (span[0] + span[1]) / 2) : (G.frame0 + G.frame1) / 2;
    return F.plinth.map(([z0, z1]) => onDrop(G, um, machineV(G, (z0 + z1) / 2)));
  }
  const xs = s.kind === 'frame' && span ? span : F.mounts;
  return xs.flatMap((x) => F.beams.map((z) => onDrop(G, machineU(G, x), machineV(G, z))));
}

/** Where the support's bearings are (R1…Rn in the order of supportReactions), whatever the load. */
export const reactionPoints = (G: RoomGeo, M: MachineSpec, heb: HebLayout | null = null): Reactions['pts'] => supportReactions(G, M, { machine: 1, static: 0, dyn: 1 }, heb).pts;
