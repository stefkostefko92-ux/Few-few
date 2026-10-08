// The machine's support in 3D (src/shaft/support.ts), as the drawings of the machine room draw it: levelling shims, a
// frame of profiles (on steel packs when set higher than the profile) or beams from wall to wall borne 150 mm in the
// walls (clear of the floor when higher than their profile: a machine not standing on the floor), one under each iron
// of the machine's frame, steel plates or a concrete plinth under the mounts — the machine's own anti-vibration mounts
// straight on it —; the bedplate with the diverting pulley (src/shaft/rinvio.ts): legs of square tube on dampers, beams round
// the top and under each iron of the machine's bedframe, the two plates its axle turns in, hung from short channels to
// the nearest beams; all of it on the HEB beams over the shaft's walls when the room puts them there (src/shaft/heb.ts,
// hebBeams). Built in a group placed and turned as the machine's bedplate: x along the machine (the rope drop line, 0
// at the sheave), y up from the mounts' underside, z across, in metres. Loaded only through boot.ts (lazy).
import * as THREE from 'three/webgpu';
import { KV_VERT, PROFILES, hasProfile, isChannel, profileOf, supportSpan, type HebLayout, type MachineSupport, type Profile, type RoomInputs } from '@/shaft';
import { bedplateBeams, makerRun, type RinvioFrame } from '@/shaft/rinvio';
import type { MachineFrame } from '@/shaft/machine-shape';
import { Batch } from './geom';
import type { LiftMaterials } from './materials';

/** Where a line from `o` along the unit `dir` runs inside the room's rectangle (plan, mm): the range of t [mm]. */
export function wallsAlong(o: readonly [number, number], dir: readonly [number, number], box: { x0: number; y0: number; x1: number; y1: number }): [number, number] {
  let lo = -Infinity, hi = Infinity;
  for (const [p, d, a, b] of [[o[0], dir[0], box.x0, box.x1], [o[1], dir[1], box.y0, box.y1]] as const) {
    if (Math.abs(d) < 1e-9) continue;
    const t0 = (a - p) / d, t1 = (b - p) / d;
    lo = Math.max(lo, Math.min(t0, t1));
    hi = Math.min(hi, Math.max(t0, t1));
  }
  return [lo, hi];
}

/** The diverting pulley in the bedplate: its place along the machine's x from the sheave [m], its radius [m] and half
 *  the width of its rim with the cheeks [mm], the bedplate (rinvio.ts) and the machine's x along the drop line (1) or
 *  turned against it (−1): a maker's bedplate keeps its end on the car's side. */
export interface FramedPulley {
  x: number;
  r: number;
  half: number;
  frame: RinvioFrame;
  turn: 1 | -1;
  /** the legs' centres in the machine's x and z [m] (rinvio.ts bedplateLegs: over the HEB beams it bridges); missing: at
   *  its corners */
  legs?: readonly (readonly [number, number])[];
}

/**
 * The support under the machine of frame `F` (the generic one scaled to its sheave, or a maker's on our bedframe) whose
 * mounts stand `gap` metres over the floor. `walls`: the room's walls along the machine's x from the group's origin under
 * each iron [mm] (each beam's bearings: askew each meets them elsewhere); null without a room. `pulley`: the diverting
 * pulley in the bedplate. `base`: the HEB beams it stands on over the floor [m]. `span`: a frame's or a plinth's run along
 * the machine's x as the room lets it run (support.ts supportSpanIn) [mm]; missing: supportSpan.
 */
