// Guide rails: T profiles of the design's sizes (foot b, blade height h and thickness k), their blades pointing at the
// car or the counterweight, from the pit floor up under the slab, fixed to the walls by brackets every 2.5 m; the
// bridge bracket of a side counterweight. Loaded only through boot.ts (lazy).
import * as THREE from 'three/webgpu';
import { RAILS, type Layout, type Rail } from '@/shaft';
import type { Section } from '@/shaft/section';
import { KV_VERT } from '@/shaft/norme-vert';
import { box } from './geom';
import type { LiftMaterials } from './materials';

const BRACKET_PITCH = 2500;

const DIRS: Record<Rail['dir'], readonly [number, number]> = { right: [1, 0], left: [-1, 0], back: [0, 1], front: [0, -1] };

/** The T section in plan (millimetres): the blade's tip at the rail's point, the foot behind it. */
function railShape(r: Rail, b: number, h: number, k: number): THREE.Shape {
  const [dx, dy] = DIRS[r.dir], px = -dy, py = dx, tf = Math.max(8, 0.14 * h);
  const at = (a: number, c: number): THREE.Vector2 => new THREE.Vector2((r.x + a * dx + c * px) / 1000, (r.y + a * dy + c * py) / 1000);
  const pts = [at(0, -k / 2), at(0, k / 2), at(-h + tf, k / 2), at(-h + tf, b / 2), at(-h, b / 2), at(-h, -b / 2), at(-h + tf, -b / 2), at(-h + tf, -k / 2)];
  return new THREE.Shape(pts);
}

export function buildRails(L: Layout, S: Section, M: LiftMaterials): THREE.Group {
  const g = new THREE.Group(), I = L.inputs;
  const z0 = S.pitFloor, z1 = S.ceiling - KV_VERT.railTopGap;
  for (const r of L.rails) {
    const size = RAILS[r.kind === 'car' ? I.carRail : I.cwRail];
    const geo = new THREE.ExtrudeGeometry(railShape(r, size.b, size.h, size.k), { depth: (z1 - z0) / 1000, bevelEnabled: false });
    // shape in the (x, y) plan, extruded along +Z: turn it so the extrusion goes up and the plan y goes to −Z
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, z0 / 1000, 0);
    const mesh = new THREE.Mesh(geo, M.rail);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    // brackets from the foot to the wall (or to the bridge)
    const [dx, dy] = DIRS[r.dir], fx = r.x - dx * size.h, fy = r.y - dy * size.h;
    for (let z = z0 + 600; z < z1 - 200; z += BRACKET_PITCH) {
      if (r.bracketAxis === 'x') g.add(box(Math.min(fx, r.bracketTo), fy - 45, z, Math.max(fx, r.bracketTo), fy + 45, z + 120, M.steel));
      else g.add(box(fx - 45, Math.min(fy, r.bracketTo), z, fx + 45, Math.max(fy, r.bracketTo), z + 120, M.steel));
    }
  }
  if (L.bridge) {
    const b = L.bridge;
    for (let z = z0 + 600; z < z1 - 200; z += BRACKET_PITCH) g.add(box(b.x - 40, b.y0, z, b.x + 40, b.y1, z + 120, M.steel));
  }
  return g;
}
