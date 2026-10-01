// The fasteners of Panev's brackets, as much of them as shows in the shaft: ISO 4017 M10 hex bolts on ISO 7089
// washers, ISO 4032 nuts with the thread's end standing out, the wall anchors' heads, and the forged rail clip
// "brida a T" N1 (its head with the nose on the rail's foot and the heel pad on the bracket, the shank through the
// bracket's slot). Each is built in millimetres with +Y out of the face it bears on (and, for the clip, +X away from
// the rail, +Z along it), then placed in metres by a matrix; a mirroring matrix turns the triangles back to face out.
// Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { N1 } from '@/shaft/staffe';
import type { Batch } from './geom';

/** ISO 4017 / 4032 / 7089, M10: across flats, head and nut heights, washer; N1 (src/shaft/staffe.ts): the clip after
 *  the owner's part. */
export const M10 = { s: 16, k: 6.4, m: 8.4, washer: 20, washerH: 2 } as const;

export { N1 };

const cyl = (r: number, y0: number, y1: number, seg: number): THREE.BufferGeometry => new THREE.CylinderGeometry(r, r, y1 - y0, seg).translate(0, (y0 + y1) / 2, 0);
const hexagon = (s: number, y0: number, y1: number): THREE.BufferGeometry => cyl(s / Math.sqrt(3), y0, y1, 6).rotateY(Math.PI / 6);
const metres = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry => {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of flat) if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  const merged = mergeGeometries(flat, false);
  if (!merged) throw new Error('fastener parts do not merge');
  return merged.scale(0.001, 0.001, 0.001);
};

let cache: Record<'head' | 'nut' | 'anchor' | 'clip', THREE.BufferGeometry> | null = null;

/** The clip's forged head: the coffin outline, wide at the nose and tapered at the heel, rounded, between zb and top. */
function clipHead(): THREE.BufferGeometry {
  const c = N1, zb = c.foot + c.relief, r = 0.8;
  const pts = [[-c.nose, -c.width / 2], [0, -c.width / 2], [c.heel, -c.tip / 2], [c.heel, c.tip / 2], [0, c.width / 2], [-c.nose, c.width / 2]];
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const head = new THREE.ExtrudeGeometry(shape, { depth: c.top - zb - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelOffset: -r, bevelSegments: 2, curveSegments: 1 });
  // drawn in (x, across), extruded along +z: turn it so the extrusion stands up out of the bracket
  return head.rotateX(-Math.PI / 2).translate(0, zb + r, 0);
}

function parts(): NonNullable<typeof cache> {
  if (cache) return cache;
  const { s, k, m, washer, washerH } = M10;
  cache = {
    head: metres([cyl(washer / 2, 0, washerH, 16), hexagon(s, washerH, washerH + k)]),
    nut: metres([cyl(washer / 2, 0, washerH, 16), hexagon(s, washerH, washerH + m), cyl(4.6, washerH + m, washerH + m + 3, 8)]),
    anchor: metres([cyl(12, 0, 2.5, 16), hexagon(18, 2.5, 10)]),
    clip: metres([
      clipHead(),
      new THREE.BoxGeometry(N1.heel - 1.2 - N1.pad, N1.foot + N1.relief, N1.tip - 2.4).translate((N1.heel - 1.2 + N1.pad) / 2, (N1.foot + N1.relief) / 2, 0),
      new THREE.BoxGeometry(3, N1.relief, 16.4).translate(-N1.nose + 2.5, N1.foot + N1.relief / 2, 0),
      cyl(5, -N1.shank, 0, 10),
    ]),
  };
  return cache;
}

/** Adds a geometry placed by `matrix`, its triangles turned back to face out when the matrix mirrors. */
export function place(B: Batch, geo: THREE.BufferGeometry, material: THREE.Material, matrix: THREE.Matrix4): void {
  const g = geo.clone().applyMatrix4(matrix);
  if (matrix.determinant() < 0) {
    const index = g.getIndex();
    if (index) {
      const a = index.array;
      for (let i = 0; i < a.length; i += 3) [a[i + 1], a[i + 2]] = [a[i + 2], a[i + 1]];
    } else {
      for (const name of Object.keys(g.attributes)) {
        const attr = g.getAttribute(name), n = attr.itemSize;
        for (let i = 0; i < attr.count; i += 3) for (let j = 0; j < n; j++) {
          const t = attr.getComponent(i + 1, j);
          attr.setComponent(i + 1, j, attr.getComponent(i + 2, j));
          attr.setComponent(i + 2, j, t);
        }
      }
    }
  }
  B.add(g, material);
}

/** A matrix placing a fastener at `at` [m] with its +Y along `out`, its +X along `x` (any vector not along `out`). */
export function frameAt(at: THREE.Vector3, out: THREE.Vector3, x: THREE.Vector3): THREE.Matrix4 {
  const Y = out.clone().normalize(), X = x.clone().sub(Y.clone().multiplyScalar(x.dot(Y))).normalize(), Z = new THREE.Vector3().crossVectors(X, Y);
  return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(at);
}

export type Fastener = 'head' | 'nut' | 'anchor' | 'clip';

/** One fastener into the batch. */
export function fastener(B: Batch, kind: Fastener, material: THREE.Material, matrix: THREE.Matrix4): void {
  place(B, parts()[kind], material, matrix);
}
