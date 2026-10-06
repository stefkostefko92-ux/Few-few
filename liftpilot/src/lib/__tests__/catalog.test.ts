// The makers' machines: the data read as numbers, the fit of an option of the sizing (ratio nearest the ideal one,
// sheave, static load, motor, payload), and the proposal that takes the smallest machine of the maker chosen (a
// historic machine or a special variant only when named) or, when none passes, the calculation grid's.
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
  for (const b of BRANDS) assert.ok(MACHINES.some((c) => c.brand === b && !c.byName), `${b}: nessun argano proposto`);
  assert.equal(ratioValue('2/43'), 21.5);
  // the documents read on 2 October 2026: SICOR's payloads at 1:1 (brochure p. 9), Sassi's MB, FAER's range in HP
  const of = (model: string) => MACHINES.find((c) => c.model === model);
  assert.deepEqual(['SV110', 'MR12C', 'SH130G', 'SH140', 'SH160', 'MR35'].map((x) => of(x)?.payload.r1), [450, 550, 630, 875, 1250, 5500]);
  assert.ok(MACHINES.filter((c) => c.brand === 'SICOR' && !c.byName).every((c) => c.payload.r1 !== null && c.src.startsWith('D: ')));
  assert.deepEqual(['MB94', 'MB95', 'MB108'].map((x) => of(x)?.staticKg), [8000, 12000, 15000]);
  assert.deepEqual(of('MF94')?.sheaves, [450, 800]);
  assert.deepEqual(['P58S', 'P60F', 'P68F', 'P70F', 'P80F'].map((x) => of(x)?.kWmax), [7.5, 7.5, 11.9, 18.7, 22.4]);
  assert.deepEqual(of('P58F')?.ratios, ['1/76', '1/66', '1/58', '1/52', '1/44', '1/37']);
  assert.equal(of('HW140C')?.kWmax, 10.8);
  // the documents the client supplied on 3 October 2026: Montanari's range sheets (PENTA's ratios, the M95's mass, the
  // M98's payload and largest inverter motor), Sassi's catalogue REV 2023/01
  assert.deepEqual(of('PENTA')?.ratios, ['1/65', '1/55', '1/43', '1/37', '2/71', '2/55', '3/47']);
  assert.equal(of('M95')?.mass, 253);
  assert.deepEqual(['M98', 'M98H'].map((x) => [of(x)?.payload.r1, of(x)?.kWmax]), [[1600, 26], [1600, 26]]);
  assert.deepEqual([of('M73')?.staticKg, of('M75AL')?.staticKg, of('M75AL')?.mass], [2000, 2500, 150]);
  assert.ok(MACHINES.filter((c) => c.brand === 'Sassi').every((c) => c.src.includes('REV 2023/01')));
  // only by name: the machines no longer built, the long shafts, another market
  assert.deepEqual(MACHINES.filter((c) => c.byName).map((c) => c.model), ['SH140LS', 'SH160LS', 'MR12 (storico)', 'MR16 (storico)', 'MR17 (storico)',
    'M73AL', 'M75AL', 'M83AL', 'M93AL', 'M98HAL', 'M77', 'M77H', 'M87', 'M104']);
});

test('un argano del catalogo accetta un’opzione: rapporto più vicino, scarto di velocità, i motivi del no', () => {
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
    assert.ok(!f.machine.byName, `${brand}: ${f.machine.model} si propone solo per nome`);
    // a smaller machine of the brand that takes the same option does not exist
    for (const c of MACHINES.filter((x) => x.brand === brand && !x.byName && x.staticKg < f.machine.staticKg)) {
      const o = { D: Number(d.values.n_D), iIdeal: f.i * (1 + f.dv), Pn: Number(d.values.n_Pn), staticKg: d.analysis.res.shaft.testKg, Q: d.layout.Q, r: 1 };
      assert.ok(catalogFit(c, o, KL.catalogRatioTol).fails.length > 0, `${c.model} passerebbe`);
    }
    assert.deepEqual(valueMarks(base.auto, d).catalog, { brand, model: f.machine.model, ratio: f.ratio, staticKg: f.machine.staticKg, src: f.machine.src });
  }
  // Montanari's PENTA takes the example on the bedplate with the diverting pulley (1/55 within the inverter's ±10 %)
  assert.equal(deriveLift({ ...base, catalog: { brand: 'Montanari' } }).catalog?.fit?.machine.model, 'PENTA');
  // a model that takes nothing: the grid's proposal, said so
  const miss = deriveLift({ ...base, catalog: { brand: 'Montanari', model: 'M73' } });
  assert.ok(miss.catalog?.miss && miss.catalog.fit === null);
  assert.deepEqual(miss.values, grid.values);
  assert.ok(liftInputsSchema.safeParse({ ...base, catalog: { brand: 'Sassi', model: 'LEO' } }).success);
  assert.ok(liftInputsSchema.safeParse({ ...base, catalog: { brand: 'FAER', model: 'P58F' } }).success);
  assert.ok(liftInputsSchema.safeParse({ ...base, catalog: { brand: 'ITG', model: 'ITG 127' } }).success);
  // a machine proposed only by name is taken when named
  const named = deriveLift({ ...base, catalog: { brand: 'SICOR', model: 'SH140LS' } });
  assert.ok(named.catalog && (named.catalog.miss || named.catalog.fit?.machine.model === 'SH140LS'));
  assert.ok(!liftInputsSchema.safeParse({ ...base, catalog: { brand: 'Ignota' } }).success);
});
