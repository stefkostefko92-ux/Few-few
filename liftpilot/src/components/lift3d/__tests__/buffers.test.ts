// The buffers in 3D stand where the drawings put them (src/shaft/pit.ts): the plates under the car over the car
// buffers, the counterweight's under its place; and nothing fixed in the pit — the shaft, the rails with their
// brackets, the ladder, the stop switch, the lamp, the screen, the governor's tension weight and rope — stands in a
// buffer or on its base, with the software's places and with places set by hand.
// Motion: none, nothing is drawn here; the scene's prefers-reduced-motion handling is in LiftStage.tsx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { defaultInputs, layout, section, bufferPlan, type ShaftInputs } from '@/shaft';
import { Batch } from '../geom';
import { createLiftMaterials } from '../materials';
import { buildShaft } from '../shaft';
import { buildRails } from '../rails';
import { buildPit } from '../pit';
import { buildGovernor, governorSpot } from '../governor';
import { buildCar } from '../car';
import { buildBuffers } from '../buffers';

// the floors' labels are drawn on a canvas: under node, a blank one
if (!('document' in globalThis)) Object.assign(globalThis, { document: { createElement: () => ({ width: 0, height: 0, getContext: () => null }) } });

/** Triangles of a subtree whose bounds reach into the box (world metres). */
function intruders(root: THREE.Object3D, box: THREE.Box3): number {
  let n = 0;
  const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], t = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.getAttribute('position'), index = o.geometry.getIndex(), count = index ? index.count : pos.count;
    for (let i = 0; i + 2 < count; i += 3) {
      for (let j = 0; j < 3; j++) p[j].fromBufferAttribute(pos, index ? index.getX(i + j) : i + j).applyMatrix4(o.matrixWorld);
      if (t.setFromPoints(p).intersectsBox(box)) n++;
    }
  });
  return n;
}

/** A plan box [mm] between two heights [mm], a millimetre in from every side, in world metres (x, z up, −y). */
const worldBox = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number): THREE.Box3 =>
  new THREE.Box3(new THREE.Vector3((x0 + 1) / 1000, (z0 + 1) / 1000, -(y1 - 1) / 1000), new THREE.Vector3((x1 - 1) / 1000, (z1 - 1) / 1000, -(y0 + 1) / 1000));

const CASES: readonly (readonly [string, (I: ShaftInputs) => ShaftInputs])[] = [
  ['posizioni del software', (I) => I],
  ['contrappeso a sinistra', (I) => ({ ...I, cw: 'left' })],
  ['un ammortizzatore di cabina', (I) => ({ ...I, vertical: { ...I.vertical, carBuffers: 1 } })],
  ['quattro ammortizzatori di cabina', (I) => ({ ...I, vertical: { ...I.vertical, carBuffers: 4 } })],
  ['posizioni a mano', (I) => ({ ...I, plan: { bufX: 760, bufY: 900, bufSpan: 700, cwBufPos: 700 } })],
];

for (const [name, make] of CASES) {
  test(`ammortizzatori in 3D dove li mettono i disegni, liberi dalle parti fisse della fossa (${name})`, () => {
    const L = layout(make(defaultInputs(1600, 1750))), S = section(L), V = L.inputs.vertical, M = createLiftMaterials(), gov = governorSpot(L);
    const plan = bufferPlan(L), car = buildCar(L, M, null, gov, V.floors.map((f) => f.label));
    assert.deepEqual(car.bufferSpots.map((p) => [...p]), plan.spots.filter((s) => s.kind === 'car').map((s) => [...s.c]));
    const buffers = buildBuffers(L, S, M, car.bufferSpots);
    // the counterweight's buffer under its place: its pad's centre over the spot
    const cw = plan.spots.find((s) => s.kind === 'cw');
    assert.ok(cw);
    const fixed = new THREE.Group(), B = new Batch(), shaft = buildShaft(L, S, M, []);
    fixed.add(shaft.common, ...Object.values(shaft.sides), buildRails(L, S, M));
    buildPit(L, S, M, B);
    if (gov) fixed.add(buildGovernor(L, S, gov, null, M, B).group);
    B.into(fixed);
    for (const s of plan.spots) {
      const [x, y] = s.c, base = s.kind === 'car' ? V.carBufferBase : V.cwBufferBase, h = s.kind === 'car' ? V.carBufferH : V.cwBufferH, z0 = S.pitFloor;
      const foot = base > 0 ? 150 : 90, n = intruders(fixed, worldBox(x - foot, y - foot, x + foot, y + foot, z0, z0 + base)) + intruders(fixed, worldBox(x - 90, y - 90, x + 90, y + 90, z0 + base, z0 + base + h));
      assert.equal(n, 0, `${s.kind} a ${Math.round(x)}, ${Math.round(y)}: ${n} triangoli fissi nell'ammortizzatore`);
      // and the buffer is there: its own triangles fill its column
      assert.ok(intruders(buffers.group, worldBox(x - 60, y - 60, x + 60, y + 60, z0 + base + 10, z0 + base + h - 10)) > 0, `${s.kind}: ammortizzatore mancante`);
    }
  });
}
