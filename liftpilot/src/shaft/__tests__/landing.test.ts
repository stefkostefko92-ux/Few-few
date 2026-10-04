// The landing door set apart from its car door (landing.ts): the plan moves it alone along its wall, the same at every
// floor; the wall's opening, the portal, the sill and the call station go with it, the car door and its operator stay;
// the check says how far its clear opening runs past the car door's, the passage is what the two openings share; the
// plans draw both axes and the distance between them, which moves the landing door; nothing changes without it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Chain, Entity } from '../../drawing';
import {
  KV, applyEdit, callStationAt, callStationOf, defaultInputs, keptPlan, layout, marbleOpening, planDims, planEntities, planValues, type ShaftInputs,
} from '../index';
import { shaftInputsSchema } from '../../lib/shaft-input';

const chains = (es: readonly Entity[]): Chain[] => es.flatMap((e) => (e.e === 'chain' ? [e.c] : []));
const at = (I: ShaftInputs, shift: number, side: 'A' | 'B' = 'A'): ShaftInputs => {
  const d = layout(I).doors.find((x) => x.side === side);
  assert.ok(d);
  return { ...I, plan: { ...I.plan, [side === 'A' ? 'landA' : 'landB']: d.u0 + shift } };
};
const check = (I: ShaftInputs, id: string) => layout(I).checks.find((c) => c.id === id);

test('la porta di piano si sposta da sola: la porta di cabina e l\'operatore restano, il telaio va con lei', () => {
  const I = defaultInputs(1600, 1750), [d0] = layout(I).doors, [d] = layout(at(I, 40)).doors;
  assert.equal(d0.l0, d0.u0, 'senza spostamento: in linea');
  assert.deepEqual([d.u0, d.u1, d.op0, d.op1], [d0.u0, d0.u1, d0.op0, d0.op1]);
  assert.deepEqual([d.l0, d.l1, d.frame0, d.frame1], [d0.l0 + 40, d0.l1 + 40, d0.frame0 + 40, d0.frame1 + 40]);
  // the car door moved by hand: the landing door set apart stays where it is set
  const moved = layout({ ...at(I, 40), plan: { ...at(I, 40).plan, doorA: d0.u0 + 30 } }).doors[0];
  assert.equal(moved.u0, d0.u0 + 30);
  assert.equal(moved.l0, d0.u0 + 40);
  assert.equal(planValues(layout(at(I, 40))).landA, d0.u0 + 40);
  assert.equal(planValues(layout(I)).landA, d0.u0, 'il valore calcolato: in linea con la cabina');
});

test('verifica: la luce di piano oltre quella di cabina al massimo di 50 mm per lato; il passaggio è la parte comune', () => {
  const I = defaultInputs(1600, 1750);
  assert.equal(check(I, 'v_land'), undefined, 'nessuna verifica senza spostamento');
  for (const [s, status] of [[40, 'ok'], [-50, 'ok'], [60, 'fail'], [-75, 'fail']] as const) {
    const c = check(at(I, s), 'v_land');
    assert.ok(c);
    assert.deepEqual([c.value, c.limit, c.status], [Math.abs(s), KV.landingShiftMax, status], `spostamento ${s}`);
  }
  const acc: ShaftInputs = { ...I, access: 'dm236_existing' };
  assert.equal(check(acc, 'v_acc_door')?.value, I.doorWidth);
  assert.equal(check(at(acc, 30), 'v_acc_door')?.value, I.doorWidth - 30);
  // the second entrance has its own
  const O: ShaftInputs = { ...I, entrances: 'opposite', D: 2000 };
  assert.deepEqual([check(at(O, -20, 'B'), 'v_land2')?.value, check(at(O, -20, 'B'), 'v_land')], [20, undefined]);
  assert.equal(layout(at(O, -20, 'B')).doors[1].l0, layout(O).doors[1].u0 - 20);
});

test('pianta: vano nel muro, portale, soglia e bottoniera con la porta di piano; assi e disassamento modificabile', () => {
  const I = at(defaultInputs(1600, 1750), 35), L = layout(I), [d] = L.doors, floor = I.vertical.main;
  const m = marbleOpening(I, d);
  assert.deepEqual([m.u0, m.u1], [d.l0 - KV.doorPortal, d.l1 + KV.doorPortal]);
  assert.equal(callStationAt(d, callStationOf(I)).from, d.l1 + KV.doorPortal);
  const es = planEntities(L, 'main', floor), axes = es.filter((e) => e.e === 'line' && e.st === 'axis' && e.a[0] === e.b[0]).map((e) => (e.e === 'line' ? e.a[0] : 0));
  for (const u of [(d.u0 + d.u1) / 2, (d.l0 + d.l1) / 2]) assert.ok(axes.includes(u), `asse a ${u}`);
  const cs = chains(planDims(L, 'main', floor, { level: 'x' }));
  const porta = cs.find((c) => c.text?.[1]?.startsWith('Porta Piano'));
  assert.deepEqual(porta?.pts, [0, d.l0, d.l1, I.W]);
  assert.equal(porta?.edit?.[0]?.key, 'plan.landA');
  const dis = cs.find((c) => c.text?.[0]?.startsWith('Disassamento'));
  assert.ok(dis?.edit?.[0]);
  assert.equal(dis.pts[1] - dis.pts[0], 35);
  // typing a new distance moves the landing door, either way
  for (const [shift, len] of [[35, 20], [-35, 20]] as const) {
    const J = at(defaultInputs(1600, 1750), shift), e = chains(planDims(layout(J), 'main', floor, { level: 'x' })).find((c) => c.text?.[0]?.startsWith('Disassamento'))?.edit?.[0];
    assert.ok(e);
    const next = applyEdit(J, e, len);
    assert.ok(next);
    const n = layout(next).doors[0];
    assert.equal(n.l0 - n.u0, Math.sign(shift) * len);
  }
  // in line: neither the axes nor the distance
  const plain = layout(defaultInputs(1600, 1750));
  assert.equal(chains(planDims(plain, 'main', floor, { level: 'x' })).some((c) => c.text?.[0]?.startsWith('Disassamento')), false);
});

test('la porta di piano spostata resta se il vano cambia misura, quella dell\'accesso B se ne va con gli accessi', () => {
  const I = at(defaultInputs(1600, 1750), 30), land = I.plan?.landA;
  assert.deepEqual(keptPlan(I, { ...I, W: 1620 }), { landA: land });
  const O = at({ ...defaultInputs(1600, 2000), entrances: 'opposite' }, 25, 'B');
  assert.equal(keptPlan(O, { ...O, entrances: 'one' }), undefined);
  assert.ok(shaftInputsSchema.safeParse(I).success);
  assert.equal(shaftInputsSchema.safeParse({ ...I, plan: { landA: -5 } }).success, false);
});