export function buildSupport(sup: MachineSupport, F: MachineFrame, D: number, gap: number, walls: readonly (readonly [number, number])[] | null, M: LiftMaterials,
  pulley: FramedPulley | null = null, base = 0, span: readonly [number, number] | null = supportSpan(sup, D, F.shape)): THREE.Group {
  const g = new THREE.Group(), b = new Batch(), top = 0, beams = F.beams.map((z) => z / 1000), mid = (beams[0] + beams[beams.length - 1]) / 2, s = F.shape ? 1 : F.s;
  const MOUNTS = F.shape ? F.mounts.map((x) => x / 1000) : [-0.36 * F.s, 0.95 * F.s];
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, m: THREE.Material): void => {
    if (x1 - x0 > 1e-4 && y1 - y0 > 1e-4 && z1 - z0 > 1e-4) b.add(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), m);
  };
  const atMounts = (hx: number, hz: number, y0: number, y1: number, m: THREE.Material): void => {
    for (const x of MOUNTS) for (const z of beams) box(x - hx, x + hx, y0, y1, z - hz, z + hz, m);
  };
  // a rolled profile from x0 to x1 with its top at yTop, centred on zc; a channel's back toward the machine's middle
  const profile = (P: Profile, channel: boolean, x0: number, x1: number, yTop: number, zc: number): void => {
    const h = P.h / 1000, w = P.b / 1000, tw = P.tw / 1000, tf = P.tf / 1000;
    if (!channel) {
      box(x0, x1, yTop - tf, yTop, zc - w / 2, zc + w / 2, M.steel);
      box(x0, x1, yTop - h, yTop - h + tf, zc - w / 2, zc + w / 2, M.steel);
      box(x0, x1, yTop - h + tf, yTop - tf, zc - tw / 2, zc + tw / 2, M.steel);
      return;
    }
    const out = zc >= mid ? 1 : -1, back = zc - (out * w) / 2, z0 = Math.min(back, back + out * w), z1 = Math.max(back, back + out * w);
    box(x0, x1, yTop - tf, yTop, z0, z1, M.steel);
    box(x0, x1, yTop - h, yTop - h + tf, z0, z1, M.steel);
    box(x0, x1, yTop - h + tf, yTop - tf, Math.min(back, back + out * tw), Math.max(back, back + out * tw), M.steel);
  };

  if (sup.kind === 'rinvio' && pulley) {
    rinvioFrame3D(box, F, gap, pulley, M, base);
    b.into(g);
    return g;
  }
  const floor = base - gap;
  if (sup.kind === 'shims') atMounts(0.06 * s, 0.05 * s, floor, 0, M.galv);
  if (sup.kind === 'plates') atMounts(0.09 * s, 0.06 * s, floor, top, M.galv);
  if (sup.kind === 'plinth' && span) for (const [z0, z1] of F.plinth) box(span[0] / 1000, span[1] / 1000, floor, top, z0 / 1000, z1 / 1000, M.slab);
  if (hasProfile(sup)) {
    const name = profileOf(sup), P = PROFILES[name], h = P.h / 1000, bw = P.b / 1000, bear = KV_VERT.supportBearing / 1000;
    const run = span ? [span[0] / 1000, span[1] / 1000] : [MOUNTS[0] - 0.15, MOUNTS[1] + 0.15];
    beams.forEach((z, i) => {
      const w = walls?.[i], [x0, x1] = sup.kind === 'beams' && w ? [w[0] / 1000 - bear, w[1] / 1000 + bear] : run;
      profile(P, isChannel(name), x0, x1, top, z);
      // a frame set higher than its profile stands on steel packs at its ends
      if (sup.kind === 'frame' && top - h - floor > 1e-3) for (const x of [x0, x1 - 0.1]) box(x, x + 0.1, floor, top - h, z - bw / 2, z + bw / 2, M.galv);
    });
    // a frame is welded: an end cross member of the same profile at each end, between the longitudinals' flanges
    if (sup.kind === 'frame') {
      const zs = [...beams].sort((a, c) => a - c), tf = P.tf / 1000, tw = P.tw / 1000, channel = isChannel(name);
      for (const [xa, out] of [[run[0], -1], [run[1] - bw, 1]] as const) for (let k = 0; k + 1 < zs.length; k++) {
        // a channel's back outward, an I-section's web in its middle
        const za = zs[k] + bw / 2, zb = zs[k + 1] - bw / 2, back = channel ? (out < 0 ? xa : xa + bw) : xa + bw / 2 + (out * tw) / 2;
        if (zb - za < 1e-4) continue;
        box(xa, xa + bw, top - tf, top, za, zb, M.steel);
        box(xa, xa + bw, top - h, top - h + tf, za, zb, M.steel);
        box(Math.min(back, back - out * tw), Math.max(back, back - out * tw), top - h + tf, top - tf, za, zb, M.steel);
      }
    }
  }
  b.into(g);
  return g;
}

type BoxFn = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, m: THREE.Material) => void;

/** The bedplate with the diverting pulley under the mounts at y 0 (its top), the floor at −gap, the HEB beams under its
 *  legs `base` high [m]. */
