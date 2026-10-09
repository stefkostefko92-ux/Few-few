// The pit in 3D from the drawings' own models (round 37): the ladder, the control box and the lamp where pit-kit.ts
// puts them — the stiles KV_VERT.ladderOverSill over the sill (or to the sill under a landing door's stacked panels), the
// rungs at ladderRungs, no ladder in a pit that needs a door —, the stops and the light's switch at their heights over
// the lowest landing, the counterweight's screen as screen.ts sizes it (the input's height, closed to the wall — short
// of a landing on that wall, clear of its frame with the panels stacked, its sill and its plate), and the plate under
// every landing sill as toe.ts and section A-A draw it.
// Motion: none, nothing is drawn here; the scene's prefers-reduced-motion handling is in LiftStage.tsx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { KV_VERT, section } from '@/shaft';
import { landingZone } from '@/shaft/landing';
import { ladderRungs, pitKit } from '@/shaft/pit-kit';
import { quad } from '@/shaft/plan-walls';
import { cwScreen } from '@/shaft/screen';
import { SILL_H } from '@/shaft/sill';
import { toeOf, toeWidth } from '@/shaft/toe';
import { Batch, onWall } from '../geom';
import { createLiftMaterials } from '../materials';
import { buildPit } from '../pit';
import { buildShaft } from '../shaft';

// the floors' labels are drawn on a canvas: under node, a blank one
if (!('document' in globalThis)) Object.assign(globalThis, { document: { createElement: () => ({ width: 0, height: 0, getContext: () => null }) } });

type V3 = readonly [number, number, number];
/** The vertices of the meshes of `mat` under `root`: plan x, plan y, height [mm]. */
function verts(root: THREE.Object3D, mat: THREE.Material): V3[] {
  const out: V3[] = [], v = new THREE.Vector3();
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.material !== mat) return;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      out.push([v.x * 1000, -v.z * 1000, v.y * 1000]);
    }
  });
  return out;
}
const has = (vs: readonly V3[], q: V3, tol = 1): boolean => vs.some((p) => Math.abs(p[0] - q[0]) <= tol && Math.abs(p[1] - q[1]) <= tol && Math.abs(p[2] - q[2]) <= tol);

const shaft = (I: LiftInputs, s: Partial<LiftInputs['shaft']>): LiftInputs => ({ ...I, shaft: { ...I.shaft, ...s } });
const pit = (I: LiftInputs, depth: number): LiftInputs => shaft(I, { vertical: { ...I.shaft.vertical, pit: depth } });
const LIFTS: readonly (readonly [string, LiftInputs])[] = [
  ['esempio', newLift()],
  ['contrappeso a sinistra', shaft(newLift(), { cw: 'left' })],
  ['contrappeso a destra', shaft(newLift(), { cw: 'right' })],
  ['fossa 1800, due STOP', pit(newLift(), 1800)],
  ['fossa 2800, porta di accesso', pit(newLift(), 2800)],
  ['protezione alta 2300', shaft(newLift(), { vertical: { ...newLift().shaft.vertical, cwScreen: 2300 } })],
  ['tiro diretto, scala sotto il pacco delle ante', { ...newLift(), calc: { ...newLift().calc, layout: 'top' } }],
];

