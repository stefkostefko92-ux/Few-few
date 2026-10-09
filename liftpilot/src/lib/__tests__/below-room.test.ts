// The room of a machine below with its sizes set on its drawings (ShaftInputs.below): beside the shaft it keeps its side
// at the wall it stands past and grows away from it, across from its side nearest the origin; under the pit from its
// corner nearest the origin, its height taking the machine's floor down; the machine has to stay inside it (m_fit), and
// the room is checked as a machine room; a pulley room over the shaft with its own values (below-checks.ts); under the pit
// its plan and section C-C cut the pit's slab where the shaft's sheets and the 3D cut it (pitSlabHoles, round 37).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { belowFit, belowMachine, belowRoom, bottomGeo, sheaveHalfBelow, type BottomScheme } from '@/lib/lift/bottom';
import { belowPlanEntities, belowSectionEntities } from '@/lib/tavole/below-view';
import { belowGeoOf, sheetLayoutOf } from '@/lib/tavole/views';
import { sheaveAxisBelow } from '@/lib/lift/machine';
import { DEFAULT_ROOM, mergeChecks, section, type BelowRoom, type ShaftCheckId, type ShaftInputs } from '@/shaft';
import { pitSlabHoles } from '@/shaft/shaft-rig';

const below = (scheme: BottomScheme, p: Partial<ShaftInputs> = {}): LiftInputs => {
  const b = newLift();
  return { ...b, calc: { ...b.calc, layout: 'bottom' }, shaft: { ...b.shaft, ...p }, bottom: scheme };
};
const roomOf = (inp: LiftInputs, set?: BelowRoom) => {
  const d = deriveLift(set ? { ...inp, shaft: { ...inp.shaft, below: set } } : inp), L = d.layout, M = d.machine, scheme = d.bottom;
  assert.ok(scheme);
  const g = bottomGeo(L, scheme, M.D, d.analysis.ctx.I.Dp, M.n, M.d, d.analysis.ctx.I.r, sheaveAxisBelow(M.D, M.shape ?? null), sheaveHalfBelow(M.D, M.n, M.d, M.shape ?? null));
  const m = belowMachine(L, g, M.D, M.shape ?? null);
  return { d, g, R: belowRoom(L, g, m.body).room, fit: belowFit(L, g, M)[0] };
};

test('macchina in basso accanto al vano: le misure date sui disegni, il lato al muro resta', () => {
  const rear = below('head'), a = roomOf(rear), b = roomOf(rear, { W: a.R.W + 300, D: a.R.D + 400, H: 2700, doorW: 900, doorH: 2100 });
  assert.equal(a.fit.status, 'ok');
  assert.deepEqual([b.R.W, b.R.D, b.R.H, b.R.doorW, b.R.doorH], [a.R.W + 300, a.R.D + 400, 2700, 900, 2100]);
  // the room past the rear wall (the drops along +y): its near side (min y) stays, across its side nearest the origin
  assert.equal(b.R.shaftY, a.R.shaftY);
  assert.equal(b.R.shaftX, a.R.shaftX);
  // past the left wall (the drops along −x): its side at the wall (max x) stays as it grows
  const left = below('head', { cw: 'left' }), c = roomOf(left), e = roomOf(left, { W: c.R.W + 500 });
  assert.equal(e.R.W - e.R.shaftX, c.R.W - c.R.shaftX, 'il lato al muro resta');
  // too small for the machine: m_fit says so, in the derivation's checks too
  const tiny = roomOf(rear, { W: 1000, D: 1000 });
  assert.equal(tiny.fit.status, 'fail');
  assert.equal(tiny.d.supportChecks.find((x) => x.id === 'm_fit')?.status, 'fail');
});

test('macchina sotto il vano: il locale dal suo angolo, la sua altezza porta giù il pavimento della macchina', () => {
  const under = below('under'), a = roomOf(under), b = roomOf(under, { H: 3000, W: a.R.W + 200 });
  assert.equal(b.R.shaftX, a.R.shaftX);
  assert.equal(b.R.W, a.R.W + 200);
  assert.equal(a.g.roomFloor - b.g.roomFloor, 3000 - a.R.H);
  assert.equal(b.fit.status, 'ok');
  // the calculation follows the machine down (the runs from the head pulleys are longer)
  assert.ok(Number(b.d.values.Hv) > Number(a.d.values.Hv));
});

test('sezione C-C con calate oblique: in squadra al muro dietro il contrappeso, le lunghezze del vano e del locale esatte', () => {
  // the counterweight's drop moved by hand: the drop line askew to the shaft; the runs, the machine and the section keep
  // to the wall behind the counterweight (until LIFT 1.27.0 they followed the drops' line: the lengths were references)
  const keys = (scheme: BottomScheme, cwPos?: number): string[] => {
    const b = below(scheme), inp = cwPos === undefined ? b : { ...b, shaft: { ...b.shaft, plan: { ...(b.shaft.plan ?? {}), cwPos } } };
    const { d, g } = roomOf(inp), [dx, dy] = [g.cw[0] - g.car[0], g.cw[1] - g.car[1]];
    assert.ok(cwPos === undefined || Math.min(Math.abs(dx), Math.abs(dy)) > 50, 'calate oblique');
    assert.equal(Math.max(Math.abs(g.dir[0]), Math.abs(g.dir[1])), 1, 'in squadra al muro');
    const chains = belowSectionEntities(d.layout, d.machine, g).entities.flatMap((e) => (e.e === 'chain' && e.c.dir === 'x' ? [e.c] : []));
    return chains.flatMap((c) => (c.edit ?? []).flatMap((e) => (e ? [e.key] : [])));
  };
  assert.deepEqual(keys('head').sort(), ['D', 'below.D', 'wall']);
  assert.deepEqual(keys('head', 200).sort(), ['D', 'below.D', 'wall']);
  assert.deepEqual(keys('under').sort(), ['D', 'below.D']);
  assert.deepEqual(keys('under', 200).sort(), ['D', 'below.D']);
});

