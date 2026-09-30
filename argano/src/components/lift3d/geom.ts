// Coordinates of the installation in 3D. The shaft engine works on the plan in millimetres (x along the front wall of
// entrance A, y into the shaft) and heights in millimetres from the lowest floor; the scene in metres with Y up and
// Z toward the viewer standing at entrance A: X = x, Y = z, Z = −y.
// Loaded only through boot.ts (lazy).
import * as THREE from 'three/webgpu';

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

/** Along a wall: the wall's axis coordinate u (x on front and rear walls, y on side walls) and the depth v from the
 *  wall's inner face into the shaft, turned into plan x, y. */
export function onWall(wall: 'front' | 'rear' | 'left' | 'right', W: number, D: number, u: number, v: number): readonly [number, number] {
  if (wall === 'front') return [u, v];
  if (wall === 'rear') return [u, D - v];
  if (wall === 'left') return [v, u];
  return [W - v, u];
}

/** A box laid along a wall: [u0, u1] along it, [v0, v1] from its inner face into the shaft, [z0, z1] high. */
export function wallBox(wall: 'front' | 'rear' | 'left' | 'right', W: number, D: number, u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, material: THREE.Material): THREE.Mesh {
  const [ax, ay] = onWall(wall, W, D, u0, v0), [bx, by] = onWall(wall, W, D, u1, v1);
  return box(ax, ay, z0, bx, by, z1, material);
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
