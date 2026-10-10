// Where the overspeed governor's rope runs (registry limitatore.posto): on a side wall free of doors and of the
// counterweight — the one chosen when free —, its plane and its clamped strand set by hand on the plan (plan.govX,
// plan.govY), the checks of the rope in plan (v_gov, v_govrail) and of the governor on the room's floor (m_gov,
// m_govfree), the dimensions that move it, in the shaft's plan and in the machine room's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Chain, Entity } from '../../drawing';
import { DEFAULT_ROOM, KV_VERT, applyEdit, defaultInputs, freeSides, governorSpot, layout, planDims, roomGeo, roomPlanEntities, type MachineSpec, type ShaftInputs } from '../index';
import { governorChecks } from '../governor';
import { governorRoomChecks } from '../support-check';
import { governorFootprint } from '../room-site';

const chains = (es: readonly Entity[]): Chain[] => es.flatMap((e) => (e.e === 'chain' ? [e.c] : []));
const I0: ShaftInputs = { ...defaultInputs(1600, 1750), room: DEFAULT_ROOM };
const M: MachineSpec = { D: 400, Dp: 0, n: 5, d: 8, mass: 400, label: '', axis: 600, h: 0, reverse: false, ropeIn: 0 };
const ids = (I: ShaftInputs): [string, string][] => governorChecks(layout(I)).map((c) => [c.id, c.status]);

test('limitatore: il lato scelto se libero, altrimenti l’ultimo lato libero', () => {
  const L = layout(I0), free = freeSides(L);
  assert.ok(free.length >= 1);
  assert.equal(governorSpot(L)?.side, free.at(-1));
  if (free.length === 2) assert.equal(governorSpot(layout({ ...I0, governorSide: free[0] }))?.side, free[0]);
  // a side with the counterweight is never the governor's
  const left = layout({ ...I0, cw: 'left', governorSide: 'left' });
  assert.notEqual(governorSpot(left)?.side, 'left');
  assert.deepEqual(ids(I0), [['v_gov', 'ok'], ['v_govrail', 'ok'], ['v_govdd', 'ok']]);
});

test('limitatore: pulegge di almeno 30 volte la fune (UNI EN 81-20:2020, 5.6.2.2.1.3 c)); senza posto, avviso', () => {
  const dd = (model: string) => governorChecks(layout({ ...I0, governor: model })).find((c) => c.id === 'v_govdd');
  // LK200 Ø 200 with a 6 mm rope (33,3) passes; LX120 Ø 120 and LX150 Ø 150 with 6 mm (20 and 25) do not; LK120 with 4 mm, 30
  assert.equal(dd('LK200')?.status, 'ok');
  assert.equal(dd('LX120')?.status, 'fail');
  assert.equal(dd('LX150')?.status, 'fail');
  assert.equal(dd('LK120')?.status, 'ok');
  assert.ok(Math.abs((dd('LX120')?.value ?? 0) - 20) < 1e-9);
  // no side wall free of doors and of the counterweight: no place for the rope, the check warns without a value (the
  // governor is placed by hand)
  const none: ShaftInputs = { ...I0, entrances: 'adjacent', side2: 'right' };
  assert.equal(governorSpot(layout(none)), null);
  const v = governorChecks(layout(none)).find((c) => c.id === 'v_gov');
  assert.equal(v?.status, 'warn');
  assert.equal(v?.value, null);
});

test('limitatore: fune e ramo agganciato messi a mano, con le loro verifiche', () => {
  const g0 = governorSpot(layout(I0));
  assert.ok(g0);
  const set = { ...I0, plan: { govX: 80, govY: g0.rail.y + 300 } }, g = governorSpot(layout(set));
  assert.ok(g);
  assert.equal(g.side === 'left' ? g.x : I0.W - g.x, 80);
  assert.equal(g.y1, g0.rail.y + 300);
  // too near the wall, too far from the rail: the checks say so
  const bad = { ...I0, plan: { govX: 20, govY: g0.rail.y + KV_VERT.govReach + 50 } };
  assert.deepEqual(ids(bad), [['v_gov', 'fail'], ['v_govrail', 'fail'], ['v_govdd', 'ok']]);
  // in front of the rail: the lever toward the front
  const front = governorSpot(layout({ ...I0, plan: { govY: g0.rail.y - 200 } }));
  assert.ok(front && front.y1 < front.rail.y);
});

test('limitatore: le quote che lo spostano, nella pianta del vano e del locale', () => {
  const main = (I: ShaftInputs): number => Math.min(I.vertical.main, I.vertical.floors.length - 1);
  const L = layout(I0), cs = chains(planDims(L, 'main', main(I0), { level: 'x' }));
  const keyed = (key: string): Chain | undefined => cs.find((c) => c.edit?.some((e) => e?.key === key));
  for (const key of ['plan.govX', 'plan.govY']) {
    const c = keyed(key);
    assert.ok(c, key);
    const i = c.edit?.findIndex((e) => e?.key === key) ?? -1, e = c.edit?.[i];
    assert.ok(e);
    const now = Math.round(Math.abs(c.pts[i + 1] - c.pts[i])), next = applyEdit(I0, e, now + 40);
    assert.ok(next, key);
    const c2 = chains(planDims(layout(next), 'main', main(next), { level: 'x' })).find((x) => x.edit?.some((y) => y?.key === key));
    assert.ok(c2);
    assert.equal(Math.round(Math.abs(c2.pts[i + 1] - c2.pts[i])), now + 40, `${key} legge il nuovo valore`);
  }
  const G = roomGeo(L, M);
  assert.ok(G);
  const room = chains(roomPlanEntities(L, M, G).entities);
  assert.ok(room.some((c) => c.edit?.some((e) => e?.key === 'plan.govX')) && room.some((c) => c.edit?.some((e) => e?.key === 'plan.govY')));
});

test('limitatore nel locale: fuori dall’argano, dal quadro e dall’interruttore, con la sua superficie libera', () => {
  const L = layout(I0), G = roomGeo(L, M);
  assert.ok(G);
  const box = governorFootprint(L, G.room);
  assert.ok(box);
  assert.deepEqual(governorRoomChecks(box, G, M).map((c) => c.id), ['m_gov', 'm_govfree']);
  // over the machine: m_gov fails
  const over = governorRoomChecks([G.carDrop[0] - 50, G.carDrop[1] - 50, G.carDrop[0] + 50, G.carDrop[1] + 50], G, M);
  assert.equal(over.find((c) => c.id === 'm_gov')?.status, 'fail');
  assert.deepEqual(governorRoomChecks(null, G, M), []);
});
