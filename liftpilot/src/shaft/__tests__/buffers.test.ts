// The pit's buffers by type: a polyurethane pad's stroke is 90 % of its height and needs no stroke by formula, but it
// is an energy accumulation buffer, allowed up to 1 m/s like a spring; a hydraulic buffer works at any speed with a
// stroke of at least 0,0674·v². Changing the type proposes a typical buffer and keeps the buffer's top (the run-by).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KV_VERT, bufferStroke, defaultInputs, layout, section, typicalBuffer, withBufferType, type ShaftInputs, type VerticalInputs } from '../index';

const withV = (patch: Partial<VerticalInputs>): ShaftInputs => {
  const I = defaultInputs(1600, 1750);
  return { ...I, vertical: { ...I.vertical, ...patch } };
};
const checkOf = (I: ShaftInputs, id: string) => layout(I).checks.find((c) => c.id === id);

test('tampone in poliuretano: corsa al 90 % dell\'altezza, nessuna corsa minima, fino a 1 m/s', () => {
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
  // springs at that speed are not allowed
  assert.equal(checkOf(withV(V0), 'b_type')?.status, 'fail');
});

test('cambiando tipo il supporto si sposta: la testa dell\'ammortizzatore e l\'extracorsa restano', () => {
  const V0 = defaultInputs(1600, 1750).vertical;
  for (const t of ['pu', 'oil', 'spring'] as const) {
    const V = withBufferType(V0, 'cw', t);
    assert.equal(V.cwBufferBase + V.cwBufferH, V0.cwBufferBase + V0.cwBufferH, t);
    assert.equal(section(layout(withV(V))).cwLow, section(layout(withV(V0))).cwLow, t);
  }
});
