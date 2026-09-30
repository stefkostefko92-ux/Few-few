// The installation as a scene: shaft, car, counterweight, rails, buffers, ropes, machine and room, the spaces of the
// checks; lights and room reflections; every frame the state of the simulation moves the parts, and the walls
// between the camera and the shaft turn into ghosts. Loaded only through boot.ts (lazy).
import * as THREE from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { section } from '@/shaft';
import { KV_VERT } from '@/shaft/norme-vert';
import { ropeRig, type LiftDerived } from '@/lib/lift';
import type { Frame } from '@/sim';
import { P, box, disposeTree } from './geom';
import { createLiftMaterials, SIDES, type Side } from './materials';
import { buildShaft } from './shaft';
import { buildCar } from './car';
import { buildCounterweight } from './counterweight';
import { buildRails } from './rails';
import { buildBuffers } from './buffers';
import { buildRopes } from './ropes';
import { buildRoom } from './room';
import type { Quality } from '../machine/quality';

export const LIFT_BG = '#10161f';
/** vertical field of view of the camera [°] */
export const LIFT_FOV = 38;

export interface Focus {
  target: THREE.Vector3;
  /** a good distance for the camera [m] */
  distance: number;
}

export interface LiftWorld {
  scene: THREE.Scene;
  update(f: Frame, camera: THREE.Vector3): void;
  focus(view: 'car' | 'shaft' | 'room' | 'pit', f: Frame | null): Focus;
  setZones(on: boolean): void;
  dispose(): void;
}

