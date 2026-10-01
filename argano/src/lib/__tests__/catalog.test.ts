// The makers' machines: the data read as numbers, the fit of an option of the sizing (ratio nearest the ideal one,
// sheave, static load, motor, payload), and the proposal that takes the smallest machine of the maker chosen or, when
// none passes, the calculation grid's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRANDS, MACHINES, catalogFit, ratioValue } from '@/lib/catalog/machines';
import { KL, defaultLift, deriveLift, valueMarks } from '@/lib/lift';
import { liftInputsSchema } from '@/lib/lift-input';

test('catalogo degli argani: rapporti, pulegge, carichi e potenze leggibili', () => {
  const keys = new Set<string>();
  for (const c of MACHINES) {
    assert.ok(!keys.has(`${c.brand} ${c.model}`), `${c.model} doppio`);
    keys.add(`${c.brand} ${c.model}`);
    assert.ok(c.ratios.length > 0 && c.ratios.every((r) => /^\d\/\d+$/.test(r) && ratioValue(r) > 10), `${c.model}: rapporti`);
    if (c.sheaves) assert.ok(c.sheaves[0] <= c.sheaves[1], `${c.model}: pulegge`);
    if (c.kWmax !== null) assert.ok(c.kWmax > 0, `${c.model}: potenza`);
    assert.ok(c.staticKg > 0 && c.src.length > 0, c.model);
  }
  for (const b of BRANDS) assert.ok(MACHINES.some((c) => c.brand === b), `${b}: nessun argano`);
  assert.equal(ratioValue('2/43'), 21.5);
});

test('un argano del catalogo accetta un\'opzione: rapporto più vicino, scarto di velocità, i motivi del no', () => {
  const sh140 = MACHINES.find((c) => c.model === 'SH140');
  assert.ok(sh140);
  const ok = catalogFit(sh140, { D: 560, iIdeal: 67, Pn: 7.5, staticKg: 2400, Q: 630, r: 1 }, KL.catalogRatioTol);
  assert.equal(ok.ratio, '1/71');
  assert.ok(Math.abs(ok.dv - (67 / 71 - 1)) < 1e-12);
  assert.deepEqual(ok.fails, []);
  const no = catalogFit(sh140, { D: 560, iIdeal: 90, Pn: 15, staticKg: 3400, Q: 630, r: 1 }, KL.catalogRatioTol);
  assert.deepEqual([...no.fails].sort(), ['motor', 'ratio', 'static']);
});

test('proposta dal catalogo: il più piccolo argano che passa, con il suo rapporto e il carico statico; altrimenti la griglia', () => {
  const base = defaultLift(), grid = deriveLift(base);
  for (const brand of ['SICOR', 'Sassi', 'Montanari'] as const) {
    const d = deriveLift({ ...base, catalog: { brand } }), f = d.catalog?.fit;
    assert.ok(f && d.catalog && !d.catalog.miss, brand);
    assert.equal(Number(d.values.n_i), Math.round(f.i * 1000) / 1000);
    assert.equal(Number(d.values.n_shaftMax), f.machine.staticKg);
    assert.ok(Math.abs(f.dv) <= KL.catalogRatioTol);
    // a smaller machine of the brand that takes the same option does not exist
    for (const c of MACHINES.filter((x) => x.brand === brand && x.staticKg < f.machine.staticKg)) {
      const o = { D: Number(d.values.n_D), iIdeal: f.i * (1 + f.dv), Pn: Number(d.values.n_Pn), staticKg: d.analysis.res.shaft.testKg, Q: d.layout.Q, r: 1 };
      assert.ok(catalogFit(c, o, KL.catalogRatioTol).fails.length > 0, `${c.model} passerebbe`);
    }
    assert.deepEqual(valueMarks(base.auto, d).catalog, { brand, model: f.machine.model, ratio: f.ratio, staticKg: f.machine.staticKg, src: f.machine.src });
  }
  // Montanari's M83 takes the example (1/69 within the inverter's ±10 %): the M73 has 1/60 and 1/75 only around it
  assert.equal(deriveLift({ ...base, catalog: { brand: 'Montanari' } }).catalog?.fit?.machine.model, 'M83');
  // a model that takes nothing: the grid's proposal, said so
  const miss = deriveLift({ ...base, catalog: { brand: 'Montanari', model: 'M73' } });
  assert.ok(miss.catalog?.miss && miss.catalog.fit === null);
  assert.deepEqual(miss.values, grid.values);
  assert.ok(liftInputsSchema.safeParse({ ...base, catalog: { brand: 'Sassi', model: 'LEO' } }).success);
  assert.ok(liftInputsSchema.safeParse({ ...base, catalog: { brand: 'FAER', model: 'P58F' } }).success);
  assert.ok(!liftInputsSchema.safeParse({ ...base, catalog: { brand: 'Ignota' } }).success);
});