for (const [name, inp] of LIFTS) {
  test(`fossa in 3D come la pianta e la sezione A-A (${name})`, () => {
    const L = deriveLift(inp).layout, S = section(L), { W, D } = L.inputs, z0 = S.levels[0] ?? 0, k = pitKit(L), M = createLiftMaterials(), B = new Batch(), g = new THREE.Group();
    buildPit(L, S, M, B);
    B.into(g);
    const galv = verts(g, M.galv), base = verts(g, M.base), red = verts(g, M.red), at = (w: typeof k.box, u: number, v: number, z: number): V3 => {
      assert.ok(w);
      const [x, y] = onWall(w.wall, W, D, u, v);
      return [x, y, z];
    };
    // the ladder: both stiles from the pit floor to their top, in the plan's place; the rungs at the model's heights
    if (k.ladder) {
      const it = k.ladder, a0 = it.u - it.w / 2, a1 = it.u + it.w / 2, st = KV_VERT.ladderStile;
      for (const u of [a0, a0 + st, a1 - st, a1]) for (const z of [S.pitFloor, z0 + k.ladderTop]) assert.ok(has(galv, at(it, u, it.d, z)), `${name}: montante a ${u}, ${z}`);
      // (the rungs' vertices: between the stiles' inner faces, off the wall by more than the stiles' brackets and less
      // than their face)
      const along = (p: V3): number => (it.wall === 'front' || it.wall === 'rear' ? p[0] : p[1]);
      const off = (p: V3): number => (it.wall === 'front' ? p[1] : it.wall === 'rear' ? D - p[1] : it.wall === 'left' ? p[0] : W - p[0]);
      const r = KV_VERT.ladderRungD / 2 + 1, rungs = galv.filter((p) => along(p) > a0 + st - 1 && along(p) < a1 - st + 1 && off(p) > 40 && off(p) < it.d - 5).map((p) => p[2]);
      for (const z of ladderRungs(z0 - S.pitFloor)) assert.ok(rungs.some((q) => Math.abs(q - z0 - z) <= r), `${name}: piolo a ${z}`);
      assert.ok(rungs.every((q) => q <= z0 + r), `${name}: nessun piolo sopra la soglia`);
      // the rungs as thick as the registry has them (round, KV_VERT.ladderRungD across)
      const z1 = ladderRungs(z0 - S.pitFloor)[1], ring = rungs.filter((q) => Math.abs(q - z0 - z1) <= r);
      assert.ok(Math.abs(Math.max(...ring) - Math.min(...ring) - KV_VERT.ladderRungD) <= 1.5, `${name}: diametro dei pioli`);
    } else {
      assert.equal(k.ladderAllowed, false, name);
      assert.ok(!galv.some((p) => Math.abs(p[2] - z0 - KV_VERT.ladderOverSill) < 0.5), `${name}: una scala dove serve la porta`);
    }
    // the control box: a case at each stop and at the light's switch, a red head on each stop
    assert.ok(k.box, name);
    const stops = [k.stop, ...(k.lowStop !== null ? [k.lowStop] : [])], h = KV_VERT.pitBoxH;
    for (const z of [...stops, k.light]) for (const dz of [-h / 2, h / 2]) assert.ok(has(base, at(k.box, k.box.u - k.box.w / 2, k.box.d, z0 + z + dz)), `${name}: cassetta a ${z}`);
    for (const z of stops) assert.ok(red.some((p) => Math.abs(p[2] - z0 - z) <= 23), `${name}: STOP a ${z}`);
    assert.ok(!red.some((p) => Math.abs(p[2] - z0 - k.light) <= 30), `${name}: niente STOP al comando della luce`);
    // the lamp, with or without the ladder
    assert.ok(k.lamp, name);
    const l = k.lamp;
    assert.ok(has(verts(g, M.carLight), at(l, l.u - l.w / 2 + 10, l.d + 3, z0 + l.at + l.h / 2 - 10)), `${name}: lampada`);
    // the screen: its sheet end to end along its wall, from its lower edge to its height over the pit floor
    const s = cwScreen(L), sheet = verts(g, M.screen), u = (p: V3): number => (s.wall === 'rear' ? p[0] : p[1]), mm = (v: number): number => Math.round(v) + 0;
    assert.deepEqual([Math.min(...sheet.map(u)), Math.max(...sheet.map(u))].map(mm), [s.u0, s.u1].map(mm), name);
    assert.deepEqual([Math.min(...sheet.map((p) => p[2])), Math.max(...sheet.map((p) => p[2]))].map(mm), [S.pitFloor + s.low, S.pitFloor + s.high].map(mm), name);
  });
}

