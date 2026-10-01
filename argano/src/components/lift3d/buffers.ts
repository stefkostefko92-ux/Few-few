// Spring buffers in the pit: the car's under its buffer plates, the counterweight's under its own, each on a
// pedestal striped yellow and black: a base cup, the spring, and the striking cup with its rubber pad, which rides
// down with the compression the simulation gives. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import type { Layout } from '@/shaft';
import type { Section } from '@/shaft/section';
import { Batch, P } from './geom';
import { coil } from './sling';
import type { LiftMaterials } from './materials';

export interface BufferModel {
  group: THREE.Group;
  /** compression of the car buffers and of the counterweight buffer [m] */
  set(car: number, cw: number): void;
}

// spring: coil radius, wire, turns [mm]; cups and pad heights [mm]
const COIL = 70, WIRE = 12, TURNS = 6, BASE_CUP = 25, TOP_CUP = 28, PAD = 22;

export function buildBuffers(L: Layout, S: Section, M: LiftMaterials, carSpots: readonly (readonly [number, number])[]): BufferModel {
  const g = new THREE.Group(), B = new Batch(), V = L.inputs.vertical, z0 = S.pitFloor;
  const springs: { mesh: THREE.Mesh; top: THREE.Group; z: number; h: number; car: boolean }[] = [];
  const geo = coil(COIL, WIRE, 1000, TURNS);
  const cupGeo = new THREE.CylinderGeometry(0.085, 0.09, TOP_CUP / 1000, 28).translate(0, -(PAD + TOP_CUP / 2) / 1000, 0);
  const padGeo = new THREE.CylinderGeometry(0.068, 0.072, PAD / 1000, 24).translate(0, -PAD / 2000, 0);
  const one = (x: number, y: number, base: number, h: number, car: boolean): void => {
    if (base > 0) {
      B.box(x - 150, y - 150, z0, x + 150, y + 150, z0 + 12, M.steel);
      B.box(x - 125, y - 125, z0 + 12, x + 125, y + 125, z0 + base - 12, M.hazard);
      B.box(x - 140, y - 140, z0 + base - 12, x + 140, y + 140, z0 + base, M.steel);
    }
    B.rod([x, y, z0 + base], [x, y, z0 + base + BASE_CUP], 95, M.steel, 28);
    B.rod([x, y, z0 + base + BASE_CUP], [x, y, z0 + base + BASE_CUP + 40], 40, M.steel, 20);
    // the spring from the base cup to the striking cup; the striking cup and its pad on top
    const spring = new THREE.Mesh(geo, M.spring);
    spring.position.copy(P(x, y, z0 + base + BASE_CUP));
    spring.castShadow = true;
    const top = new THREE.Group(), cup = new THREE.Mesh(cupGeo, M.steel), pad = new THREE.Mesh(padGeo, M.rubber);
    for (const m of [cup, pad]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    top.add(cup, pad);
    top.position.copy(P(x, y, z0 + base + h));
    g.add(spring, top);
    springs.push({ mesh: spring, top, z: z0 + base, h, car });
  };
  for (const [x, y] of carSpots) one(x, y, V.carBufferBase, V.carBufferH, true);
  one(L.cw.x + L.cw.w / 2, L.cw.y + L.cw.h / 2, V.cwBufferBase, V.cwBufferH, false);
  B.into(g);
  // the buffer's height h runs from its base to the top of the pad; the spring fills it but for the cups and pad
  const set = (car: number, cw: number): void => {
    for (const s of springs) {
      const free = s.h - BASE_CUP - TOP_CUP - PAD, x = Math.min(Math.max(s.car ? car * 1000 : cw * 1000, 0), free - 20);
      s.mesh.scale.set(1, (free - x) / 1000, 1);
      s.top.position.y = (s.z + s.h - x) / 1000;
    }
  };
  set(0, 0);
  return { group: g, set };
}
