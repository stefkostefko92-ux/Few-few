// Section A-A and the machine room in numbers: floor levels, the car at its highest and lowest positions, the checks in
// the headroom and in the pit, the buffer strokes, the room's checks; worked by hand on the typical data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_VERTICAL, KV_VERT, defaultInputs, layout, levels, roofSpaces, section, travel, type ShaftInputs } from '../index';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);
const check = (I: ShaftInputs, id: string) => layout(I).checks.find((c) => c.id === id);

test('quote dei piani e corsa', () => {
  assert.deepEqual(levels(DEFAULT_VERTICAL.floors), [0, 3000, 6000, 9000, 12000]);
  assert.equal(travel(DEFAULT_VERTICAL.floors), 12000);
});

test('sezione: posizione più alta e più bassa della cabina, spazi in testata e in fossa (a mano)', () => {
  const I = defaultInputs(1600, 1750), V = I.vertical, S = section(layout(I));
  // jump 0,035 · 0,63² m; the car rises past the top floor by the counterweight runby, the stroke and the jump
  near(S.jump, KV_VERT.jumpK * 0.63 * 0.63 * 1000);
  near(S.moveUp, V.cwRunby + V.cwBufferStroke + S.jump);
  // car buffers: 1400 pit − 600 base − 330 buffer → plate 330 below the floor leaves 140 of runby
  assert.equal(S.carRunby, 1400 - 600 - 330 - 330);
  assert.equal(S.moveDown, S.carRunby + V.carBufferStroke);
  // refuge on the roof: ceiling − (top floor + rise + car outside height) against 1000 mm of a type 2 space
  const h = check(I, 'h_refuge');
  near(h?.value ?? 0, V.headroom - S.moveUp - V.carOutH);
  assert.equal(h?.limit, KV_VERT.refugeH[2]);
  // stroke of spring buffers at 0,63 m/s: 0,135 · v² m is below the 65 mm minimum
  assert.equal(check(I, 'b_car')?.limit, KV_VERT.strokeMin);
});

test('testata troppo bassa e molle oltre 1 m/s: le verifiche lo dicono', () => {
  const I = defaultInputs(1600, 1750);
  assert.equal(check({ ...I, vertical: { ...I.vertical, headroom: 3000 } }, 'h_refuge')?.status, 'fail');
  assert.equal(check({ ...I, vertical: { ...I.vertical, v: 1.6, carBufferType: 'spring' } }, 'b_car')?.status, 'fail');
  // a balustrade lower than the gap to the wall asks
  const wide = { ...defaultInputs(2400, 2400), Q: 400, access: 'none' as const };
  assert.equal(check({ ...wide, vertical: { ...wide.vertical, parapet: 700 } }, 'h_parapet')?.status, 'fail');
});

test('locale macchina: altezza, spazio davanti al quadro, porta', () => {
  const I = defaultInputs(1600, 1750);
  assert.equal(check(I, 'm_height')?.status, 'ok');
  assert.equal(check({ ...I, room: I.room && { ...I.room, H: 1900 } }, 'm_height')?.status, 'fail');
  assert.equal(check({ ...I, room: I.room && { ...I.room, doorW: 550 } }, 'm_door')?.status, 'fail');
  assert.equal(check({ ...I, room: null }, 'm_height'), undefined);
});

test('altezza libera degli accessi e della cabina: 2000 mm passano, meno no', () => {
  const I = defaultInputs(1600, 1750);
  assert.equal(check(I, 'h_door')?.status, 'ok');
  assert.equal(check(I, 'h_car')?.status, 'ok');
  assert.equal(check({ ...I, doorHeight: KV_VERT.entranceH }, 'h_door')?.status, 'ok');
  assert.equal(check({ ...I, doorHeight: 1900 }, 'h_door')?.status, 'fail');
  assert.equal(check({ ...I, vertical: { ...I.vertical, carH: 1950 } }, 'h_car')?.status, 'fail');
  assert.equal(check({ ...I, vertical: { ...I.vertical, carH: 1950 } }, 'h_car')?.limit, KV_VERT.carInnerH);
});

