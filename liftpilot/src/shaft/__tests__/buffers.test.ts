// The pit's buffers by type: a polyurethane pad's stroke is 90 % of its height and needs no stroke by formula, but it
// is an energy accumulation buffer, allowed up to 1 m/s like a spring; a hydraulic buffer works at any speed with a
// stroke of at least 0,0674·v². Changing the type proposes a typical buffer and keeps the buffer's top (the run-by).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_VERTICAL, KV_VERT, bufferStroke, bufferType, defaultInputs, layout, section, standardBufferType, typicalBuffer, withBufferType, withOwnBuffer,
  valueOf, withStandardBuffers, withValue, withVerticalValue, type ShaftInputs, type VerticalInputs } from '../index';

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

test('oltre 1 m/s, senza tipo scelto: il valore mostrato è quello tenuto, un altro valore è preso così com’è', () => {
  const I = withV({ v: 1.6 }), sizes = (S: ShaftInputs, side: 'car' | 'cw') => {
    const V = layout(S).inputs.vertical;
    return side === 'car' ? [V.carBufferBase, V.carBufferH, V.carBufferStroke] : [V.cwBufferBase, V.cwBufferH, V.cwBufferStroke];
  };
  for (const side of ['car', 'cw'] as const) {
    const before = sizes(I, side), keys = [`${side}BufferBase`, `${side}BufferH`, `${side}BufferStroke`] as const, t = typicalBuffer('oil', 1.6);
    // the standard hydraulic one, its top where the springs' was
    assert.deepEqual(before.slice(1), [t.h, t.stroke], side);
    keys.forEach((k, i) => {
      // the form shows the standard and the drawing reads it: typed back, nothing moves
      assert.equal(withStandardBuffers(I.vertical)[k], before[i], `${side} ${k}`);
      assert.equal(valueOf(I, `v.${k}`), before[i], `${side} ${k}`);
      const form = withV(withVerticalValue(I.vertical, k, before[i])), drawn = withValue(I, `v.${k}`, before[i]);
      assert.deepEqual(sizes(form, side), before, `${side} ${k} form`);
      assert.deepEqual(drawn && sizes(drawn, side), before, `${side} ${k} drawing`);
      // and it stays: the record is a fixed point (the form shows what it holds)
      assert.equal(withStandardBuffers(form.vertical)[k], before[i], `${side} ${k}`);
      assert.equal(withOwnBuffer(form.vertical, side), form.vertical, `${side} ${k}`);
      // another value, even the standard springs' height or stroke: exactly it, the rest as it was
      for (const x of [k.endsWith('Base') ? 250 : DEFAULT_VERTICAL[k], 400]) {
        const want = before.map((y, j) => (j === i ? x : y));
        assert.deepEqual(sizes(withV(withVerticalValue(I.vertical, k, x)), side), want, `${side} ${k} ${x} form`);
        const d = withValue(I, `v.${k}`, x);
        assert.deepEqual(d && sizes(d, side), want, `${side} ${k} ${x} drawing`);
        assert.equal(d && valueOf(d, `v.${k}`), x, `${side} ${k} ${x}`);
      }
    });
    // the other side is left to the software
    const other = side === 'car' ? 'cw' : 'car', V1 = withOwnBuffer(I.vertical, side);
    assert.equal(V1[`${other}BufferType`], undefined);
    assert.deepEqual(sizes(withV(V1), other), sizes(I, other));
  }
  // up to 1 m/s (or with a type chosen) the value goes in as it is
  const D = defaultInputs(1600, 1750).vertical, own = withBufferType({ ...D, v: 1.6 }, 'car', 'pu');
  assert.deepEqual(withVerticalValue(D, 'carBufferBase', 444), { ...D, carBufferBase: 444 });
  assert.deepEqual(withVerticalValue(own, 'carBufferH', 120), { ...own, carBufferH: 120 });
});
