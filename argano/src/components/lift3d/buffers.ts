// Spring buffers in the pit: the car's under its buffer plates, the counterweight's under its own, each on its base.
// The springs shorten with the compression the simulation gives. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import type { Layout } from '@/shaft';
import type { Section } from '@/shaft/section';
import { P, box } from './geom';
import type { LiftMaterials } from './materials';

export interface BufferModel {
  group: THREE.Group;
  /** compression of the car buffers and of the counterweight buffer [m] */
  set(car: number, cw: number): void;
}

/** A helical spring of unit height standing on y = 0, radius r and wire w [m]. */
function springGeometry(r: number, w: number, turns: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [], n = turns * 20;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, i / n, Math.sin(a) * r));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, w, 8);
}

export function buildBuffers(L: Layout, S: Section, M: LiftMaterials, carSpots: readonly (readonly [number, number])[]): BufferModel {
  const g = new THREE.Group(), V = L.inputs.vertical, z0 = S.pitFloor;
  const springs: { mesh: THREE.Mesh; cap: THREE.Mesh; top: number; h: number; car: boolean }[] = [];
  const geo = springGeometry(0.07, 0.011, 7);
  const one = (x: number, y: number, base: number, h: number, car: boolean): void => {
    if (base > 0) g.add(box(x - 130, y - 130, z0, x + 130, y + 130, z0 + base, M.base));
    const spring = new THREE.Mesh(geo, M.spring);
    spring.position.copy(P(x, y, z0 + base));
    spring.castShadow = true;
    const cap = box(x - 80, y - 80, z0 + base + h - 20, x + 80, y + 80, z0 + base + h, M.rubber);
    g.add(spring, cap);
    springs.push({ mesh: spring, cap, top: z0 + base + h, h, car });
  };
  for (const [x, y] of carSpots) one(x, y, V.carBufferBase, V.carBufferH, true);
  one(L.cw.x + L.cw.w / 2, L.cw.y + L.cw.h / 2, V.cwBufferBase, V.cwBufferH, false);
  const set = (car: number, cw: number): void => {
    for (const s of springs) {
      const x = Math.min(Math.max(s.car ? car * 1000 : cw * 1000, 0), s.h - 20);
      s.mesh.scale.set(1, (s.h - x - 20) / 1000, 1);
      s.cap.position.y = (s.top - x - 10) / 1000;
    }
  };
  set(0, 0);
  return { group: g, set };
}
