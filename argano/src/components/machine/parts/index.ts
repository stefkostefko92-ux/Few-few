// Geometry of a geared traction machine, in metres: bedplate on anti-vibration mounts, worm gearbox (worm below
// the wheel), drum brake with its magnet, springs and hand release, flange-shield motor with cooling fins,
// emergency handwheel on the shaft end and the traction sheave with its ropes. The machine is the calculator's
// example A: sheave D 560, 4 ropes of 10 mm, ratio 1:43, 7.5 kW (src/calc/presets.ts); nothing here is a real
// product.
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

export interface Machine {
  group: THREE.Group;
  sheave: THREE.Object3D;
  /** Parts that turn with the worm (i times faster than the sheave). */
  worm: THREE.Object3D[];
}

export function buildMachine(M: MachineMaterials): Machine {
  const group = new THREE.Group();
  const b = brake(M);
  const wheel = handwheel(M);
  wheel.position.set(0.965, DIM.yWorm, 0);
  const s = sheave(M);
  s.position.set(0, DIM.yWheel, DIM.zSheave);
  group.add(bedplate(M), floorOpenings(M), gearbox(M), b.group, motor(M), wheel, s, ropes(M), conduit(M));
  return { group, sheave: s, worm: [wheel, b.drum] };
}
