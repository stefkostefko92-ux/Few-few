// Section A-A and the machine room in numbers: floor levels, the car at its highest and lowest positions, the checks in
// the headroom and in the pit, the buffer strokes, the room's checks; worked by hand on the typical data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_VERTICAL, KV_VERT, defaultInputs, layout, levels, section, travel, type ShaftInputs } from '../index';

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
  assert.equal(check({ ...I, vertical: { ...I.vertical, v: 1.6 } }, 'b_car')?.status, 'fail');
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