test('lamiera sottosoglia in 3D sotto ogni soglia di piano, come la sezione A-A', () => {
  for (const [name, inp] of [['esempio', newLift()], ['accessi opposti', shaft(newLift(), { entrances: 'opposite', D: 2000 })]] as const) {
    const L = deriveLift(inp).layout, S = section(L), I = L.inputs, M = createLiftMaterials(), galv = verts(buildShaft(L, S, M, []).common, M.galv);
    const t = toeOf(I), tw = toeWidth(I.doorWidth) / 2;
    I.vertical.floors.forEach((f, i) => {
      const z = S.levels[i] ?? 0;
      for (const d of L.doors.filter((x) => f.door.includes(x.side))) {
        const um = (d.u0 + d.u1) / 2, P = (u: number, v: number, zz: number): V3 => [...onWall(d.wall, I.W, I.D, u, v), zz];
        for (const u of [um - tw, um + tw]) {
          assert.ok(has(galv, P(u, I.landingDepth, z - SILL_H)), `${name} ${f.label}: lamiera sotto la soglia`);
          assert.ok(has(galv, P(u, I.landingDepth, z - t.h)), `${name} ${f.label}: bordo inferiore a ${t.h}`);
          assert.ok(has(galv, P(u, 0, z - t.h - t.bevel), 3), `${name} ${f.label}: smusso fino alla parete`);
        }
      }
    });
  }
});

test('protezione del contrappeso in 3D: fuori dal telaio con le ante impacchettate, dalla soglia e dalla lamiera della porta più bassa', () => {
  type B3 = readonly [number, number, number, number, number, number];
  const box = (pts: readonly (readonly [number, number])[], z0: number, z1: number): B3 =>
    [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), z0, Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])), z1];
  const meet = (a: B3, b: B3): boolean => a[0] < b[3] && b[0] < a[3] && a[1] < b[4] && b[1] < a[4] && a[2] < b[5] && b[2] < a[5];
  let short = 0;
  for (const cw of ['left', 'right'] as const) for (const depth of [1000, 1500, 2000]) for (const door of ['T2', 'C2'] as const) for (const high of [undefined, 2300]) {
    const v = newLift().shaft.vertical, name = `${cw} ${door} fossa ${depth} H ${high ?? '-'}`;
    const L = deriveLift(shaft(newLift(), { cw, door, vertical: { ...v, pit: depth, ...(high ? { cwScreen: high } : {}) } })).layout, I = L.inputs, S = section(L);
    // the sheet and its frame's posts (to the pit floor, behind the sheet), as buildPit makes them from cwScreen
    const s = cwScreen(L), z0 = S.levels[0] ?? 0, screen = box(quad(L, s.wall, s.u0, s.v1 - 4, s.u1, s.v1), S.pitFloor, S.pitFloor + s.high);
    for (const d of L.doors.filter((x) => I.vertical.floors[0].door.includes(x.side))) {
      const z = landingZone(I, d);
      assert.ok(!meet(screen, box(quad(L, d.wall, z.over[0], 0, z.over[1], I.landingDepth), z0, z0 + z.up)), `${name}: nel pacco delle ante`);
      assert.ok(!meet(screen, box(quad(L, d.wall, z.under[0], 0, z.under[1], I.landingDepth), z0 - z.down, z0)), `${name}: nella soglia o nella lamiera`);
    }
    // in 3D the sheet ends where the model has it; short of the landing what stays open is within e)
    const M = createLiftMaterials(), B = new Batch(), g = new THREE.Group();
    buildPit(L, S, M, B);
    B.into(g);
    const u0 = Math.min(...verts(g, M.screen).map((p) => p[1]));
    assert.equal(Math.round(u0) + 0, Math.round(s.u0) + 0, name);
    if (s.u0 > 0) {
      short++;
      assert.ok(s.u0 <= KV_VERT.cwScreenWall, `${name}: ${s.u0} mm aperti verso il muro`);
    }
  }
  assert.ok(short >= 8, `${short}`);
});
