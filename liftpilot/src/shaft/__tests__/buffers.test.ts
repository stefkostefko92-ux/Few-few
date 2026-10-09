// The pit's buffers by type: a polyurethane pad's stroke is 90 % of its height and needs no stroke by formula, but it
// is an energy accumulation buffer, allowed up to 1 m/s like a spring; a hydraulic buffer works at any speed with a
// stroke of at least 0,0674·v². Changing the type proposes a typical buffer and keeps the buffer's top (the run-by).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KV_VERT, bufferStroke, bufferType, defaultInputs, layout, section, standardBufferType, typicalBuffer, withBufferType, withStandardBuffers, type ShaftInputs,
  type VerticalInputs } from '../index';

const withV = (patch: Partial<VerticalInputs>): ShaftInputs => {
  const I = defaultInputs(1600, 1750);
  return { ...I, vertical: { ...I.vertical, ...patch } };
};
const checkOf = (I: ShaftInputs, id: string) => layout(I).checks.find((c) => c.id === id);

test('tampone in poliuretano: corsa al 90 % dell’altezza, nessuna corsa minima, fino a 1 m/s', () => {
  const V = withBufferType(defaultInputs(1600, 1750).vertical, 'car', 'pu');
  assert.equal(V.carBufferH, KV_VERT.puTypical);
  assert.equal(bufferStroke(V, 'car'), Math.round(KV_VERT.puStroke * KV_VERT.puTypical));
  const I = withV(V);
  assert.equal(checkOf(I, 'b_car')?.status, 'ok');
  assert.equal(checkOf(I, 'b_car')?.limit, null);
  assert.equal(checkOf(I, 'b_type')?.status, 'ok');
  assert.equal(checkOf(withV({ ...V, v: 1.2 }), 'b_type')?.status, 'fail');
  // the pit's spaces take the pad fully compressed
  assert.equal(section(layout(I)).carStroke, bufferStroke(V, 'car'));
});

test('ammortizzatore idraulico: a ogni velocità, corsa almeno 0,0674·v²', () => {
  const V0 = { ...defaultInputs(1600, 1750).vertical, v: 1.6 };
  const V = withBufferType(withBufferType(V0, 'car', 'oil'), 'cw', 'oil');
  assert.deepEqual(typicalBuffer('oil', 1.6), { h: 486, stroke: 173 });
  const I = withV(V);
  assert.equal(checkOf(I, 'b_type')?.status, 'ok');
  assert.equal(checkOf(I, 'b_car')?.status, 'ok');
  assert.equal(checkOf(I, 'b_car')?.limit, Math.ceil(KV_VERT.oilStrokeK * 1.6 * 1.6 * 1000));
  assert.equal(checkOf(withV({ ...V, carBufferStroke: 150 }), 'b_car')?.status, 'fail');
  // springs chosen at that speed are not allowed
  assert.equal(checkOf(withV(withBufferType(V0, 'car', 'spring')), 'b_type')?.status, 'fail');
});

test('oltre 1 m/s, senza tipo scelto, il software prende gli idraulici tipici per la velocità', () => {
  const I0 = defaultInputs(1600, 1750), D = I0.vertical;
  // up to 1 m/s the standard springs, the data as they are
  assert.equal(withStandardBuffers(D), D);
  assert.equal(standardBufferType(KV_VERT.springMaxV), 'spring');
  for (const v of [1.6, 2]) {
    const V0 = { ...D, v }, L = layout(withV(V0)), V = L.inputs.vertical, t = typicalBuffer('oil', v);
    assert.deepEqual([bufferType(V0, 'car'), bufferType(V0, 'cw')], ['oil', 'oil'], `${v}`);
    assert.deepEqual([V.carBufferH, V.carBufferStroke, V.cwBufferH, V.cwBufferStroke], [t.h, t.stroke, t.h, t.stroke], `${v}`);
    // the base moved so the top stays (down to the pit floor)
    assert.equal(V.carBufferBase, Math.max(0, D.carBufferBase + D.carBufferH - t.h));
    for (const id of ['b_type', 'b_car', 'b_cw']) assert.equal(checkOf(withV(V0), id)?.status, 'ok', `${v} ${id}`);
    // the stroke asked is the hydraulic one (0,0674·v²), never the springs' 0,135·v² for a type not allowed
    assert.equal(checkOf(withV(V0), 'b_car')?.limit, Math.ceil(KV_VERT.oilStrokeK * v * v * 1000));
  }
  // a height or a stroke entered stays; a type chosen stays as it is
  const own = { ...D, v: 1.6, carBufferStroke: 200 }, V = layout(withV(own)).inputs.vertical;
  assert.deepEqual([V.carBufferStroke, V.carBufferH], [200, typicalBuffer('oil', 1.6).h]);
  const pu = withBufferType({ ...D, v: 1.6 }, 'car', 'pu');
  assert.equal(layout(withV(pu)).inputs.vertical.carBufferH, pu.carBufferH);
  assert.equal(checkOf(withV(pu), 'b_type')?.status, 'fail');
});

test('cambiando tipo il supporto si sposta: la testa dell’ammortizzatore e l’extracorsa restano', () => {
  const V0 = defaultInputs(1600, 1750).vertical;
  for (const t of ['pu', 'oil', 'spring'] as const) {
    const V = withBufferType(V0, 'cw', t);
    assert.equal(V.cwBufferBase + V.cwBufferH, V0.cwBufferBase + V0.cwBufferH, t);
    assert.equal(section(layout(withV(V))).cwLow, section(layout(withV(V0))).cwLow, t);
  }
});
