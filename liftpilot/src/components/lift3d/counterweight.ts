// The counterweight: a frame of channel posts (toward its two rails) and beams, the cast-iron filler weights held by
// two tie rods and a clamp bar, sliding guide shoes on the rails (oil cups on the top ones), the rope hitch on the top
// beam (sockets over it, springs under it) or the cheeks of its pulley in a 2:1 roping, the buffer plate below. Built
// in plan and heights from its buffer plate (millimetres); the group rides at that level. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { RAILS, type Layout } from '@/shaft';
import { Batch, P } from './geom';
import { CHEEK } from './pulleys';
import { coil, guideShoe, type Hitch } from './sling';
import type { LiftMaterials } from './materials';

export function buildCounterweight(L: Layout, M: LiftMaterials, hitch: Hitch | null): THREE.Group {
  const g = new THREE.Group(), B = new Batch(), r = L.cw, H = L.inputs.vertical.cwH, along = r.w >= r.h;
  const len = along ? r.w : r.h, dep = along ? r.h : r.w, post = 60, beam = 90;
  // u along the counterweight between its rails, w across it
  const box = (u0: number, u1: number, w0: number, w1: number, z0: number, z1: number, m: THREE.Material): void => {
    if (along) B.box(r.x + u0, r.y + w0, z0, r.x + u1, r.y + w1, z1, m);
    else B.box(r.x + w0, r.y + u0, z0, r.x + w1, r.y + u1, z1, m);
  };
  const point = (u: number, w: number, z: number): readonly [number, number, number] => (along ? [r.x + u, r.y + w, z] : [r.x + w, r.y + u, z]);
  // posts: channels, webs outward, the fillers between their flanges; beams top and bottom
  for (const [u0, u1, e0, e1] of [[0, post, 0, 8], [len - post, len, len - 8, len]] as const) {
    box(u0, u1, 0, 8, 0, H, M.steel);
    box(u0, u1, dep - 8, dep, 0, H, M.steel);
    box(e0, e1, 8, dep - 8, 0, H, M.steel);
  }
  box(0, len, 0, dep, 0, beam, M.steel);
  box(0, len, 0, dep, H - beam, H, M.steel);
  // fillers up to the springs of the hitch, a small gap between each; two tie rods and the clamp bar over them
  const top = H - beam - (hitch?.kind === 'ropes' ? 190 : 0), n = Math.max(4, Math.round((top - beam) / 150)), step = (top - beam) / n;
  for (let i = 0; i < n; i++) box(post + 3, len - post - 3, 12, dep - 12, beam + i * step + 3, beam + (i + 1) * step - 3, M.cwFill);
  box(post, len - post, dep / 2 - 24, dep / 2 + 24, top, top + 18, M.steel);
  for (const u of [len * 0.3, len * 0.7]) {
    B.rod(point(u, dep / 2, beam), point(u, dep / 2, top + 48), 10, M.alu, 8);
    box(u - 16, u + 16, dep / 2 - 16, dep / 2 + 16, top + 18, top + 36, M.steel);
  }
  // guide shoes on its rails
  const { k, h } = RAILS[L.inputs.cwRail];
  for (const rail of L.rails.filter((x) => x.kind === 'cw')) {
    guideShoe(B, M, rail, k, h, 30, false);
    guideShoe(B, M, rail, k, h, H - 140, true);
  }
  // the hitch: the ropes end 60 mm over the top beam
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  if (hitch?.kind === 'ropes') {
    const xs = hitch.at.map((p) => p[0]), ys = hitch.at.map((p) => p[1]);
    B.box(Math.min(...xs) - 40, Math.min(...ys) - 40, H, Math.max(...xs) + 40, Math.max(...ys) + 40, H + 14, M.steel);
    const spring = coil(22, 4.5, 120, 5);
    for (const [x, y] of hitch.at) {
      B.box(x - 13, y - 9, H + 14, x + 13, y + 9, H + 150, M.galv);
      B.rod([x, y, H + 14], [x, y, H - beam - 165], 8, M.alu, 8);
      const base = P(x, y, H - beam - 125);
      B.add(spring.clone().translate(base.x, base.y, base.z), M.spring);
      B.box(x - 16, y - 16, H - beam - 160, x + 16, y + 16, H - beam - 130, M.steel);
    }
    spring.dispose();
  } else if (hitch?.kind === 'pulley') {
    // the cheeks (12 mm) that carry the pulley's axle, the hub between them (pulleys.ts CHEEK)
    const [ax, ay] = hitch.across, zAxle = H + 60 + hitch.r;
    for (const s of [-1, 1]) {
      const o = s * (hitch.width / 2 + CHEEK + 6), x = hitch.x + ax * o, y = hitch.y + ay * o;
      const [dx, dy] = [Math.abs(ay) * hitch.r * 0.55 + Math.abs(ax) * 6, Math.abs(ax) * hitch.r * 0.55 + Math.abs(ay) * 6];
      B.box(x - dx, y - dy, H, x + dx, y + dy, zAxle + 70, M.galv);
    }
    const o = hitch.width / 2 + 30;
    B.rod([hitch.x - ax * o, hitch.y - ay * o, zAxle], [hitch.x + ax * o, hitch.y + ay * o, zAxle], 22, M.alu, 16);
  } else B.box(cx - 70, cy - 40, H, cx + 70, cy + 40, H + 60, M.frame);
  B.box(cx - 80, cy - 60, -12, cx + 80, cy + 60, 0, M.steel);
  B.into(g);
  return g;
}
