// The makers' machines: the data read as numbers, the fit of an option of the sizing (ratio nearest the ideal one,
// sheave, static load, motor, payload), and the proposal that takes the smallest machine of the maker chosen or, when
// none passes, the calculation grid's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MACHINES, catalogFit, ratioValue } from '@/lib/catalog/machines';
import { KL, defaultLift, deriveLift, valueMarks } from '@/lib/lift';
import { liftInputsSchema } from '@/lib/lift-input';

test('catalogo degli argani: rapporti, pulegge, carichi e potenze leggibili', () => {
  const keys = new Set<string>();
  for (const c of MACHINES) {
    assert.ok(!keys.has(`${c.brand} ${c.model}`), `${c.model} doppio`);
    keys.add(`${c.brand} ${c.model}`);
    assert.ok(c.ratios.length > 0 && c.ratios.every((r) => /^\d\/\d+$/.test(r) && ratioValue(r) > 10), `${c.model}: rapporti`);
    if (c.sheaves) assert.ok(c.sheaves[0] <= c.sheaves[1], `${c.model}: pulegge`);
    if (c.kW) assert.ok(c.kW[0] <= c.kW[1], `${c.model}: potenze`);
    assert.ok(c.staticKg > 0 && c.src.length > 0, c.model);
  }
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
  const sicor = deriveLift({ ...base, catalog: { brand: 'SICOR' } }), f = sicor.catalog?.fit;
  assert.ok(f && sicor.catalog && !sicor.catalog.miss);
  assert.equal(Number(sicor.values.n_i), Math.round(f.i * 1000) / 1000);
  assert.equal(Number(sicor.values.n_shaftMax), f.machine.staticKg);
  assert.ok(Math.abs(f.dv) <= KL.catalogRatioTol);
  // a smaller machine of the brand that takes the same option does not exist
  for (const c of MACHINES.filter((x) => x.brand === 'SICOR' && x.staticKg < f.machine.staticKg)) {
    const o = { D: Number(sicor.values.n_D), iIdeal: f.i * (1 + f.dv), Pn: Number(sicor.values.n_Pn), staticKg: sicor.analysis.res.shaft.testKg, Q: sicor.layout.Q, r: 1 };
    assert.ok(catalogFit(c, o, KL.catalogRatioTol).fails.length > 0, `${c.model} passerebbe`);
  }
  assert.deepEqual(valueMarks(base.auto, sicor).catalog, { brand: 'SICOR', model: f.machine.model, ratio: f.ratio, staticKg: f.machine.staticKg, src: f.machine.src });
  // a model that takes nothing: the grid's proposal, said so
  const miss = deriveLift({ ...base, catalog: { brand: 'Montanari', model: 'M73' } });
  assert.ok(miss.catalog?.miss && miss.catalog.fit === null);
  assert.deepEqual(miss.values, grid.values);
  assert.ok(liftInputsSchema.safeParse({ ...base, catalog: { brand: 'Sassi', model: 'LEO' } }).success);
  assert.ok(!liftInputsSchema.safeParse({ ...base, catalog: { brand: 'Ignota' } }).success);
});
