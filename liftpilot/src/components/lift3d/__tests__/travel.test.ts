// The car and the counterweight run free: nothing fixed — the shaft with its landings and slab, the pit's fittings, the
// rails and their brackets, the governor's loop, the pulleys' frames and the ropes' dead ends — stands in the space the
// car's body and sling, or the counterweight's body, sweep between the lowest floor and the highest, for each roping,
// machine position and arrangement of the shaft.
// Motion: none, nothing is drawn here; the scene's prefers-reduced-motion handling is in LiftStage.tsx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { AUTO_ALL, defaultLift, deriveLift, ropeRig, type BottomScheme } from '@/lib/lift';
import { section } from '@/shaft';
import { Batch } from '../geom';
import { createLiftMaterials } from '../materials';
import { buildShaft } from '../shaft';
import { slabOpenings } from '../slab';
import { buildRails } from '../rails';
import { buildPit } from '../pit';
import { buildGovernor, governorSpot } from '../governor';
import { pulleyFrames } from '../pulleys';
import { machinePassage } from '../room';

/** The triangles of a subtree whose bounds reach into the box (world metres): material and lowest corner [mm]. */
function intruders(root: THREE.Object3D, box: THREE.Box3, names: ReadonlyMap<THREE.Material, string>): string[] {
  const out: string[] = [], p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], t = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const pos = o.geometry.getAttribute('position'), index = o.geometry.getIndex(), n = index ? index.count : pos.count;
    for (let i = 0; i + 2 < n; i += 3) {
      for (let j = 0; j < 3; j++) p[j].fromBufferAttribute(pos, index ? index.getX(i + j) : i + j).applyMatrix4(o.matrixWorld);
      if (t.setFromPoints(p).intersectsBox(box)) out.push(`${names.get(o.material) ?? '?'} ${t.min.toArray().map((v) => Math.round(v * 1000)).join(' ')}`);
    }
  });
  return out;
}

type Shaft = ReturnType<typeof defaultLift>['shaft'];
const VARIANTS: readonly (readonly ['top' | 'topDefl' | 'bottom', '1' | '2', string, Partial<Shaft>, BottomScheme?])[] = [
  ['top', '1', '', {}], ['top', '2', '', {}], ['topDefl', '1', '', {}], ['topDefl', '2', '', {}],
  // a machine below wants the runs to it behind the counterweight: the gap widened, the shaft deep enough for the car
  ['bottom', '1', ', rinvii in testata', { D: 2000, cwWallGap: 250 }, 'head'], ['bottom', '2', ', rinvii in testata', { D: 2000, cwWallGap: 250 }, 'head'],
  ['bottom', '1', ', locale pulegge', { D: 2000, cwWallGap: 250 }, 'room'], ['bottom', '1', ', macchina sotto il vano', { D: 2000, cwWallGap: 250 }, 'under'],
  ['bottom', '1', ', rinvii in testata, contrappeso laterale', { cw: 'left', W: 1850, cwWallGap: 250 }, 'head'],
  ['topDefl', '1', ', contrappeso laterale', { cw: 'left' }], ['topDefl', '2', ', accessi opposti', { entrances: 'opposite' }],
  ['top', '1', ', accessi adiacenti', { entrances: 'adjacent', side2: 'right' }],
  ['top', '1', ', contrappeso, luce e canalina in nicchia', { niches: [{ use: 'cw', wall: 'rear', at: 300, width: 1000, depth: 150 },
    { use: 'light', wall: 'left', at: 1100, width: 300, depth: 100 }, { use: 'duct', wall: 'right', at: 200, width: 200, depth: 100 }] }],
  ['topDefl', '2', ', contrappeso laterale in nicchia', { cw: 'left', niches: [{ use: 'cw', wall: 'left', at: 300, width: 1000, depth: 120 }] }],
];

// the floors' labels are drawn on a canvas: under node, a blank one
if (!('document' in globalThis)) Object.assign(globalThis, { document: { createElement: () => ({ width: 0, height: 0, getContext: () => null }) } });

for (const [layout, r, name, over, bottom] of VARIANTS) {
  test(`cabina e contrappeso: nessuna parte fissa nella loro corsa (${layout}, ${r}:1${name})`, () => {
    const inp = defaultLift(), dv = deriveLift({ shaft: { ...inp.shaft, ...over }, calc: { ...inp.calc, layout, r }, auto: AUTO_ALL, bottom });
    const L = dv.layout, S = section(L), I = L.inputs, V = I.vertical, N = dv.analysis.ctx.N, rig = ropeRig(dv), M = createLiftMaterials();
    const gov = governorSpot(L), sim = dv.sim, slab = (I.room?.slab ?? 250) / 1000;
    const travel = [sim.levels[0], sim.levels.at(-1) ?? 0].map((s) => [s, sim.cw0 - s] as const);
    const passage = machinePassage(rig, N.D), pit = rig.scheme?.scheme === 'under' ? slabOpenings(rig, N.n, N.d, (S.pitFloor - 300) / 1000, S.pitFloor / 1000, travel, null) : [];
    const shaft = buildShaft(L, S, M, slabOpenings(rig, N.n, N.d, S.ceiling / 1000, S.ceiling / 1000 + slab, travel, gov), { walls: passage ? [passage] : [], pit });
    const fixed = new THREE.Group(), B = new Batch();
    fixed.add(shaft.common, ...Object.values(shaft.sides), buildRails(L, S, M));
    buildPit(L, S, M, B);
    const above = !rig.bottom ? rig.roomFloor * 1000 : rig.scheme?.scheme === 'room' ? S.ceiling + slab * 1000 : null;
    if (gov) fixed.add(buildGovernor(L, S, gov, above, M, B).group);
    pulleyFrames(B, M, rig, N.n, N.d, above, S.ceiling);
    B.into(fixed);
    // the car's body and its sling, from the lowest floor to the highest, a millimetre in from every side
    const c = L.car, lo = sim.levels[0] * 1000 - V.frameBelow, hi = (sim.levels.at(-1) ?? 0) * 1000 + V.frameTop;
    const box = new THREE.Box3(new THREE.Vector3((c.x + 1) / 1000, (lo + 1) / 1000, -(c.y + c.h - 1) / 1000), new THREE.Vector3((c.x + c.w - 1) / 1000, (hi - 1) / 1000, -(c.y + 1) / 1000));
    const names = new Map<THREE.Material, string>();
    for (const [k, v] of Object.entries(M)) {
      if (v instanceof THREE.Material) names.set(v, k);
      else if (v && typeof v === 'object') for (const [side, m] of Object.entries(v)) if (m instanceof THREE.Material) names.set(m, `${k}.${side}`);
    }
    const hits = intruders(fixed, box, names);
    assert.equal(hits.length, 0, `${hits.length} triangoli nella corsa: ${hits.slice(0, 4).join('; ')}`);
    // the counterweight's body the same, from its lowest to its highest
    const w = L.cw, ws = travel.map(([, cw]) => cw * 1000), wb = new THREE.Box3(
      new THREE.Vector3((w.x + 1) / 1000, (Math.min(...ws) + 1) / 1000, -(w.y + w.h - 1) / 1000),
      new THREE.Vector3((w.x + w.w - 1) / 1000, (Math.max(...ws) + V.cwH - 1) / 1000, -(w.y + 1) / 1000));
    const cwHits = intruders(fixed, wb, names);
    assert.equal(cwHits.length, 0, `${cwHits.length} triangoli nella corsa del contrappeso: ${cwHits.slice(0, 4).join('; ')}`);
  });
}
