// Changing a distance where it is drawn: every editable dimension of the plans and of section A-A, given a new
// length, reads that length once the shaft is laid out again (and typing the length it has changes nothing); the
// distances set by hand are kept, checked, dropped with the arrangement they belong to and reset one by one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Chain, Edit, Entity } from '../../drawing';
import {
  applyEdit, defaultInputs, editValue, keptPlan, layout, planDims, planValues, section, sectionDims, valueOf, withValue, withoutFix,
} from '../index';
import type { PlanLevel, SectionKind, ShaftInputs } from '../index';

const chains = (es: readonly Entity[]): Chain[] => es.flatMap((e) => (e.e === 'chain' ? [e.c] : []));
/** What a segment reads: the real length the edit carries, or the measured one. */
const reads = (c: Chain, i: number): number => Math.round(c.edit?.[i]?.value ?? Math.abs(c.pts[i + 1] - c.pts[i]));

const CASES: readonly (readonly [string, (I: ShaftInputs) => ShaftInputs])[] = [
  ['un accesso, contrappeso sul fondo', (I) => I],
  ['contrappeso a sinistra', (I) => ({ ...I, cw: 'left' })],
  ['contrappeso a destra, porte centrali', (I) => ({ ...I, cw: 'right', door: 'C2' })],
  ['accessi opposti', (I) => ({ ...I, entrances: 'opposite', D: 2000 })],
  ['accessi adiacenti a destra', (I) => ({ ...I, entrances: 'adjacent', side2: 'right', W: 1900, D: 1900 })],
  ['accessi adiacenti a sinistra, portata data', (I) => ({ ...I, entrances: 'adjacent', side2: 'left', W: 1900, D: 1900, Q: 630 })],
  ['portata data, cabina dispari', (I) => ({ ...I, Q: 630, W: 1611, carWall: 36 })],
];
const LEVELS: readonly PlanLevel[] = ['top', 'main', 'bottom', 'pit'];

/** Each editable segment of the drawings of `draw`: given its length + d, the same segment reads it afterwards. */
function roundTrip(I: ShaftInputs, draw: (I: ShaftInputs) => Chain[], name: string): number {
  const before = draw(I);
  let n = 0;
  before.forEach((c, j) => c.edit?.forEach((e, i) => {
    if (!e) return;
    const now = reads(c, i);
    // a segment of no length has no lettering to click
    if (now === 0) return;
    for (const d of [0, 10, ...(now > 10 ? [-10] : [])]) {
      const next = applyEdit(I, e, now + d);
      assert.ok(next, `${name}: ${e.key} non è un dato`);
      const after = draw(next)[j];
      assert.ok(after, `${name}: catena ${j} sparita`);
      assert.equal(reads(after, i), now + d, `${name}: ${e.key} (catena ${j}, tratto ${i}) ${now} → ${now + d}`);
    }
    n++;
  }));
  return n;
}

for (const [name, make] of CASES) {
  test(`quote modificabili in pianta: ogni quota legge il valore scritto (${name})`, () => {
    const I = make(defaultInputs(1600, 1750));
    let n = 0;
    for (const level of LEVELS) {
      n += roundTrip(I, (J) => {
        const L = layout(J), floor = level === 'top' ? J.vertical.floors.length - 1 : level === 'main' ? J.vertical.main : 0;
        return chains(planDims(L, level, floor, { level: 'x' }));
      }, `${name}, ${level}`);
    }
    assert.ok(n > 30, `${n} quote`);
  });
}

test('quote modificabili in sezione A-A: altezze di fossa, testata, cabina, arcata, porte, ammortizzatori', () => {
  const I = defaultInputs(1600, 1750), top = I.vertical.floors.length - 1;
  const views: readonly (readonly [SectionKind, number])[] = [['full', top], ['top', top], ['floor', 0], ['pit', 0]];
  const keys = new Set<string>();
  for (const [kind, floor] of views) {
    roundTrip(I, (J) => {
      const L = layout(J), es = chains(sectionDims(L, section(L), kind, floor, null));
      for (const c of es) for (const e of c.edit ?? []) if (e) keys.add(e.key);
      return es;
    }, kind);
  }
  for (const k of ['v.pit', 'v.headroom', 'v.opTop', 'doorHeight', 'v.carOutH', 'v.frameTop', 'v.carH', 'v.parapet', 'v.carBufferBase', 'v.carBufferH',
    'v.frameBelow', 'v.cwBufferBase', 'v.cwBufferH', 'v.cwH']) assert.ok(keys.has(k), k);
});

