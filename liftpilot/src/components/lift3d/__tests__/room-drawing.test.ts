// The drawings of the machine room and the 3D agree: the sheave's axis and the diverting pulley stand where the rope
// rig puts them, the slab is open where the 3D cuts it (with the car at either end of its travel), and each straight
// run of the ropes in section B-B touches the wheels it leaves and meets.
// Motion: none, nothing is drawn here; the scene's prefers-reduced-motion handling is in LiftStage.tsx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultLift, deriveLift, ropeRig } from '@/lib/lift';
import { section } from '@/shaft';
import { hitchDepths, roomGeo, roomRopes, slabHoles } from '@/shaft/machine-room';
import { slabOpenings } from '../slab';

type Shaft = ReturnType<typeof defaultLift>['shaft'];
const VARIANTS: readonly (readonly ['top' | 'topDefl', '1' | '2', Partial<Shaft>])[] = [
  // a direct pull at 2:1 needs falls a sheave apart: a deeper shaft than the example's (registry impianto.calata)
  ['topDefl', '1', {}], ['topDefl', '2', {}], ['top', '1', {}], ['top', '2', { D: 2000 }], ['topDefl', '1', { cw: 'left' }], ['top', '1', { cw: 'right' }],
];

for (const [layout, r, shaft] of VARIANTS) {
  test(`locale macchinario ${layout} ${r}:1${shaft.cw ? `, contrappeso ${shaft.cw}` : ''}: disegni e 3D concordano`, () => {
    const base = defaultLift(), dv = deriveLift({ ...base, shaft: { ...base.shaft, ...shaft }, calc: { ...base.calc, layout, r } });
    assert.deepEqual(dv.issues, [], 'progetto coerente');
    const L = dv.layout, M = dv.machine, G = roomGeo(L, M), rig = ropeRig(dv), S = section(L);
    assert.ok(G, 'il progetto ha un locale macchinario');
    // the sheave and the diverting pulley: along the drop line from the car's drop, heights over the room's floor
    assert.ok(Math.abs(G.sheaveAt - rig.sheave.u * 1000) < 0.5, `puleggia: ${G.sheaveAt} ≠ ${rig.sheave.u * 1000}`);
    assert.ok(Math.abs(M.axis - (rig.sheave.y - rig.roomFloor) * 1000) < 0.5, 'asse della puleggia');
    const defl = rig.wheels.find((w) => w.role === 'deflector');
    assert.equal(M.Dp > 0, defl !== undefined);
    if (defl) {
      assert.ok(Math.abs(G.pulleyAt - defl.u * 1000) < 0.5, `rinvio: ${G.pulleyAt} ≠ ${defl.u * 1000}`);
      assert.ok(Math.abs(G.pulleyZ - (defl.y - rig.roomFloor) * 1000) < 0.5, 'asse del rinvio');
    }
    // the slab's openings along the drop line: those of the 3D with the car at the lowest and at the top floor
    const travel = [dv.sim.levels[0], dv.sim.levels[dv.sim.levels.length - 1]].map((s) => [s, dv.sim.cw0 - s] as const);
    const slab = G.room.slab, cuts = slabOpenings(rig, M.n, M.d, S.ceiling / 1000, (S.ceiling + slab) / 1000, travel, null);
    const [ox, oy] = rig.origin, [dx, dy] = rig.dir;
    const along = cuts.map((o) => o.pts.map(([x, y]) => (x - ox) * dx + (y - oy) * dy)).map((us) => [Math.min(...us), Math.max(...us)]).sort((a, b) => a[0] - b[0]);
    const holes = slabHoles(M, G, slab, hitchDepths(L).ends);
    assert.equal(holes.length, along.length, `aperture: ${JSON.stringify(holes)} / ${JSON.stringify(along)}`);
    holes.forEach((h, i) => assert.ok(Math.abs(h.u0 - along[i][0]) < 1 && Math.abs(h.u1 - along[i][1]) < 1, `apertura ${i}: ${h.u0}–${h.u1} ≠ ${along[i][0]}–${along[i][1]}`));
    // the runs of section B-B: each end on its wheel, the line tangent to it
    const [car, cw] = hitchDepths(L).mid, wheels = [{ c: [G.sheaveAt, M.axis], r: M.D / 2 }, ...(M.Dp > 0 ? [{ c: [G.pulleyAt, G.pulleyZ], r: M.Dp / 2 }] : [])];
    for (const [p, q] of roomRopes(M, G, car, cw)) {
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      for (const w of wheels) {
        const dist = Math.abs((q[0] - p[0]) * (p[1] - w.c[1]) - (p[0] - w.c[0]) * (q[1] - p[1])) / len;
        const touches = [p, q].some((e) => Math.abs(Math.hypot(e[0] - w.c[0], e[1] - w.c[1]) - w.r) < 1e-6);
        if (touches) assert.ok(Math.abs(dist - w.r) < 1e-6, `tratto ${JSON.stringify([p, q])} non tangente (${dist} ≠ ${w.r})`);
      }
    }
  });
}
