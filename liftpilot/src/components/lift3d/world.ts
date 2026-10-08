// The installation as a scene: shaft, car, counterweight, rails, buffers, ropes, machine and room, the spaces of the
// checks; lights and room reflections — the sky and a key light with its shadows where the camera looks, the car's own
// downlights riding with it, the machine room's ceiling lamp —; every frame the state of the simulation moves the parts,
// and the walls between the camera and the shaft turn into ghosts. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { hebDrawn, mergeChecks, pitSpace, roofSpaces, roomGeo, section } from '@/shaft';
import { KV_VERT } from '@/shaft/norme-vert';
import { groovePitch } from '@/shaft/ropes';
import { bedplateLegs } from '@/shaft/rinvio';
import { hookOf } from '@/shaft/room-hook';
import { shaftUnder } from '@/shaft/room-site';
import { KL, planeAt, ropeRig, type LiftDerived, type RopePlane } from '@/lib/lift';
import { governorRopes } from '@/lib/lift/support';
import type { Frame } from '@/sim';
import { Batch, P, box, disposeTree } from './geom';
import { createLiftMaterials, SIDES, type Side } from './materials';
import { buildShaft } from './shaft';
import { slabOpenings } from './slab';
import { buildCar } from './car';
import { buildCounterweight } from './counterweight';
import { buildRails } from './rails';
import { buildBuffers } from './buffers';
import { buildRopes, hitchSpots } from './ropes';
import type { Hitch } from './sling';
import { buildRoom, machinePassage } from './room';
import { buildPit } from './pit';
import { buildCable } from './cable';
import { buildGovernor, governorSpot } from './governor';
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
  /** the state of the run, the camera and the point it looks at */
  update(f: Frame, camera: THREE.Vector3, target: THREE.Vector3): void;
  focus(view: 'car' | 'shaft' | 'room' | 'pit', f: Frame | null): Focus;
  setZones(on: boolean): void;
  /** compiles the pipelines of every part, in view or not: a part coming into view later does not stall a frame */
  compile(camera: THREE.Camera): Promise<void>;
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
  scene.environmentIntensity = 0.7;
  const M = createLiftMaterials(S.pitFloor / 1000);

  const rig = ropeRig(dv);
  const gov = governorSpot(L), slab = (I.room?.slab ?? 250) / 1000, sim = dv.sim;
  const travel = [sim.levels[0], sim.levels[sim.levels.length - 1]].map((s) => [s, sim.cw0 - s] as const);
  const openings = slabOpenings(rig, N.n, N.d, S.ceiling / 1000, S.ceiling / 1000 + slab, travel, gov);
  // a machine below: its front through the wall behind the counterweight, or under the pit with the ropes through its slab
  const passage = machinePassage(rig, N.D), under = rig.scheme?.scheme === 'under';
  const pitHoles = under ? slabOpenings(rig, N.n, N.d, (S.pitFloor - KL.underSlab) / 1000, S.pitFloor / 1000, travel, null) : [];
  const shaft = buildShaft(L, S, M, openings, { walls: passage ? [passage] : [], pit: pitHoles });
  // the ropes end on the car: a 1:1 hitch on the crosshead, or the car pulley of a 2:1 roping, in its plane (rig.ts)
  const two = dv.analysis.ctx.I.r === 2, pcs = rig.pieces(0, 0), carPlane = pcs[0].plane, cwPlane = pcs[pcs.length - 1].plane;
  const Rp = dv.analysis.ctx.I.Dp / 2, width = N.n * groovePitch(N.d) + 30;
  const hitchAt = (pl: RopePlane, u: number): Hitch => {
    const [x, y] = planeAt(pl, u);
    return two ? { kind: 'pulley', x, y, across: [-pl.dir[1], pl.dir[0]], r: Rp, width } : { kind: 'ropes', at: hitchSpots(pl, N.n, u) };
  };
  const labels = dv.sim.labels;
  // (2:1: each pulley in its own plane, from its dead end or its fall, half a pulley along it)
  const car = buildCar(L, M, hitchAt(carPlane, two ? Rp / 1000 : 0), gov, labels);
  const cw = buildCounterweight(L, M, hitchAt(cwPlane, two ? Rp / 1000 : rig.bottom ? 0 : rig.calata));
  const rails = buildRails(L, S, M);
  const buffers = buildBuffers(L, S, M, car.bufferSpots);
  const ropes = buildRopes(rig, N.n, N.d, M, !two);
  // the HEB beams on the shaft's walls, where the drawings put them
  const G = rig.bottom ? null : roomGeo(L, dv.machine), heb = G ? hebDrawn(G, dv.machine, shaftUnder(L), governorRopes(L, G)) : null;
  // the bedplate's legs in the machine's own axes, where the drawings put them
  const legs = G ? bedplateLegs(G, dv.machine, heb).map(([u, v]) => [(G.dir * (u - G.sheaveAt)) / 1000, (G.frame.zSheave - G.dir * v) / 1000] as const) : null;
  // the lifting hook where the plan, section B-B and sheet 1 put it (room-hook.ts)
  const machine = buildRoom(L, rig, N.n, N.d, N.D, S.ceiling, M, openings, gov, dv.machine.shape ?? null, dv.machine.rinvio ?? null, heb, G?.dir ?? 1, legs?.length ? legs : null,
    G ? hookOf(G, dv.machine) : null);
  // the fittings of the shaft and the pit, the governor's loop, the travelling cable
  const fit = new Batch(), fittings = new THREE.Group();
  buildPit(L, S, M, fit);
  const govFloor = !rig.bottom ? rig.roomFloor * 1000 : rig.scheme?.scheme === 'room' ? S.ceiling + slab * 1000 : null;
  const governor = gov ? buildGovernor(L, S, gov, govFloor, M, fit) : null;
  fit.into(fittings);
  const cable = buildCable(L, S, M, gov);
  for (const side of SIDES) scene.add(shaft.sides[side], machine.sides[side]);
  scene.add(shaft.common, car.group, cw, rails, buffers.group, ropes.group, machine.common, machine.roof, machine.overhead, fittings);
  if (cable) scene.add(cable.group);
  if (governor) scene.add(governor.group);

  // spaces of the checks: the refuge on the car roof (rides with the car) and in the pit
  // (the lift's own where it has them: the refuge under what the rig hangs over the roof, head.ts)
  const status = (id: string) => mergeChecks(L.checks, dv.supportChecks).find((c) => c.id === id)?.status ?? 'ok';
  const zones = new THREE.Group();
  // where the plans put them (roof.ts: clear of a low crosshead and of the operators; pit.ts: clear of the buffers)
  const cx = L.car.x + L.car.w / 2, cy = L.car.y + L.car.h / 2;
  const th = KV_VERT.refugeH[V.topRefuge], rr = roofSpaces(L).refuge, bad = (id: string): boolean => status(id) === 'fail';
  const top = box(rr.x0, rr.y0, V.carOutH, rr.x1, rr.y1, V.carOutH + th, ['h_refuge', 'h_stand', 'h_refuge_rig', 'h_stand_rig'].some(bad) ? M.zoneBad : M.zoneOk);
  car.group.add(top);
  const pr = pitSpace(L), ph = Math.max(KV_VERT.pitClear, KV_VERT.refugeH[V.pitRefuge]);
  zones.add(box(pr.x0, pr.y0, S.pitFloor, pr.x1, pr.y1, S.pitFloor + ph, bad('p_refuge') || bad('v_buffer') ? M.zoneBad : M.zoneOk));
  scene.add(zones);
  const setZones = (on: boolean): void => { zones.visible = on; top.visible = on; };
  setZones(false);

  // lights: sky and ground, a warm key from the front with shadows round what the camera looks at, a cool rim from
  // behind; the car's two downlights under its ceiling (they ride with it and pour out of its door), the machine room's
  // lamp under its ceiling: falling off with the distance, as lamps do
  scene.add(new THREE.HemisphereLight(0xd8dde6, 0x2a2420, 0.78));
  for (const k of [-1, 1]) {
    const ci = L.carInner, sp = new THREE.SpotLight(0xfff0d8, 16, 4, 1.1, 0.7, 2), x = ci.x + ci.w / 2 + (k * ci.w) / 5, y = ci.y + ci.h / 2;
    sp.position.copy(P(x, y, V.carH - 40));
    sp.target.position.copy(P(x, y, 0));
    car.group.add(sp, sp.target);
  }
  if (machine.bounds) {
    const b = machine.bounds, lamp = new THREE.PointLight(0xfff3e2, 22, 7, 2);
    lamp.position.copy(P((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.top - 450));
    scene.add(lamp);
  }
  const key = new THREE.DirectionalLight(0xffe6cc, 2.2);
  key.castShadow = quality.ao;
  key.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
  Object.assign(key.shadow.camera, { left: -4.5, right: 4.5, top: 4.5, bottom: -4.5, near: 0.5, far: 26 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = quality.shadowRadius;
  const rim = new THREE.DirectionalLight(0xc9d5f0, 1.1);
  scene.add(key, key.target, rim, rim.target);
  // a wall or roof turned into a ghost casts no shadow, nor what hangs on a shaft wall (portals, call stations, landing
  // doors and floors): it is not there for the camera, so not for the key light either (three.js draws every caster
  // into the shadow map, transparent or not)
  const casters = (root: THREE.Object3D, keep: (o: THREE.Mesh) => boolean = () => true): THREE.Mesh[] => {
    const list: THREE.Mesh[] = [];
    root.traverse((o) => {
      if (o instanceof THREE.Mesh && o.castShadow && keep(o)) list.push(o);
    });
    return list;
  };
  const perSide = <T,>(f: (s: Side) => T): Record<Side, T> => ({ front: f('front'), rear: f('rear'), left: f('left'), right: f('right') });
  const ofMaterial = (m: THREE.Material): THREE.Mesh[] => casters(scene, (o) => o.material === m);
  const onWall = perSide((s) => casters(shaft.sides[s])), roomWalls = perSide((s) => ofMaterial(M.roomWalls[s])), roof = ofMaterial(M.roof);
  const cast = (list: readonly THREE.Mesh[], on: boolean): void => {
    for (const o of list) o.castShadow = on;
  };

  const W = I.W / 1000, D = I.D / 1000, wall = I.wall / 1000, R = I.room;
  const levels = S.levels;
  const carPos = new THREE.Vector3(), cwPos = new THREE.Vector3();
  const at = (pl: RopePlane, u: number, y: number, out: THREE.Vector3): THREE.Vector3 => {
    const [x, yy] = planeAt(pl, u);
    return out.set(x / 1000, y, -yy / 1000);
  };
  return {
    scene,
    update(f, cam, target) {
      car.group.position.y = f.s;
      cw.position.y = f.cw;
      car.setDoor(f.door);
      car.setLoad(f.load);
      const floor = levels.findIndex((z) => Math.abs(z / 1000 - f.s) < 0.02);
      shaft.setLanding(floor, f.door);
      // the car's display: the nearest floor and the direction of travel
      const near = levels.reduce((best, z, i) => (Math.abs(z / 1000 - f.s) < Math.abs(levels[best] / 1000 - f.s) ? i : best), 0);
      car.setDisplay(labels[near] ?? '', f.v > 0.05 ? 1 : f.v < -0.05 ? -1 : 0);
      buffers.set(f.bufCar, f.bufCw);
      cable?.set(f.s);
      governor?.set(f.s);
      ropes.set(f.s, f.cw);
      M.ropeShift.value = f.rope;
      // 2:1: the car pulley is the first wheel of the rope, the counterweight pulley the last
      const now = rig.pieces(f.s, f.cw), p0 = now[0], p1 = now[now.length - 1], cp = p0.els[1], wp = p1.els[p1.els.length - 2];
      machine.set(f.theta, N.i, two && cp?.kind === 'wheel' ? at(p0.plane, cp.u, cp.y, carPos) : null, two && wp?.kind === 'wheel' ? at(p1.plane, wp.u, wp.y, cwPos) : null);
      // the key light follows what the camera looks at (the car, the machine, the pit) so its shadows stay sharp there
      key.position.set(target.x + 4, target.y + 7, target.z + 8);
      key.target.position.copy(target);
      rim.position.set(target.x - 4, target.y + 3, target.z - 5);
      rim.target.position.copy(target);
      // x-ray: the walls with the camera outside them turn faint, and those the camera looks through at something past
      // them (the room of a machine below, behind the shaft)
      const outside = (p: THREE.Vector3, m: number): Record<Side, boolean> => ({ front: p.z > m, rear: p.z < -(D + m), left: p.x < -m, right: p.x > W + m });
      const out = outside(cam, wall * 0.5), beyond = outside(target, wall);
      for (const side of SIDES) {
        const faint = out[side] || beyond[side];
        if (M.ghost(M.walls[side], faint)) cast(onWall[side], !faint);
        M.ghost(M.landing[side], faint, 0.35);
        M.ghost(M.floors[side], faint, 0.2);
      }
      const rb = machine.bounds;
      if (rb) {
        const roomOut: Record<Side, boolean> = { front: cam.z > -rb.y0 / 1000, rear: cam.z < -rb.y1 / 1000, left: cam.x < rb.x0 / 1000, right: cam.x > rb.x1 / 1000 };
        for (const side of SIDES) {
          if (M.ghost(M.roomWalls[side], roomOut[side], 0.1)) cast(roomWalls[side], !roomOut[side]);
          // what is fixed on a ghost wall (door, cabinet, switch, conduit) goes with it, as the lamp with the roof
          machine.mounted[side].visible = !roomOut[side];
        }
      }
      const above = cam.y > (rb?.top ?? S.ceiling + 2600) / 1000;
      if (M.ghost(M.roof, above, 0.08)) cast(roof, !above);
      machine.overhead.visible = !above;
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
    async compile(camera) {
      const culled: THREE.Object3D[] = [];
      scene.traverse((o) => {
        if (!o.frustumCulled) return;
        culled.push(o);
        o.frustumCulled = false;
      });
      try {
        await renderer.compileAsync(scene, camera);
      } finally {
        for (const o of culled) o.frustumCulled = true;
      }
    },
    dispose() {
      disposeTree(scene);
      car.dispose();
      machine.dispose();
      M.dispose();
      env.dispose();
      pmrem.dispose();
      room.dispose();
    },
  };
}
