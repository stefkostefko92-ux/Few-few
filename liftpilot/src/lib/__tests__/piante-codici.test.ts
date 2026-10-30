// The codes of the rails' brackets in the walls of the plans (round 37, G correction): where the two counterweight
// rails on one wall take different brackets — one of Panev's catalogue, the other none of it ("STAFFA DA DIMENSIONARE
// A PARTE") — and the car rails' brackets reach that wall too, each code is read on its own: none covers another.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeBox, type Entity, type TextShape } from '@/drawing';
import { defaultInputs, type ShaftInputs } from '@/shaft';
import { mainBox } from '@/shaft/head';
import { NO_PANEV, cwPlanCode } from '@/shaft/plan-staffe';
import { wallLabel } from '@/shaft/wall-label';
import { deriveLift, newLift } from '../lift';
import { valueMarks } from '../lift/marks';
import { setSheets } from '../tavole/build';
import { storedInput } from '../tavole/compose';

/** The auditors' fuzz designs of round 37 (seeds 16, 5, 48), reduced: two adjacent entrances, the counterweight on a
 *  side with T90/B rails — the rail by the front entrance's corner takes none of Panev's brackets. */
const mixed = (cw: 'left' | 'right'): Partial<ShaftInputs> => ({ W: 2230, D: 1330, cw, cwRail: 'T90/B', entrances: 'adjacent', side2: cw === 'left' ? 'right' : 'left', door: 'C2', doorWidth: 1100 });

test('piante: il codice della staffa da dimensionare a parte non copre quello Panev né quello delle staffe di cabina', () => {
  for (const cw of ['left', 'right'] as const) {
    const L0 = { ...newLift(), shaft: { ...defaultInputs(2230, 1330), ...mixed(cw) } }, d = deriveLift(L0), L = d.layout;
    const codes = L.rails.filter((r) => r.kind === 'cw').map((r) => cwPlanCode(L, r) ?? '');
    assert.equal(new Set(codes).size, 2, `${cw}: ${codes.join(' | ')}`);
    assert.ok(codes.some((c) => c.endsWith(NO_PANEV)), `${cw}: ${codes.join(' | ')}`);
    const x = storedInput(d.values, L, { number: '1', createdAt: new Date('2026-10-08T10:00:00Z'), authorInitials: 'M', companyName: 'S',
      projectData: { name: 'P', address: null, city: null, province: null, plantNumber: null, client: null }, plant: {}, revisions: [] }, null, valueMarks(L0.auto, d, d.bottom, d.collaudo));
    assert.ok(x);
    const plans = setSheets(x).sheets.filter(({ spec }) => spec.k === 'plan');
    assert.ok(plans.length >= 2, cw);
    for (const [i, { drawn }] of plans.entries()) {
      const T = drawn.shapes.filter((q): q is TextShape => q.t === 'text');
      assert.ok(T.some((t) => t.text.endsWith(NO_PANEV)), `${cw} pianta ${i + 1}: il codice`);
      for (let a = 0; a < T.length; a++) for (let c = a + 1; c < T.length; c++) {
        const p = shapeBox(T[a] as TextShape), q = shapeBox(T[c] as TextShape);
        const over = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0) > 0.4 && Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0) > 0.4;
        assert.ok(!over, `${cw} pianta ${i + 1}: «${T[a]?.text}» × «${T[c]?.text}»`);
      }
    }
  }
});

test('codice nel muro: dalla parte chiesta, altrimenti dall’altra lungo il muro, altrimenti una riga più in fuori', () => {
  const I = defaultInputs(1600, 1750), L = deriveLift({ ...newLift(), shaft: I }).layout, box = mainBox(I);
  const ask = { wall: 'left' as const, u: 1100, text: '10× SU 220 160 + SG 80 150', size: 2.5, up: true };
  const at = (e: Entity): [number, number, string] => (e.e === 'text' ? [e.at[0], e.at[1], e.align ?? 'l'] : [NaN, NaN, '']);
  const free = wallLabel(L, ask, [], box);
  assert.deepEqual(at(free).slice(1), [1100, 'l']);
  // another code up the wall from a little further on: this one runs the other way, on the same line
  const above = wallLabel(L, { ...ask, u: 1300 }, [], box), other = wallLabel(L, ask, [above], box);
  assert.deepEqual(at(other), [at(free)[0], 1100, 'r']);
  // and one down the wall from a little before: a line further out from the shaft (lower x on the left wall), its
  // height and 0,6 mm of paper at 1:25
  const below = wallLabel(L, { ...ask, u: 900, up: false }, [], box), out = wallLabel(L, ask, [above, below], box);
  assert.deepEqual(at(out).slice(1), [1100, 'l']);
  assert.ok(Math.abs(at(free)[0] - at(out)[0] - (1.3 * 2.5 + 0.6) * 25) < 1e-6, JSON.stringify(out));
});
