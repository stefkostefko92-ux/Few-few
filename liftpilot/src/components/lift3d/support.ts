// The machine's support in 3D (src/shaft/support.ts), as the drawings of the machine room draw it: levelling shims,
// a frame of two profiles (on steel packs when set higher than the profile), two beams from wall to wall borne 150 mm
// in the walls (clear of the floor when higher than their profile: a machine not standing on the floor), steel plates
// or a concrete plinth under the mounts, rubber pads under the mounts on all but the shims. Built in a group placed
// and turned as the machine's bedplate: x along the machine (the rope drop line, 0 at the sheave), y up from the
// mounts' underside, z across, in metres. Loaded only through boot.ts (lazy).
import * as THREE from 'three/webgpu';
import { KV_VERT, PROFILES, hasProfile, isChannel, padsOf, profileOf, supportSpan, type MachineSupport, type Profile } from '@/shaft';
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

/**
 * The support under the machine of frame `F` (the generic one scaled to its sheave, or a maker's on our bedframe) whose
 * mounts stand `gap` metres over the floor. `walls`: the room's walls along the machine's x from the sheave [mm] (the
 * beams' bearings); null without a room.
 */
export function buildSupport(sup: MachineSupport, F: MachineFrame, D: number, gap: number, walls: readonly [number, number] | null, M: LiftMaterials): THREE.Group {
  const g = new THREE.Group(), b = new Batch(), pads = padsOf(sup) / 1000, top = -pads, beams = F.beams.map((z) => z / 1000), mid = (beams[0] + beams[1]) / 2, s = F.shape ? 1 : F.s;
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

  if (sup.kind === 'shims') atMounts(0.06 * s, 0.05 * s, -gap, 0, M.galv);
  else atMounts(0.06 * s, 0.05 * s, top, 0, M.rubber);
  const span = supportSpan(sup, D, F.shape), floor = -gap;
  if (sup.kind === 'plates') atMounts(0.09 * s, 0.06 * s, floor, top, M.galv);
  if (sup.kind === 'plinth' && span) for (const [z0, z1] of F.plinth) box(span[0] / 1000, span[1] / 1000, floor, top, z0 / 1000, z1 / 1000, M.slab);
  if (hasProfile(sup)) {
    const name = profileOf(sup), P = PROFILES[name], h = P.h / 1000, bear = KV_VERT.supportBearing / 1000;
    const [x0, x1] = sup.kind === 'beams' && walls ? [walls[0] / 1000 - bear, walls[1] / 1000 + bear] : span ? [span[0] / 1000, span[1] / 1000] : [MOUNTS[0] - 0.15, MOUNTS[1] + 0.15];
    for (const z of beams) {
      profile(P, isChannel(name), x0, x1, top, z);
      // a frame set higher than its profile stands on steel packs at its ends
      if (sup.kind === 'frame' && top - h - floor > 1e-3) for (const x of [x0, x1 - 0.1]) box(x, x + 0.1, floor, top - h, z - P.b / 2000, z + P.b / 2000, M.galv);
    }
  }
  b.into(g);
  return g;
}