test('macchina in basso: il suo locale verificato come un locale del macchinario (altezza, porta, quadro, superfici, percorsi)', () => {
  const ids: readonly ShaftCheckId[] = ['m_fit', 'm_height', 'm_panel', 'm_door', 'm_free', 'm_quadro', 'm_route'];
  // the software's room beside the shaft and under the pit passes them all
  for (const scheme of ['head', 'under'] as const) {
    const d = deriveLift(below(scheme)), got = new Map(d.supportChecks.map((c) => [c.id, c.status]));
    assert.deepEqual(ids.map((id) => [id, got.get(id)]), ids.map((id) => [id, 'ok']), scheme);
  }
  // a room 1700 mm high with a door of 500 × 1500 mm: the height and the door fail (until LIFT 1.23.0 only m_fit was checked)
  const low = deriveLift(below('head', { below: { H: 1700, doorW: 500, doorH: 1500 } })), at = (id: string) => low.supportChecks.find((c) => c.id === id);
  assert.deepEqual([at('m_height')?.status, at('m_height')?.value], ['fail', 1700]);
  assert.deepEqual([at('m_door')?.status, at('m_door')?.value], ['fail', -500]);
  // a room over the shaft holds no machine: its own checks give way to those of the machine's room
  const over = below('head', { room: { ...DEFAULT_ROOM, H: 1600 } }), m = mergeChecks(deriveLift(over).layout.checks, deriveLift(over).supportChecks);
  assert.deepEqual(m.filter((c) => c.id === 'm_height').map((c) => [c.value, c.status]), [[roomOf(over).R.H, 'ok']]);
});

test('macchina in basso con i rinvii sopra il vano: il locale delle pulegge con i suoi valori, senza quadro', () => {
  const pulleys = (H: number, doorW: number, doorH: number) => {
    const d = deriveLift(below('room', { room: { ...DEFAULT_ROOM, H, doorW, doorH } }));
    return { d, at: (id: string) => mergeChecks(d.layout.checks, d.supportChecks).find((c) => c.id === id) };
  };
  // 1600 mm and a door of 700 × 1500 mm: enough for a pulley room (1500, 600 × 1400), not for a machine room
  const ok = pulleys(1600, 700, 1500), Dp = ok.d.analysis.ctx.I.Dp;
  assert.deepEqual(['m_pheight', 'm_pdoor', 'm_pabove'].map((id) => ok.at(id)?.status), ['ok', 'ok', 'ok']);
  assert.equal(ok.at('m_pabove')?.value, 1600 - (450 + Dp / 2));
  // the machine room's checks are the machine's room's below, not the pulley room's
  assert.equal(ok.at('m_height')?.value, roomOf(below('room', { room: { ...DEFAULT_ROOM, H: 1600, doorW: 700, doorH: 1500 } })).R.H);
  // lower and narrower than the pulley room's values: they fail; the space over the pulleys is a warning
  const low = pulleys(1400, 550, 1300);
  assert.deepEqual([low.at('m_pheight')?.status, low.at('m_pdoor')?.status, low.at('m_pdoor')?.value], ['fail', 'fail', -100]);
  const tight = pulleys(450 + Dp / 2 + 200, 700, 1500);
  assert.equal(tight.at('m_pabove')?.status, 'warn');
  // the other schemes have no pulley room
  assert.equal(deriveLift(below('head', { room: { ...DEFAULT_ROOM } })).supportChecks.some((c) => c.id.startsWith('m_p') && c.id !== 'm_panel'), false);
});

test('macchina sotto la fossa: i fori nella soletta della fossa sui fogli del locale sono quelli della pianta della fossa e del 3D', () => {
  const ext = (pts: readonly (readonly [number, number])[]): number[] =>
    [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))].map(Math.round);
  for (const cw of ['rear', 'left', 'right'] as const) {
    const d = deriveLift(below('under', { cw })), g = belowGeoOf(d.analysis, d.layout, d.machine, 'under'), L = sheetLayoutOf(d.analysis, d.layout, d.machine, g);
    assert.ok(L.rig, cw);
    const holes = pitSlabHoles(L.rig);
    assert.equal(holes.length, 2, cw);
    // the plan of the room under the pit: the same two openings (until round 37 60 mm round the ropes, the shaft's 30)
    const quads = belowPlanEntities(L, d.machine, g).entities.flatMap((e) => (e.e === 'path' && e.st === 'thin' && e.pts.length === 4 ? [ext(e.pts)] : []));
    for (const h of holes) assert.ok(quads.some((q) => q.every((v, i) => v === ext(h)[i])), `${cw}: foro ${ext(h).join(',')} nella pianta del locale`);
    // section C-C: the slab cut across the openings' extent along the section (square to the wall behind the counterweight)
    const S = section(L), along = (p: readonly [number, number]): number => (p[0] - g.car[0]) * g.dir[0] + (p[1] - g.car[1]) * g.dir[1];
    const hs = holes.flat().map(along), slab = belowSectionEntities(L, d.machine, g).entities.flatMap((e) =>
      e.e === 'path' && e.fill === 'concrete' && Math.max(...e.pts.map((p) => p[1])) === S.pitFloor ? [ext(e.pts)] : []);
    assert.equal(slab.length, 2, cw);
    const [a, b] = slab.sort((p, q) => p[0] - q[0]);
    assert.deepEqual([a[1], b[0]], [Math.round(Math.min(...hs)), Math.round(Math.max(...hs))], `${cw}: apertura in C-C`);
  }
});
