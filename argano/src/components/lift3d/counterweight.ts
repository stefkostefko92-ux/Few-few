// The counterweight: a steel frame with its filler plates, the guide shoes on its two rails, the hitch on top and the
// buffer plate below. Built in plan and heights from its buffer plate (millimetres); the group rides at that level.
// Loaded only through boot.ts (lazy).
import * as THREE from 'three/webgpu';
import type { Layout } from '@/shaft';
import { box } from './geom';
import type { LiftMaterials } from './materials';

export function buildCounterweight(L: Layout, M: LiftMaterials): THREE.Group {
  const g = new THREE.Group(), r = L.cw, H = L.inputs.vertical.cwH, along = r.w >= r.h;
  const post = 60, beam = 90;
  // frame: posts at the two ends (toward the rails), beams top and bottom
  if (along) {
    g.add(box(r.x, r.y, 0, r.x + post, r.y + r.h, H, M.steel), box(r.x + r.w - post, r.y, 0, r.x + r.w, r.y + r.h, H, M.steel));
  } else {
    g.add(box(r.x, r.y, 0, r.x + r.w, r.y + post, H, M.steel), box(r.x, r.y + r.h - post, 0, r.x + r.w, r.y + r.h, H, M.steel));
  }
  g.add(box(r.x, r.y, 0, r.x + r.w, r.y + r.h, beam, M.steel), box(r.x, r.y, H - beam, r.x + r.w, r.y + r.h, H, M.steel));
  // filler plates between the beams, with a small gap between each
  const n = Math.max(4, Math.round((H - 2 * beam) / 160)), step = (H - 2 * beam) / n, inset = 12;
  for (let i = 0; i < n; i++) {
    const z0 = beam + i * step + 4, z1 = beam + (i + 1) * step - 4;
    g.add(along ? box(r.x + post, r.y + inset, z0, r.x + r.w - post, r.y + r.h - inset, z1, M.cwFill) : box(r.x + inset, r.y + post, z0, r.x + r.w - inset, r.y + r.h - post, z1, M.cwFill));
  }
  // shoes at the rails, hitch on top, buffer plate below
  for (const rail of L.rails.filter((x) => x.kind === 'cw')) {
    const h = 110;
    for (const z of [30, H - h - 30]) g.add(box(rail.x - 30, rail.y - 30, z, rail.x + 30, rail.y + 30, z + h, M.rubber));
  }
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  g.add(box(cx - 70, cy - 40, H, cx + 70, cy + 40, H + 60, M.frame));
  g.add(box(cx - 80, cy - 60, -12, cx + 80, cy + 60, 0, M.steel));
  return g;
}
