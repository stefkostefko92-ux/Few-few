// The car passes every landing: nothing of its entrances may meet the landing's hardware, except the coupler's vanes,
// between which the lock's rollers go. The car's travel sweeps every height, so the check is in plan: the cells of a
// millimetre that the parts of a car entrance and of the landing entrance on the same wall cover, along the wall (u) and
// from it (v), never coincide. The vanes and the rollers do share v (the coupler takes the rollers), never u.
// Motion: none, nothing is drawn here; the scene's prefers-reduced-motion handling is in LiftStage.tsx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { defaultInputs, layout, type DoorLayout, type Layout } from '@/shaft';
import { Batch } from '../geom';
import { createLiftMaterials, type Side } from '../materials';
import { carEntrance } from '../car';
import { landingEntrance } from '../shaft';

/** u along the wall and v from it [mm] of a scene point (metres, Y up, Z = −y). */
function plan(wall: Side, W: number, D: number, p: THREE.Vector3): readonly [number, number] {
  const x = p.x * 1000, y = -p.z * 1000;
  if (wall === 'front') return [x, y];
  if (wall === 'rear') return [x, D - y];
  if (wall === 'left') return [y, x];
  return [y, W - x];
}

/** The cells (u · 100000 + v) under the triangles of a subtree, v up to vMax; each triangle shrunk by 0.3 mm, so parts
 *  that only touch do not meet. */
function cells(root: THREE.Object3D, wall: Side, W: number, D: number, vMax: number): Set<number> {
  const out = new Set<number>(), p = new THREE.Vector3();
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.getAttribute('position'), index = o.geometry.getIndex(), n = index ? index.count : pos.count;
    for (let i = 0; i + 2 < n; i += 3) {
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (let j = 0; j < 3; j++) {
        p.fromBufferAttribute(pos, index ? index.getX(i + j) : i + j).applyMatrix4(o.matrixWorld);
        const [u, v] = plan(wall, W, D, p);
        u0 = Math.min(u0, u);
        u1 = Math.max(u1, u);
        v0 = Math.min(v0, v);
        v1 = Math.max(v1, v);
      }
      for (let u = Math.floor(u0 + 0.3); u < Math.ceil(u1 - 0.3); u++) {
        for (let v = Math.floor(v0 + 0.3); v < Math.ceil(Math.min(v1, vMax) - 0.3); v++) out.add(u * 100000 + v);
      }
    }
  });
  return out;
}

/** The car's outer face from the wall of an entrance [mm]. */
function carFace(L: Layout, wall: Side): number {
  const c = L.car, { W, D } = L.inputs;
  return { front: c.y, rear: D - (c.y + c.h), left: c.x, right: W - (c.x + c.w) }[wall];
}

/** The two entrances on the wall of a door, built apart: the car's and the landing's; each as a group in place. */
function entrances(L: Layout, d: DoorLayout): { car: THREE.Group; landing: THREE.Group } {
  const M = createLiftMaterials(), I = L.inputs, car = new THREE.Group(), landing = new THREE.Group();
  const B = new Batch(), C = new Batch();
  car.add(carEntrance(B, M, I, d, carFace(L, d.wall), I.carWall, I.vertical.carOutH).group);
  landing.add(landingEntrance(C, M, I, d, 0).group);
  B.into(car);
  C.into(landing);
  return { car, landing };
}

const VARIANTS: readonly [string, Partial<Layout['inputs']>][] = [
  ['una porta T2', {}],
  ['porta centrale C2', { door: 'C2' }],
  ['due accessi opposti', { entrances: 'opposite' }],
  ['due accessi adiacenti', { entrances: 'adjacent', side2: 'right' }],
  ['luce tra le soglie 22 mm', { sillGap: 22 }],
  ['luce tra le soglie 35 mm', { sillGap: 35 }],
  ['soglia di piano profonda 100 mm', { landingDepth: 100 }],
];

for (const [name, extra] of VARIANTS) {
  test(`porte: la cabina passa davanti al piano senza toccarlo (${name})`, () => {
    const L = layout({ ...defaultInputs(1600, 1750), ...extra }), I = L.inputs, v0 = I.landingDepth + I.sillGap;
    assert.ok(L.doors.length > 0);
    for (const d of L.doors) {
      const { car, landing } = entrances(L, d), vMax = v0 + 60;
      const a = cells(car, d.wall, I.W, I.D, vMax), b = cells(landing, d.wall, I.W, I.D, vMax);
      const shared = [...a].filter((c) => b.has(c));
      const at = shared.slice(0, 3).map((c) => `u ${Math.floor(c / 100000)} v ${c % 100000}`).join(', ');
      assert.equal(shared.length, 0, `${d.wall}: ${shared.length} mm² in comune (${at})`);
      // the coupler takes the lock's rollers: both reach the band from v0 − 14 to v0 − 6
      const band = (s: Set<number>): boolean => [...s].some((c) => c % 100000 >= v0 - 14 && c % 100000 < v0 - 6);
      assert.ok(band(a) && band(b), `${d.wall}: le lame del accoppiatore e i rulli della serratura si incontrano`);
    }
  });
}
