// The 3D rails of round 37 take their lengths and brackets from the same model as the sheets and the list of articles
// (src/shaft/rail-brackets.ts): the joints where designPieces puts them, a side counterweight's bridge at the bridge's
// heights.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { defaultInputs, layout } from '@/shaft';
import { section } from '@/shaft/section';
import { bridgeHeights, designPieces } from '@/shaft/rail-brackets';
import { createLiftMaterials } from '../materials';
import { buildRails } from '../rails';

/** The heights of the vertices of the meshes of one material [mm, rounded]. */
function heights(root: THREE.Object3D, m: THREE.Material): Set<number> {
  const out = new Set<number>(), p = new THREE.Vector3();
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.material !== m) return;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) out.add(Math.round(p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).y * 1000));
  });
  return out;
}

test('3D: le giunzioni delle guide e la staffa a ponte dove le mettono le tavole e la distinta', () => {
  const M = createLiftMaterials();
  for (const last of [3980, 4100]) {
    const I = defaultInputs(1600, 1750), floors = [3000, 3000, last, 0].map((rise, i) => ({ label: String(i), rise, door: 'A' as const }));
    const L = layout({ ...I, cw: 'left', vertical: { ...I.vertical, main: 0, floors } }), g = buildRails(L, section(L), M);
    const rail = heights(g, I.carRail.endsWith('/A') ? M.railDrawn : M.railBlade);
    for (const j of designPieces(L).joints) assert.ok([-1, 0, 1].some((d) => rail.has(Math.round(j) + d)), `${last}: giunzione a ${j}`);
    // the bridge's boxes start at its heights and are 120 mm tall
    // (to a millimetre: the vertices are single precision)
    const steel = [...heights(g, M.steel)].sort((a, b) => a - b), bh = bridgeHeights(L), want = bh.flatMap((h) => [h, h + 120]).sort((a, b) => a - b);
    assert.ok(bh.length > 0);
    assert.equal(steel.length, want.length, `${last}: ${steel.join(',')}`);
    steel.forEach((z, i) => assert.ok(Math.abs(z - (want[i] ?? NaN)) <= 1, `${last}: ${z} ≠ ${want[i]}`));
  }
});