export function buildLiftWorld(renderer: THREE.WebGPURenderer, dv: LiftDerived, quality: Quality): LiftWorld {
  renderer.shadowMap.enabled = quality.ao;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  const L = dv.layout, S = section(L), I = L.inputs, V = I.vertical, N = dv.analysis.ctx.N;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(LIFT_BG);
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment(), env = pmrem.fromScene(room, 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.85;
  const M = createLiftMaterials();

  const rig = ropeRig(dv);
  const carDrop = [L.car.x + L.car.w / 2, L.car.y + L.car.h / 2], cwDrop = [L.cw.x + L.cw.w / 2, L.cw.y + L.cw.h / 2];
  const pad = 320 + N.D / 2;
  const holes = [
    Math.max(0, Math.min(carDrop[0], cwDrop[0]) - pad), Math.max(0, Math.min(carDrop[1], cwDrop[1]) - pad),
    Math.min(I.W, Math.max(carDrop[0], cwDrop[0]) + pad), Math.min(I.D, Math.max(carDrop[1], cwDrop[1]) + pad),
  ] as const;
  const shaft = buildShaft(L, S, M, holes);
  const car = buildCar(L, M);
  const cw = buildCounterweight(L, M);
  const rails = buildRails(L, S, M);
  const buffers = buildBuffers(L, S, M, car.bufferSpots);
  const ropes = buildRopes(rig, N.n, N.d, M);
  const machine = buildRoom(L, rig, N.n, N.d, N.D, M);
  for (const side of SIDES) scene.add(shaft.sides[side], machine.sides[side]);
  scene.add(shaft.common, car.group, cw, rails, buffers.group, ropes.group, machine.common, machine.roof);

  // spaces of the checks: the refuge on the car roof (rides with the car) and in the pit
  const status = (id: string) => L.checks.find((c) => c.id === id)?.status ?? 'ok';
  const zones = new THREE.Group();
  const [tw, td] = KV_VERT.refugePlan[V.topRefuge], th = KV_VERT.refugeH[V.topRefuge];
  const cx = L.car.x + L.car.w / 2, cy = L.car.y + L.car.h / 2;
  const top = box(cx - tw / 2, cy - td / 2, V.carOutH, cx + tw / 2, cy + td / 2, V.carOutH + th, status('h_refuge') === 'fail' ? M.zoneBad : M.zoneOk);
  car.group.add(top);
  const [pw, pd] = KV_VERT.refugePlan[V.pitRefuge], ph = Math.max(KV_VERT.pitClear, KV_VERT.refugeH[V.pitRefuge]);
  zones.add(box(cx - pw / 2, cy - pd / 2, S.pitFloor, cx + pw / 2, cy + pd / 2, S.pitFloor + ph, status('p_refuge') === 'fail' ? M.zoneBad : M.zoneOk));
  scene.add(zones);
  const setZones = (on: boolean): void => { zones.visible = on; top.visible = on; };
  setZones(false);

  // lights: sky and ground, a warm key from the front with shadows around the car, a cool rim from behind
  scene.add(new THREE.HemisphereLight(0xc4d0ff, 0x2a2420, 0.95));
  const key = new THREE.DirectionalLight(0xffe6cc, 2.2);
  key.castShadow = quality.ao;
  key.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 20 });
  key.shadow.bias = -0.0005;
  const rim = new THREE.DirectionalLight(0x9fb8ff, 1.1);
  scene.add(key, key.target, rim, rim.target);

  const W = I.W / 1000, D = I.D / 1000, wall = I.wall / 1000, R = I.room;
  const levels = S.levels;
  const carPos = new THREE.Vector3(), cwPos = new THREE.Vector3();
  const [ox, oy] = rig.origin, [dx, dy] = rig.dir;
  const at = (u: number, y: number, out: THREE.Vector3): THREE.Vector3 => out.set(ox / 1000 + u * dx, y, -(oy / 1000 + u * dy));
  return {
    scene,
    update(f, cam) {
      car.group.position.y = f.s;
      cw.position.y = f.cw;
      car.setDoor(f.door);
      car.setLoad(f.load);
      const floor = levels.findIndex((z) => Math.abs(z / 1000 - f.s) < 0.02);
      shaft.setLanding(floor, f.door);
      buffers.set(f.bufCar, f.bufCw);
      ropes.set(f.s, f.cw);
      M.ropeShift.value = f.rope;
      // 2:1: the car pulley is the first wheel of the rope, the counterweight pulley the last
      const two = dv.analysis.ctx.I.r === 2, wheels = two ? rig.elements(f.s, f.cw).filter((e) => e.kind === 'wheel') : [];
      const cp = wheels[0], wp = wheels[wheels.length - 1];
      machine.set(f.theta, N.i, cp?.kind === 'wheel' ? at(cp.u, cp.y, carPos) : null, wp?.kind === 'wheel' ? at(wp.u, wp.y, cwPos) : null);
      // key light follows the car so its shadows stay sharp
      key.position.set(cx / 1000 + 3, f.s + 5, -cy / 1000 + 6);
      key.target.position.set(cx / 1000, f.s + 1, -cy / 1000);
      rim.position.set(cx / 1000 - 4, f.s + 3, -cy / 1000 - 5);
      rim.target.position.copy(key.target.position);
      // x-ray: the walls with the camera outside them turn faint
      const out: Record<Side, boolean> = { front: cam.z > wall * 0.5, rear: cam.z < -(D + wall * 0.5), left: cam.x < -wall * 0.5, right: cam.x > W + wall * 0.5 };
      for (const side of SIDES) {
        M.ghost(M.walls[side], out[side]);
        M.ghost(M.landing[side], out[side], 0.35);
        M.ghost(M.floors[side], out[side], 0.2);
      }
      if (R) {
        const rx0 = -R.shaftX / 1000, ry0 = -R.shaftY / 1000;
        const roomOut: Record<Side, boolean> = { front: cam.z > -ry0, rear: cam.z < -(ry0 + R.D / 1000), left: cam.x < rx0, right: cam.x > rx0 + R.W / 1000 };
        for (const side of SIDES) M.ghost(M.roomWalls[side], roomOut[side], 0.1);
      }
      M.ghost(M.roof, cam.y > (S.ceiling + (R?.slab ?? 250) + (R?.H ?? 2400)) / 1000, 0.08);
    },
    focus(view, f) {
      const s = f?.s ?? 0;
      if (view === 'car') return { target: P(cx, cy, s * 1000 + V.carH / 2), distance: Math.max(4.2, 1.9 * Math.max(W, D) + 2) };
      if (view === 'room') return { target: machine.focus.clone(), distance: 2.6 + (N.D / 1000) * 2 };
      if (view === 'pit') return { target: P(cx, cy, S.pitFloor + 700), distance: 3.4 };
      // the whole height, pit to machine-room roof, in the vertical field of view with a margin
      const z0 = S.pitFloor - 300, z1 = S.ceiling + (R ? R.slab + R.H : 0), h = (z1 - z0) / 1000;
      return { target: P(I.W / 2, I.D / 2, (z0 + z1) / 2), distance: (h * 1.12) / (2 * Math.tan((LIFT_FOV * Math.PI) / 360)) + Math.max(W, D) };
    },
    setZones,
    dispose() {
      disposeTree(scene);
      machine.dispose();
      M.dispose();
      env.dispose();
      pmrem.dispose();
      room.dispose();
    },
  };
}
