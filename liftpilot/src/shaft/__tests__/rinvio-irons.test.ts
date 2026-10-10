// The bedplate with the diverting pulley carries the machine on its beams (rinvio.ts bedplateBeams): its side beams
// under the machine's outer irons, or as wide as the maker's bedplate with a beam of its own under each iron they do not
// carry — every iron on a beam, the mounts of the bedframe on them; the ropes going down between two of them, clear of
// every one (the pulley hangs under them). For every maker's bedplate in the catalogue the default design takes (SICOR)
// and for ours under the generic machine, the machine as the software stands it and turned round by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultLift, deriveLift, type LiftInputs } from '@/lib/lift';
import { machineV, roomGeo } from '../machine-room';
import { KV_VERT } from '../norme-vert';
import { PROFILES } from '../profiles';
import { shapeOf } from '@/lib/catalog/shapes';
import { makerBedplate } from '@/lib/catalog/bedplates';
import { IRON, machineFrame } from '../machine-shape';
import { bedplateBeams, rinvioAcross } from '../rinvio';
import { ropeWidths } from '../ropes';

type Room = NonNullable<LiftInputs['shaft']['room']>;
const CASES: readonly (readonly [string, LiftInputs['catalog']])[] = [
  ['generico', undefined], ...['SH140', 'SH160', 'SH190'].map((model) => [model, { brand: 'SICOR', model }] as const),
];

for (const [name, catalog] of CASES) {
  for (const motor of [undefined, 'car'] as const) {
    test(`telaio con rinvio, ${name}${motor ? ', girato a mano' : ''}: una trave sotto ogni ferro, le funi fra le travi`, () => {
      const base = defaultLift(), R0 = base.shaft.room as Room;
      const dv = deriveLift({ ...base, ...(catalog ? { catalog } : {}), shaft: { ...base.shaft, room: { ...R0, ...(motor ? { motor } : {}) } } });
      const G = roomGeo(dv.layout, dv.machine), M = dv.machine, rf = M.rinvio;
      assert.ok(G && rf && rf.on === 'frame', 'argano sul telaio con rinvio');
      if (catalog) assert.ok(rf.maker, `il telaio del costruttore per ${name}`);
      const [v0, v1] = rinvioAcross(G, rf), b = PROFILES[KV_VERT.rinvioBeam].b, half = ropeWidths(M.n, M.d).ropes;
      const width = rf.maker?.width ?? KV_VERT.rinvioWidth, v = (z: number): number => machineV(G, z);
      assert.ok(v1 - v0 >= width - 1e-9, `largo ${(v1 - v0).toFixed(0)} < ${width}`);
      const { inner } = bedplateBeams(G.frame.beams, width), sides = [v0 + b / 2, v1 - b / 2], rails = [...sides, ...inner.map(v)];
      // every iron on a beam: a side beam under it (its flange on theirs) or one of its own
      for (const z of G.frame.beams) {
        const onSide = sides.some((s) => Math.abs(v(z) - s) < (b + IRON) / 2), own = inner.includes(z);
        assert.ok(onSide !== own, `ferro a ${v(z).toFixed(0)}: ${onSide ? 'sulla trave laterale' : ''}${own ? ' con la sua trave' : ''}`);
      }
      // the outer irons over the side beams when the bedplate is no wider than they need
      if (v1 - v0 > width + 1e-9) for (const z of [G.frame.beams[0], G.frame.beams[G.frame.beams.length - 1]]) assert.ok(sides.some((s) => Math.abs(v(z) - s) < 1e-6));
      // the ropes (v = 0) down between two beams, clear of every one (the pulley hangs under them)
      for (const r of rails) assert.ok(Math.abs(r) - b / 2 >= half, `trave a ${r.toFixed(0)} sulle funi larghe ${half.toFixed(0)}`);
      assert.ok(rails.some((r) => r < 0) && rails.some((r) => r > 0), 'le funi fra le travi');
    });
  }
}

// every SICOR model with its bedplate in the catalogue, on the sheave Ø 480 and with six ropes of 10 mm: in the
// machine's own frame (z), the ropes down in the sheave's plane between the beams (the pulley hangs under them)
test('telai con rinvio del costruttore: ogni ferro su una trave, le funi fra le travi', () => {
  const b = PROFILES[KV_VERT.rinvioBeam].b, half = ropeWidths(6, 10).ropes;
  for (const model of ['SV110', 'SH110B', 'SH130', 'SH130G', 'SH140', 'SH160', 'SH190']) {
    const S = shapeOf('SICOR', model), bed = makerBedplate('SICOR', model, 480, 400);
    assert.ok(S && bed, model);
    const F = machineFrame(480, S), { edges, inner } = bedplateBeams(F.beams, bed.width), sides = [edges[0] + b / 2, edges[1] - b / 2];
    assert.ok(edges[1] - edges[0] >= bed.width - 1e-9, model);
    for (const z of F.beams) assert.ok(sides.some((sd) => Math.abs(z - sd) < (b + IRON) / 2) !== inner.includes(z), `${model}: ferro a ${z.toFixed(0)}`);
    for (const r of [...sides, ...inner]) assert.ok(Math.abs(r - F.zSheave) - b / 2 >= half, `${model}: trave a ${r.toFixed(0)}, funi a ${F.zSheave.toFixed(0)} ± ${half.toFixed(0)}`);
  }
});
