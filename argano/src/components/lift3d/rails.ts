// Guide rails: T profiles of the design's sizes (foot b, blade height h and thickness k), their blades pointing at the
// car or the counterweight, from the pit floor up under the slab, joined by fishplates every 5 m (the rails' length)
// and fixed every 2.5 m by brackets: a plate behind the foot held by two clips, an angle out to the wall and its
// anchored wall plate; the bridge bracket of a side counterweight. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { RAILS, type Layout, type Rail } from '@/shaft';
import type { Section } from '@/shaft/section';
import { KV_VERT } from '@/shaft/norme-vert';
import { Batch } from './geom';
import type { LiftMaterials } from './materials';

const BRACKET_PITCH = 2500, RAIL_LENGTH = 5000;

const DIRS: Record<Rail['dir'], readonly [number, number]> = { right: [1, 0], left: [-1, 0], back: [0, 1], front: [0, -1] };

/** The T section in plan (millimetres): the blade's tip at the rail's point, the foot behind it. */
function railShape(r: Rail, b: number, h: number, k: number): THREE.Shape {
  const [dx, dy] = DIRS[r.dir], px = -dy, py = dx, tf = Math.max(8, 0.14 * h);
  const at = (a: number, c: number): THREE.Vector2 => new THREE.Vector2((r.x + a * dx + c * px) / 1000, (r.y + a * dy + c * py) / 1000);
  const pts = [at(0, -k / 2), at(0, k / 2), at(-h + tf, k / 2), at(-h + tf, b / 2), at(-h, b / 2), at(-h, -b / 2), at(-h + tf, -b / 2), at(-h + tf, -k / 2)];
  return new THREE.Shape(pts);
}

export function buildRails(L: Layout, S: Section, M: LiftMaterials): THREE.Group {
  const g = new THREE.Group(), B = new Batch(), I = L.inputs;
  const z0 = S.pitFloor, z1 = S.ceiling - KV_VERT.railTopGap;
  for (const r of L.rails) {
    const size = RAILS[r.kind === 'car' ? I.carRail : I.cwRail];
    const geo = new THREE.ExtrudeGeometry(railShape(r, size.b, size.h, size.k), { depth: (z1 - z0) / 1000, bevelEnabled: false });
    // shape in the (x, y) plan, extruded along +Z: turn it so the extrusion goes up and the plan y goes to −Z
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, z0 / 1000, 0);
    B.add(geo, M.rail);
    // in the rail's frame: a along the blade (from the back of the foot toward the tip), c across it
    const [dx, dy] = DIRS[r.dir], fx = r.x - dx * size.h, fy = r.y - dy * size.h;
    const span = (a0: number, a1: number, c0: number, c1: number, za: number, zb: number, m: THREE.Material): void => {
      const [p, q] = [[fx + dx * a0 - dy * c0, fy + dy * a0 + dx * c0], [fx + dx * a1 - dy * c1, fy + dy * a1 + dx * c1]];
      B.box(p[0], p[1], za, q[0], q[1], zb, m);
    };
    const half = size.b / 2, brackets: number[] = [];
    for (let z = z0 + 600; z < z1 - 200; z += BRACKET_PITCH) brackets.push(z);
    for (let z = z0 + RAIL_LENGTH; z < z1 - 300; z += RAIL_LENGTH) {
      if (brackets.some((b) => Math.abs(b - z) < 250)) continue;
      span(-14, 0, -half + 6, half - 6, z - 140, z + 140, M.steel);
    }
    for (const z of brackets) {
      // plate behind the foot, the two clips over the foot's edges
      span(-12, 0, -half - 30, half + 30, z, z + 150, M.galv);
      for (const s of [-1, 1]) span(0, 14, s * (half - 6), s * (half + 22), z + 50, z + 100, M.steel);
      // the angle out to the wall (or to the bridge) and the wall plate with its anchors
      const toWall = r.bracketAxis === 'x' ? r.bracketTo - fx : r.bracketTo - fy, along = r.bracketAxis === 'x' ? Math.abs(dx) > 0.5 : Math.abs(dy) > 0.5;
      if (along) {
        const a1 = toWall * (r.bracketAxis === 'x' ? dx : dy);
        span(Math.min(-12, a1), Math.max(-12, a1), -45, 45, z, z + 8, M.galv);
        span(Math.min(-12, a1), Math.max(-12, a1), 37, 45, z, z + 100, M.galv);
        span(a1 < 0 ? a1 : a1 - 12, a1 < 0 ? a1 + 12 : a1, -80, 80, z - 30, z + 170, M.galv);
      } else {
        // the wall lies across the blade: the angle runs beside the foot
        const c1 = toWall * (r.bracketAxis === 'x' ? -dy : dx);
        span(-60, -12, Math.min(0, c1), Math.max(0, c1), z, z + 8, M.galv);
        span(-20, -12, Math.min(0, c1), Math.max(0, c1), z, z + 100, M.galv);
        span(-110, 30, c1 < 0 ? c1 : c1 - 12, c1 < 0 ? c1 + 12 : c1, z - 30, z + 170, M.galv);
      }
    }
  }
  if (L.bridge) {
    const b = L.bridge;
    for (let z = z0 + 600; z < z1 - 200; z += BRACKET_PITCH) B.box(b.x - 40, b.y0, z, b.x + 40, b.y1, z + 120, M.steel);
  }
  B.into(g);
  return g;
}
