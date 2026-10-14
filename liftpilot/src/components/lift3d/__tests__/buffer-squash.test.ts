// The buffers in 3D squash as the simulation and the section have them (round 37): the top of every buffer is where the
// car's (or the counterweight's) plate is — the section's buffer top less the compression the simulation gives —, up to
// the stroke the section counts; a polyurethane pad goes down to 90 % of its whole height H (UNI EN 81-20:2020,
// 5.8.2.1.2.2), not of H less its plate (until round 36 it stopped 10 % short: 64,8 mm of 72 at H = 80 mm, and the car's
// plate sank 5,6 mm into the pad at 1 m/s).
// Motion: none, nothing is drawn here; the scene's prefers-reduced-motion handling is in LiftStage.tsx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { bufferPlan, defaultInputs, layout, section, withBufferType, type BufferType, type VerticalInputs } from '@/shaft';
import { PU_PLATE, puPlate } from '@/shaft/buffers';
import { createLiftMaterials } from '../materials';
import { buildBuffers } from '../buffers';

/** The heights of the tops of the moving parts of the buffers [mm]: the pads' (scaled from their foot; squashed to
 *  nothing, hidden, their plate's face), the cups' and plungers' (their groups). */
function tops(group: THREE.Object3D, pu: THREE.Material): number[] {
  const out: number[] = [];
  group.updateWorldMatrix(true, true);
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material === pu) out.push((o.position.y + (o.visible ? o.scale.y : 0)) * 1000);
    else if (o instanceof THREE.Group && o !== group && o.children.length) out.push(o.position.y * 1000);
  });
  return out;
}

const shaftWith = (t: BufferType, v: number, h?: number): ReturnType<typeof layout> => {
  const I = defaultInputs(1600, 1750);
  let V: VerticalInputs = withBufferType(withBufferType({ ...I.vertical, v }, 'car', t), 'cw', t);
  if (h !== undefined) V = { ...V, carBufferBase: V.carBufferBase + V.carBufferH - h, carBufferH: h, cwBufferBase: V.cwBufferBase + V.cwBufferH - h, cwBufferH: h };
  return layout({ ...I, vertical: V });
};

for (const [t, v, h] of [['pu', 1, 80], ['pu', 0.63, 80], ['pu', 1, 100], ['pu', 0.8, 60], ['spring', 1, undefined], ['oil', 1.6, undefined]] as const) {
  test(`ammortizzatori ${t} (H ${h ?? 'tipico'}, ${v} m/s) in 3D: la cima dove la piastra della cabina, fino alla corsa della sezione`, () => {
    const L = shaftWith(t, v, h), S = section(L), V = L.inputs.vertical, M = createLiftMaterials();
    const spots = bufferPlan(L).spots.filter((s) => s.kind === 'car').map((s) => s.c);
    const b = buildBuffers(L, S, M, spots), carTop = S.pitFloor + V.carBufferBase + V.carBufferH, cwTop = S.pitFloor + V.cwBufferBase + V.cwBufferH;
    // the section's buffer top is where the car's plate touches
    assert.equal(carTop, S.carBufferTop);
    for (const c of [0, S.carStroke / 2, S.carStroke - 1, S.carStroke, S.carStroke + 20]) {
      b.set(c / 1000, 0);
      const at = tops(b.group, M.pu), want = carTop - Math.min(c, S.carStroke);
      // every car buffer's top at the car's plate; the counterweight's at rest
      assert.equal(at.filter((z) => Math.abs(z - want) < 1e-6).length, spots.length, `${t}: compressione ${c} mm → ${at.map((z) => z.toFixed(2)).join(', ')} (attesa ${want})`);
      assert.ok(at.some((z) => Math.abs(z - cwTop) < 1e-6), `${t}: contrappeso a riposo`);
    }
    if (t === 'pu') {
      // a pad goes down to 90 % of H (72 mm at H = 80); its plate (8 mm, thinner under a pad lower than 80 mm) within
      // what is left, so that fully compressed the pad's foot is on the plate and its top on the car's plate
      const H = V.carBufferH, plate = puPlate(H, S.carStroke);
      assert.equal(S.carStroke, Math.round(0.9 * H));
      assert.equal(plate, H >= 80 ? PU_PLATE : H - S.carStroke);
      b.set(S.carStroke / 1000, 0);
      const pads: THREE.Mesh[] = [];
      b.group.traverse((o) => { if (o instanceof THREE.Mesh && o.material === M.pu) pads.push(o); });
      const feet = pads.map((o) => o.position.y * 1000).filter((z) => Math.abs(z - (carTop - H + plate)) < 1e-6);
      assert.equal(feet.length, spots.length);
      for (const o of pads) assert.ok(o.scale.y >= 0);
    }
  });
}