test('contrappeso con la cabina sugli ammortizzatori compressi: corsa guidata 0,1 + 0,035·v² m', () => {
  const I = defaultInputs(1600, 1750);
  const need = Math.ceil((KV_VERT.cwGuided + KV_VERT.cwGuidedV2 * I.vertical.v ** 2) * 1000);
  assert.equal(check(I, 'h_cw')?.status, 'ok');
  assert.equal(check(I, 'h_cw')?.limit, need);
  // a counterweight 1300 mm taller reaches the top of its rails
  const tall = { ...I, vertical: { ...I.vertical, cwH: I.vertical.cwH + 1300 } };
  assert.equal(check(tall, 'h_cw')?.status, 'fail');
  assert.equal(Math.round((check(I, 'h_cw')?.value ?? 0) - (check(tall, 'h_cw')?.value ?? 0)), 1300);
});

test('tetto di cabina: lo spazio di rifugio del tipo scelto ci sta davanti o dietro la traversa, fuori dagli operatori', () => {
  // recomputed here: the roof less the operator's strip at the entrance, split by a crosshead lower than the refuge
  // (UNI EN 81-20:2020, 5.2.5.7.1; registry spazi.tetto.arcata)
  const at = (topRefuge: 1 | 2, I0: ShaftInputs = defaultInputs(1600, 1750), plan?: ShaftInputs['plan']) => {
    const I = { ...I0, access: 'none' as const, plan, vertical: { ...I0.vertical, topRefuge } }, L = layout(I), V = I.vertical, K = KV_VERT;
    const [rw, rd] = K.refugePlan[topRefuge], c = L.car, y0 = c.y + K.roofOperator, y1 = c.y + c.h;
    const low = V.frameTop - K.crossheadH - V.carOutH < K.refugeH[topRefuge];
    const parts = L.frame.kind === 'central' && low ? [[y0, L.frame.axis - K.crossheadHalf], [L.frame.axis + K.crossheadHalf, y1]] : [[y0, y1]];
    const fit = Math.max(...parts.map(([a, b]) => Math.max(Math.min(c.w - rw, b - a - rd), Math.min(c.w - rd, b - a - rw))));
    return { L, c: L.checks.find((x) => x.id === 'h_stand'), fit, low };
  };
  // the default design: the crosshead 280 mm over the roof, the crouching refuge (0,50 × 0,70 m) behind it
  const def = at(2);
  assert.ok(def.low);
  assert.equal(def.c?.value, def.fit);
  assert.equal(def.c?.status, 'ok');
  // drawn where it is checked: never across the crosshead
  const r = roofSpaces(def.L).refuge, axis = def.L.frame.axis;
  assert.ok(r.y0 >= axis + KV_VERT.crossheadHalf - 1e-9 || r.y1 <= axis - KV_VERT.crossheadHalf + 1e-9, `rifugio ${r.y0}..${r.y1}, traversa ${axis}`);
  // a small car of an old building: the refuge fits on the roof as a whole but neither in front of nor behind the crosshead
  const small = at(2, { ...defaultInputs(1400, 1500), access: 'none' });
  assert.ok(small.fit < 0);
  assert.equal(small.c?.status, 'fail');
  // a crosshead higher than the refuge: the whole roof less the operator's strip
  const tall = at(2, { ...defaultInputs(1400, 1500), vertical: { ...defaultInputs(1400, 1500).vertical, frameTop: 3500 } });
  assert.ok(!tall.low);
  assert.equal(tall.c?.value, tall.fit);
  assert.equal(tall.c?.status, 'ok');
  // the standing refuge (0,40 × 0,50 m, 2 m high) behind the crosshead of the default car
  assert.equal(at(1).c?.value, at(1).fit);
  // the crosshead: under 500 mm from the ceiling a warning (it may count as equipment, 5.2.5.7.2 a)), never a fail
  const head = (headroom: number) => layout({ ...defaultInputs(1600, 1750), vertical: { ...defaultInputs(1600, 1750).vertical, headroom } }).checks.find((x) => x.id === 'h_cross');
  assert.equal(head(3700)?.status, 'ok');
  assert.equal(head(3500)?.status, 'warn');
  assert.equal(head(3300)?.status, 'warn');
  assert.equal(head(3700)?.limit, KV_VERT.headEquip);
});
