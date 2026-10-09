// The room of a machine below with its sizes set on its drawings (ShaftInputs.below): beside the shaft it keeps its side
// at the wall it stands past and grows away from it, across from its side nearest the origin; under the pit from its
// corner nearest the origin, its height taking the machine's floor down; the machine has to stay inside it (m_fit), and
// the room is checked as a machine room; a pulley room over the shaft with its own values (below-checks.ts), the
// software's standard one — the room the sheets draw — when the design has none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { belowFit, belowMachine, belowRoom, bottomGeo, sheaveHalfBelow, type BottomScheme } from '@/lib/lift/bottom';
import { belowSectionEntities } from '@/lib/tavole/below-view';
import { sheaveAxisBelow } from '@/lib/lift/machine';
import { KL } from '@/lib/lift/norme';
import { pulleyRoomOf, sheetLayout } from '@/lib/lift/shaft-rig';
import { ROOM_PLACEHOLDER, ownPulleyRoom } from '@/lib/lift/blank';
import { liftInputsSchema } from '@/lib/lift-input';
import { shaftInputsSchema } from '@/lib/shaft-input';
import { KV_VERT } from '@/shaft/norme-vert';
import { DEFAULT_ROOM, mergeChecks, type BelowRoom, type RoomInputs, type ShaftCheckId, type ShaftInputs } from '@/shaft';

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

test('schema room senza un locale nel progetto: le verifiche del locale delle pulegge sul locale standard che si disegna', () => {
  // a design saved without a room over the shaft (up to LIFT 1.29.0 none of the three checks ran)
  const { d, g } = roomOf(below('room', { room: null })), I = d.analysis.ctx.I, M = d.machine;
  const at = (id: ShaftCheckId) => mergeChecks(d.layout.checks, d.supportChecks).find((c) => c.id === id);
  const drawn = sheetLayout(d.layout, I.r, I.Dp, M.n, M.d, g).inputs.room;
  assert.ok(drawn);
  // the room the sheets draw is the one measured: the standard one, as high as a pulley room must be, its door the least
  assert.deepEqual(drawn, pulleyRoomOf({ ...d.layout.inputs, room: null }));
  assert.deepEqual([at('m_pheight')?.value, at('m_pheight')?.status], [drawn.H, 'ok']);
  assert.equal(drawn.H, KV_VERT.pulleyRoomH);
  assert.deepEqual([drawn.doorW, drawn.doorH, at('m_pdoor')?.value, at('m_pdoor')?.status], [KV_VERT.doorMinW, KV_VERT.pulleyDoorH, 0, 'ok']);
  assert.equal(at('m_pabove')?.value, drawn.H - (KL.pulleyRoomAxis + I.Dp / 2));
  // a room entered takes its place, in the checks and on the sheets alike
  const own = roomOf(below('room', { room: { ...DEFAULT_ROOM, H: 1450, doorW: 650, doorH: 1450 } }));
  const ownAt = (id: ShaftCheckId) => mergeChecks(own.d.layout.checks, own.d.supportChecks).find((c) => c.id === id);
  assert.deepEqual([ownAt('m_pheight')?.value, ownAt('m_pheight')?.status, ownAt('m_pdoor')?.status], [1450, 'fail', 'ok']);
  assert.equal(sheetLayout(own.d.layout, I.r, I.Dp, M.n, M.d, own.g).inputs.room?.H, 1450);
});

test('schema room: il locale standard reso proprio da una misura si salva; la porta minima del locale delle pulegge', () => {
  // a design saved without a pulley room: the form shows the standard one, and the first measure entered makes it the
  // design's own (RoomOptions). Until round 37's review the save refused it (no panel, a door under 1500 mm) and the
  // form had no field to mend it: it starts now from the placeholder's panel, which a pulley room neither draws nor checks
  const inp = below('room', { room: null }), own = ownPulleyRoom(pulleyRoomOf(inp.shaft));
  const saved = (room: RoomInputs) => liftInputsSchema.safeParse({ ...inp, shaft: { ...inp.shaft, room } });
  assert.equal(shaftInputsSchema.safeParse({ ...inp.shaft, room: { ...own, H: 1600 } }).success, true);
  assert.equal(saved({ ...own, H: 1600 }).success, true);
  const checks = (i: LiftInputs) => {
    const d = deriveLift(i), m = mergeChecks(d.layout.checks, d.supportChecks);
    return ['m_pheight', 'm_pdoor', 'm_pabove'].map((id) => m.find((c) => c.id === id)).map((c) => [c?.status, c?.value]);
  };
  // made its own, the room is checked as the standard one was
  assert.deepEqual(checks({ ...inp, shaft: { ...inp.shaft, room: own } }), checks(inp));
  // a door as small as a pulley room's may be (600 × 1400 mm): saved and passed; lower, refused by the save
  const door = { ...ROOM_PLACEHOLDER, H: 1600, doorW: KV_VERT.doorMinW, doorH: KV_VERT.pulleyDoorH };
  assert.equal(saved(door).success, true);
  assert.deepEqual(checks({ ...inp, shaft: { ...inp.shaft, room: door } })[1], ['ok', 0]);
  const low = saved({ ...door, doorH: KV_VERT.pulleyDoorH - 10 });
  assert.equal(low.success, false);
  assert.deepEqual(low.error?.issues.map((i) => i.path.join('.')), ['shaft.room.doorH']);
  // the same door to a machine room is saved too, and fails its own check (2000 mm: m_door)
  const top = deriveLift({ ...inp, calc: { ...inp.calc, layout: 'topDefl' }, shaft: { ...inp.shaft, room: door } });
  assert.equal(mergeChecks(top.layout.checks, top.supportChecks).find((c) => c.id === 'm_door')?.status, 'fail');
});
