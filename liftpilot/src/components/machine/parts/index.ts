// Geometry of a geared traction machine, in metres: bedplate on anti-vibration mounts, worm gearbox (worm below
// the wheel), drum brake with its magnet, springs and hand release, flange-shield motor with cooling fins,
// emergency handwheel on the shaft end and the traction sheave with its ropes. The machine is the calculator's
// example A: sheave D 560, 4 ropes of 10 mm, ratio 1:43, 7.5 kW, handwheel radius 0.2 m (src/calc/presets.ts);
// nothing here is a real product.
// Loaded only through boot.ts, after the prefers-reduced-motion and save-data gate of MachineStage.tsx.
import * as THREE from 'three/webgpu';
import type { MachineMaterials } from '../materials';
import { DIM } from './common';
import { bedplate, floorOpenings } from './frame';
import { gearbox } from './gearbox';
import { brake } from './brake';
import { motor, handwheel, conduit } from './motor';
import { sheave, ropes } from './sheave';

export { DIM, ROPE_LENGTH } from './common';
export { CONDUIT_END } from './motor';

export interface Machine {
  group: THREE.Group;
  sheave: THREE.Object3D;
  /** Parts that turn with the worm (i times faster than the sheave). */
  worm: THREE.Object3D[];
}

/** The machine on its bedplate; withRopes false leaves the ropes to the caller (the installation draws its own);
 *  `irons`: the bedplate's I-beams across Z (src/shaft/machine-shape.ts machineFrame: two under the gearbox and one past
 *  the sheave, the sheave between them). */
export function buildMachine(M: MachineMaterials, withRopes = true, irons: readonly number[] = [-DIM.zBeam, DIM.zBeam, 2 * DIM.zSheave - DIM.zBeam]): Machine {
  const group = new THREE.Group();
  const b = brake(M);
  const wheel = handwheel(M);
  wheel.position.set(0.99, DIM.yWorm, 0);
  const s = sheave(M);
  s.position.set(0, DIM.yWheel, DIM.zSheave);
  group.add(bedplate(M, irons), gearbox(M), b.group, motor(M), wheel, s, conduit(M));
  if (withRopes) group.add(floorOpenings(M), ropes(M));
  return { group, sheave: s, worm: [wheel, b.drum] };
}