function rinvioFrame3D(box: BoxFn, F: MachineFrame, gap: number, P: FramedPulley, M: LiftMaterials, base: number): void {
  const B = PROFILES[KV_VERT.rinvioBeam], h = B.h / 1000, w = B.b / 1000, tf = B.tf / 1000, tw = B.tw / 1000, leg = KV_VERT.rinvioLeg / 1000;
  const zs = F.zSheave / 1000, half = P.half / 1000, ov = KV_VERT.rinvioOverhang / 1000, floor = -gap, pads = KV_VERT.rinvioPads / 1000;
  // the maker's as long as it is made, from its end on the car's side (rinvio.ts makerRun); ours past the machine and the pulley
  const mk = P.frame.maker, ends = mk ? makerRun(mk).map((u) => (P.turn * u) / 1000) : null;
  const x0 = ends ? Math.min(...ends) : Math.min(F.x[0] / 1000, P.x - P.r) - ov, x1 = ends ? Math.max(...ends) : Math.max(F.x[1] / 1000, P.x + P.r) + ov;
  // its side beams under the machine's outer irons (or as wide as the maker's, centred on them), a beam of its own
  // under each iron they do not carry (src/shaft/rinvio.ts bedplateBeams): the bedframe's mounts stand on them
  const seat = bedplateBeams(F.beams, P.frame.maker?.width ?? KV_VERT.rinvioWidth), [z0, z1] = seat.edges.map((z) => z / 1000);
  const irons = seat.inner.map((z) => z / 1000);
  // a channel along x or z: flanges and web, its back outward
  const along = (a0: number, a1: number, zc: number, out: number): void => {
    const back = zc + (out * w) / 2, zf0 = Math.min(back, back - out * w), zf1 = Math.max(back, back - out * w);
    box(a0, a1, -tf, 0, zf0, zf1, M.steel);
    box(a0, a1, -h, -h + tf, zf0, zf1, M.steel);
    box(a0, a1, -h + tf, -tf, Math.min(back, back - out * tw), Math.max(back, back - out * tw), M.steel);
  };
  const across = (xc: number, out: number, za: number, zb: number): void => {
    const back = xc + (out * w) / 2, xf0 = Math.min(back, back - out * w), xf1 = Math.max(back, back - out * w);
    box(xf0, xf1, -tf, 0, za, zb, M.steel);
    box(xf0, xf1, -h, -h + tf, za, zb, M.steel);
    box(Math.min(back, back - out * tw), Math.max(back, back - out * tw), -h + tf, -tf, za, zb, M.steel);
  };
  along(x0, x1, z0 + w / 2, -1);
  along(x0, x1, z1 - w / 2, 1);
  across(x0 + w / 2, -1, z0 + w, z1 - w);
  across(x1 - w / 2, 1, z0 + w, z1 - w);
  for (const z of irons) along(x0 + w, x1 - w, z, z > zs ? 1 : -1);
  // the legs on their dampers: at the corners, or where its sides cross the HEB beams it bridges
  const legs = P.legs ?? [x0, x1 - leg].flatMap((x) => [z0, z1 - leg].map((z) => [x + leg / 2, z + leg / 2] as const));
  for (const [xc, zc] of legs) {
    const x = xc - leg / 2, z = zc - leg / 2;
    box(x, x + leg, floor + base + pads, -h, z, z + leg, M.galv);
    box(x - 0.01, x + leg + 0.01, floor + base, floor + base + pads, z - 0.01, z + leg + 0.01, M.rubber);
  }
  // the two plates the pulley's axle turns in, each hung from a short channel to the beam on its side: nothing crosses
  // the ropes' plane
  const axis = floor + P.frame.pulleyAxis / 1000, rails = [z0 + w / 2, ...irons, z1 - w / 2];
  for (const s of [-1, 1]) {
    // hung from the nearest beam on its side: its top welded under the bottom flange of a short channel run over the
    // plate's whole thickness to that beam's face, or under the beam's own flange when the beam reaches over the plate;
    // a plate risen between the beams (a pulley set high by hand) butts the channel's end with its whole section
    const za = zs + s * (half - 0.01), zb = zs + s * half, yTop = Math.min(0, Math.max(-h, axis + 0.09));
    const near = rails.reduce((a, r) => ((r - zb) * s > 0 && (r - a) * s < 0 ? r : a), s < 0 ? z0 + w / 2 : z1 - w / 2), beam = near - (s * w) / 2;
    box(P.x - 0.08, P.x + 0.08, axis - 0.07, yTop, Math.min(za, zb), Math.max(za, zb), M.galv);
    const from = yTop > -h + 1e-6 ? zb : za;
    if ((beam - from) * s > 1e-6) across(P.x, 1, Math.min(from, beam), Math.max(from, beam));
  }
}

/** The HEB beams on the shaft's walls (src/shaft/heb.ts) on the room's floor at `z0` [mm]: two H profiles across the
 *  shaft under the support, their ends in its walls; plan in the shaft's axes (the room's less where the shaft lies). */
export function hebBeams(b: Batch, lay: HebLayout, R: RoomInputs, z0: number, M: LiftMaterials): void {
  const P = PROFILES[lay.profile], [e0, e1] = lay.ends, alongX = lay.dir === 'x';
  for (const c of lay.at) {
    const put = (c0: number, c1: number, h0: number, h1: number): void => (alongX
      ? b.box(e0 - R.shaftX, c0 - R.shaftY, z0 + h0, e1 - R.shaftX, c1 - R.shaftY, z0 + h1, M.steel)
      : b.box(c0 - R.shaftX, e0 - R.shaftY, z0 + h0, c1 - R.shaftX, e1 - R.shaftY, z0 + h1, M.steel));
    put(c - P.b / 2, c + P.b / 2, 0, P.tf);
    put(c - P.tw / 2, c + P.tw / 2, P.tf, P.h - P.tf);
    put(c - P.b / 2, c + P.b / 2, P.h - P.tf, P.h);
  }
}
