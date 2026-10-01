// Coordinates of the installation in 3D. The shaft engine works on the plan in millimetres (x along the front wall of
// entrance A, y into the shaft) and heights in millimetres from the lowest floor; the scene in metres with Y up and
// Z toward the viewer standing at entrance A: X = x, Y = z, Z = −y. Static parts are gathered in batches, merged into
// one mesh per material: a detailed model in a few draw calls. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Wall = 'front' | 'rear' | 'left' | 'right';
export type Point = readonly [number, number, number];

/** Plan point (x, y) at height z, millimetres → world metres. */
export const P = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x / 1000, z / 1000, -y / 1000);

/** A box between two corners in plan and height (millimetres, any order). */
export function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, material: THREE.Material): THREE.Mesh {
  const dx = Math.abs(x1 - x0) / 1000, dy = Math.abs(z1 - z0) / 1000, dz = Math.abs(y1 - y0) / 1000;
  const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(dx, 1e-4), Math.max(dy, 1e-4), Math.max(dz, 1e-4)), material);
  m.position.copy(P((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** The geometry of such a box, in place. */
export function boxGeometry(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(Math.max(Math.abs(x1 - x0) / 1000, 1e-4), Math.max(Math.abs(z1 - z0) / 1000, 1e-4), Math.max(Math.abs(y1 - y0) / 1000, 1e-4));
  const c = P((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g.translate(c.x, c.y, c.z);
}

/** A round bar of radius r from a to b (plan and height, millimetres), in place. */
export function rodGeometry(a: Point, b: Point, r: number, segments = 12): THREE.BufferGeometry {
  const pa = P(a[0], a[1], a[2]), pb = P(b[0], b[1], b[2]), axis = pb.clone().sub(pa), len = axis.length();
  const g = new THREE.CylinderGeometry(r / 1000, r / 1000, Math.max(len, 1e-4), segments);
  if (len > 1e-9) g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.divideScalar(len)));
  const m = pa.add(pb).multiplyScalar(0.5);
  return g.translate(m.x, m.y, m.z);
}

/** Along a wall: the wall's axis coordinate u (x on front and rear walls, y on side walls) and the depth v from the
 *  wall's inner face into the shaft, turned into plan x, y. */
export function onWall(wall: Wall, W: number, D: number, u: number, v: number): readonly [number, number] {
  if (wall === 'front') return [u, v];
  if (wall === 'rear') return [u, D - v];
  if (wall === 'left') return [v, u];
  return [W - v, u];
}

/** A box laid along a wall: [u0, u1] along it, [v0, v1] from its inner face into the shaft, [z0, z1] high. */
export function wallBox(wall: Wall, W: number, D: number, u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, material: THREE.Material): THREE.Mesh {
  const [ax, ay] = onWall(wall, W, D, u0, v0), [bx, by] = onWall(wall, W, D, u1, v1);
  return box(ax, ay, z0, bx, by, z1, material);
}

/** Static parts gathered by material and merged into one mesh each (the parts are freed once merged). */
export class Batch {
  private readonly parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(geometry: THREE.BufferGeometry, material: THREE.Material): void {
    const list = this.parts.get(material);
    if (list) list.push(geometry);
    else this.parts.set(material, [geometry]);
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, material: THREE.Material): void {
    if (Math.abs(x1 - x0) > 0.1 && Math.abs(y1 - y0) > 0.1 && Math.abs(z1 - z0) > 0.1) this.add(boxGeometry(x0, y0, z0, x1, y1, z1), material);
  }

  wallBox(wall: Wall, W: number, D: number, u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, material: THREE.Material): void {
    const [ax, ay] = onWall(wall, W, D, u0, v0), [bx, by] = onWall(wall, W, D, u1, v1);
    this.box(ax, ay, z0, bx, by, z1, material);
  }

  rod(a: Point, b: Point, r: number, material: THREE.Material, segments = 12): void {
    this.add(rodGeometry(a, b, r, segments), material);
  }

  /** A plate along a wall from u0 to u1 whose section runs from a to b, each (v from the wall, z), `thick` thick. */
  plate(wall: Wall, W: number, D: number, u0: number, u1: number, a: readonly [number, number], b: readonly [number, number], thick: number, material: THREE.Material): void {
    const um = (u0 + u1) / 2, [ax, ay] = onWall(wall, W, D, um, a[0]), [bx, by] = onWall(wall, W, D, um, b[0]);
    const pa = P(ax, ay, a[1]), pb = P(bx, by, b[1]), s = pb.clone().sub(pa), len = s.length();
    if (len < 1e-6) return;
    const [ox, oy] = onWall(wall, W, D, 0, 0), [ux, uy] = onWall(wall, W, D, 1, 0);
    const u = P(ux, uy, 0).sub(P(ox, oy, 0)).normalize(), n = new THREE.Vector3().crossVectors(u, s.divideScalar(len));
    const g = new THREE.BoxGeometry(Math.abs(u1 - u0) / 1000, len, thick / 1000);
    this.add(g.applyMatrix4(new THREE.Matrix4().makeBasis(u, s, n).setPosition(pa.add(pb).multiplyScalar(0.5))), material);
  }

  /** The merged meshes into the group. */
  into(group: THREE.Object3D, castShadow = true): void {
    for (const [material, list] of this.parts) {
      // every part indexed, or none (extrusions are not): the merge needs one or the other
      const flat = list.some((g) => !g.index) ? list.map((g) => (g.index ? g.toNonIndexed() : g)) : list;
      const merged: THREE.BufferGeometry | null = mergeGeometries(flat, false);
      for (const g of new Set([...list, ...flat])) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      // lit faces of lamps and buttons cast no shadow (nor need a shadow shader)
      mesh.castShadow = castShadow && !(material instanceof THREE.MeshBasicNodeMaterial);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.parts.clear();
  }
}

/** Frees the geometries of a subtree (materials are shared and freed by their owner). Sprites are the exception:
 *  three.js gives every sprite one shared geometry, which must stay; their material and texture are their own. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Sprite) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if ('map' in m && m.map instanceof THREE.Texture) m.map.dispose();
        m.dispose();
      }
    } else if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) o.geometry.dispose();
  });
}