test('sezione accorciata: le quote dicono le altezze vere, non quelle disegnate', () => {
  const I = defaultInputs(1600, 1750), L = layout(I), S = section(L), V = I.vertical;
  const es = chains(sectionDims(L, S, 'full', V.floors.length - 1, { z0: 0, z1: S.top, f: 0.2 }));
  const cw = es.find((c) => c.text?.[0]?.includes('Ingombro Totale Contrappeso'));
  assert.ok(cw);
  assert.equal(cw.text?.[0], `${V.cwH} H. Ingombro Totale Contrappeso`);
  assert.equal(cw.edit?.[0]?.value, V.cwH);
});

test('un valore a mezzo millimetro va dalla parte che fa leggere la quota scritta', () => {
  const e: Edit = { key: 'plan.carX', base: -605.5, k: 1 }, f: Edit = { key: 'plan.carX', base: 1000 - 605.5, k: -1 };
  assert.equal(editValue(e, 1000), 394); // asse a 394 + 605,5 = 999,5: si legge 1000
  assert.equal(editValue(f, 300), 95); // dal muro di destra 1000 − 95 − 605,5 = 299,5: si legge 300
});

test('le quote fissate a mano restano, la cabina fuori posto non passa', () => {
  const I = defaultInputs(1600, 1750), L = layout(I);
  assert.ok(!L.checks.some((c) => c.id === 'v_place' || c.id === 'v_doorcar'), 'senza quote a mano niente verifiche in più');
  const v = planValues(L);
  assert.equal(v.A, L.A);
  assert.equal(v.carX, L.car.x);
  // the same values set by hand: the same plan
  const same = layout({ ...I, plan: { A: v.A, B: v.B, carX: v.carX, doorA: v.doorA, railY: v.railY, cwLen: v.cwLen, cwPos: v.cwPos, opLen: v.opLen } });
  assert.deepEqual(same.car, L.car);
  assert.deepEqual(same.cw, L.cw);
  assert.deepEqual(same.doors, L.doors);
  assert.ok(same.checks.every((c) => c.status === 'ok'), 'tutto conforme');
  // the car pushed into the rails of the left wall, a door past the car's side
  const moved = layout({ ...I, plan: { carX: L.car.x - 50 } });
  assert.equal(moved.checks.find((c) => c.id === 'v_place')?.status, 'fail');
  assert.equal(moved.checks.find((c) => c.id === 'v_place')?.value, -50);
  const door = layout({ ...I, plan: { doorA: L.carInner.x + L.A - I.doorWidth + 30 } });
  assert.equal(door.checks.find((c) => c.id === 'v_doorcar')?.status, 'fail');
  assert.equal(door.checks.find((c) => c.id === 'v_doorcar')?.value, -30);
});

test('quote a mano: cambiano gli accessi o il lato del contrappeso, restano solo quelle che vogliono dire ancora lo stesso', () => {
  const I: ShaftInputs = { ...defaultInputs(1600, 1750), plan: { A: 1100, carX: 220, cwPos: 300, railY: 900 } };
  assert.deepEqual(keptPlan(I, { ...I, Q: 630 }), I.plan);
  assert.deepEqual(keptPlan(I, { ...I, cw: 'left' }), { A: 1100, carX: 220 });
  assert.equal(keptPlan({ ...I, plan: { cwLen: 500 } }, { ...I, plan: { cwLen: 500 }, entrances: 'adjacent' }), undefined);
  assert.deepEqual(withoutFix(I, 'A').plan, { carX: 220, cwPos: 300, railY: 900 });
  assert.equal(withoutFix({ ...I, plan: { A: 1100 } }, 'A').plan, undefined);
});

test('chiavi delle quote: dati del vano, ingombri, quote a mano, altezze, locale macchina', () => {
  const I = defaultInputs(1600, 1750);
  for (const [k, v] of [['W', 1700], ['doorHeight', 2100], ['sillGap', 25], ['plan.cwLen', 600], ['v.pit', 1500], ['room.doorW', 900]] as const) {
    const J = withValue(I, k, v);
    assert.ok(J, k);
    assert.equal(valueOf(J, k), v, k);
  }
  assert.equal(withValue(I, 'v.floors', 1), null);
  assert.equal(withValue(I, 'plan.nothing', 1), null);
  assert.equal(withValue({ ...I, room: null }, 'room.W', 3000), null);
  // the rope drop of a counterweight at the back keeps the car's depth where it is
  const L = layout(I), drop = chains(planDims(L, 'main', 0, { level: 'x' })).find((c) => c.text?.[0]?.startsWith('Calata'));
  assert.ok(drop?.edit?.[0]);
  const J = applyEdit(I, drop.edit[0], reads(drop, 0) + 100);
  assert.ok(J);
  assert.equal(J.plan?.B, L.B);
  assert.equal(J.cwWallGap, I.cwWallGap - 100);
});
