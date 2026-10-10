// Buffers in the pit: the car's under its buffer plates, the counterweight's under its own, each on a pedestal striped
// yellow and black and of its type: a spring (a base cup, the spring, the striking cup with its rubber pad), a
// polyurethane pad on its plate that squashes and bulges, or a hydraulic buffer (the cylinder, the chromed plunger
// sliding into it, its pad); each moves with the compression the simulation gives, never past the stroke the section
// counts (Section.carStroke/cwStroke: a pad's 90 % of its whole height H, UNI EN 81-20:2020 5.8.2.1.2.2), its top
// always where the car's or the counterweight's plate is. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { bufferPlan, bufferType, type BufferType, type Layout } from '@/shaft';
import { puPlate } from '@/shaft/buffers';
import { bufferFoot } from '@/shaft/pit';
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
  // each buffer: what moves, its base, height and stroke, its pad's plate [mm]
  const springs: { mesh: THREE.Mesh; top: THREE.Group; z: number; h: number; stroke: number; plate: number; car: boolean; type: BufferType }[] = [];
  const geo = coil(COIL, WIRE, 1000, TURNS);
  const cupGeo = new THREE.CylinderGeometry(0.085, 0.09, TOP_CUP / 1000, 28).translate(0, -(PAD + TOP_CUP / 2) / 1000, 0);
  const padGeo = new THREE.CylinderGeometry(0.068, 0.072, PAD / 1000, 24).translate(0, -PAD / 2000, 0);
  // a polyurethane pad of unit height from its foot (scaled to its height, wider as it squashes), a plunger of unit length
  const puGeo = new THREE.CylinderGeometry(0.06, 0.064, 1, 36, 1).translate(0, 0.5, 0);
  const plungerGeo = new THREE.CylinderGeometry(0.028, 0.028, 1, 24).translate(0, -0.5, 0);
  const one = (x: number, y: number, base: number, h: number, car: boolean, type: BufferType): void => {
    const stroke = car ? S.carStroke : S.cwStroke;
    if (base > 0) {
      const f = bufferFoot(base);
      B.box(x - f, y - f, z0, x + f, y + f, z0 + 12, M.steel);
      B.box(x - 125, y - 125, z0 + 12, x + 125, y + 125, z0 + base - 12, M.hazard);
      B.box(x - 140, y - 140, z0 + base - 12, x + 140, y + 140, z0 + base, M.steel);
    }
    const zb = z0 + base;
    if (type === 'pu') {
      // the pad on its plate (within H, as the section draws it), squashed by the compression
      const plate = puPlate(h, stroke);
      if (plate > 0) B.rod([x, y, zb], [x, y, zb + plate], 85, M.steel, 28);
      const pad = new THREE.Mesh(puGeo, M.pu);
      pad.position.copy(P(x, y, zb + plate));
      pad.castShadow = true;
      pad.receiveShadow = true;
      g.add(pad);
      springs.push({ mesh: pad, top: new THREE.Group(), z: zb, h, stroke, plate, car, type });
      return;
    }
    if (type === 'oil') {
      // the cylinder up to 58 % of the height, the plunger out of it with its pad on top
      const body = 0.58 * h;
      B.rod([x, y, zb], [x, y, zb + body], 55, M.red, 28);
      B.rod([x, y, zb + body - 8], [x, y, zb + body], 60, M.steel, 28);
      const top = new THREE.Group(), plunger = new THREE.Mesh(plungerGeo, M.chrome), pad = new THREE.Mesh(padGeo, M.rubber), cup = new THREE.Mesh(cupGeo, M.steel);
      for (const m of [plunger, pad, cup]) m.castShadow = true;
      plunger.scale.set(1, (h - body - PAD - TOP_CUP + 40) / 1000, 1);
      top.add(plunger, cup, pad);
      top.position.copy(P(x, y, zb + h));
      g.add(top);
      springs.push({ mesh: plunger, top, z: zb, h, stroke, plate: 0, car, type });
      return;
    }
    B.rod([x, y, zb], [x, y, zb + BASE_CUP], 95, M.steel, 28);
    B.rod([x, y, zb + BASE_CUP], [x, y, zb + BASE_CUP + 40], 40, M.steel, 20);
    // the spring from the base cup to the striking cup; the striking cup and its pad on top
    const spring = new THREE.Mesh(geo, M.spring);
    spring.position.copy(P(x, y, zb + BASE_CUP));
    spring.castShadow = true;
    const top = new THREE.Group(), cup = new THREE.Mesh(cupGeo, M.steel), pad = new THREE.Mesh(padGeo, M.rubber);
    for (const m of [cup, pad]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    top.add(cup, pad);
    top.position.copy(P(x, y, zb + h));
    g.add(spring, top);
    springs.push({ mesh: spring, top, z: zb, h, stroke, plate: 0, car, type });
  };
  const carType = bufferType(V, 'car'), cwType = bufferType(V, 'cw');
  for (const [x, y] of carSpots) one(x, y, V.carBufferBase, V.carBufferH, true, carType);
  const [wx, wy] = bufferPlan(L).spots.find((s) => s.kind === 'cw')?.c ?? [L.cw.x + L.cw.w / 2, L.cw.y + L.cw.h / 2];
  one(wx, wy, V.cwBufferBase, V.cwBufferH, false, cwType);
  B.into(g);
  // the buffer's height h runs from its base to its top, which goes down by the compression c (at most the stroke): a
  // spring fills it but for the cups and pad, a pad squashes from its plate (bulging; fully compressed, the plate and
  // what is left of the pad fill the last 10 % of h), a plunger slides into its cylinder
  const set = (car: number, cw: number): void => {
    for (const s of springs) {
      const c = Math.min(Math.max(s.car ? car * 1000 : cw * 1000, 0), s.stroke);
      if (s.type === 'pu') {
        const free = s.h - s.plate, left = free - c, k = 1 + (0.35 * c) / free;
        s.mesh.visible = left > 0.01;
        s.mesh.scale.set(k, Math.max(left, 0.01) / 1000, k);
        continue;
      }
      if (s.type === 'oil') {
        s.top.position.y = (s.z + s.h - c) / 1000;
        continue;
      }
      const free = s.h - BASE_CUP - TOP_CUP - PAD;
      s.mesh.scale.set(1, Math.max(free - c, 1) / 1000, 1);
      s.top.position.y = (s.z + s.h - c) / 1000;
    }
  };
  set(0, 0);
  return { group: g, set };
}
