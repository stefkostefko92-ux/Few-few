// The pit in 3D from the drawings' own models (round 37): the ladder, the control box and the lamp where pit-kit.ts
// puts them — the stiles KV_VERT.ladderOverSill over the sill (or to the sill under a landing door's stacked panels), the
// rungs at ladderRungs, no ladder in a pit that needs a door —, the stops and the light's switch at their heights over
// the lowest landing, the counterweight's screen as screen.ts sizes it (the input's height, closed to the wall), and the
// plate under every landing sill as toe.ts and section A-A draw it.
// Motion: none, nothing is drawn here; the scene's prefers-reduced-motion handling is in LiftStage.tsx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { KV_VERT, section } from '@/shaft';
import { ladderRungs, pitKit } from '@/shaft/pit-kit';
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
      const it = k.ladder, a0 = it.u - it.w / 2, a1 = it.u + it.w / 2;
      for (const u of [a0, a0 + 35, a1 - 35, a1]) for (const z of [S.pitFloor, z0 + k.ladderTop]) assert.ok(has(galv, at(it, u, it.d, z)), `${name}: montante a ${u}, ${z}`);
      // (the rungs' vertices: between the stiles' inner faces, off the wall by more than the stiles' brackets and less
      // than their face)
      const along = (p: V3): number => (it.wall === 'front' || it.wall === 'rear' ? p[0] : p[1]);
      const off = (p: V3): number => (it.wall === 'front' ? p[1] : it.wall === 'rear' ? D - p[1] : it.wall === 'left' ? p[0] : W - p[0]);
      const rungs = galv.filter((p) => along(p) > a0 + 34 && along(p) < a1 - 34 && off(p) > 40 && off(p) < it.d - 5).map((p) => p[2]);
      for (const z of ladderRungs(z0 - S.pitFloor)) assert.ok(rungs.some((r) => Math.abs(r - z0 - z) <= 16), `${name}: piolo a ${z}`);
      assert.ok(rungs.every((r) => r <= z0 + 16), `${name}: nessun piolo sopra la soglia`);
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
