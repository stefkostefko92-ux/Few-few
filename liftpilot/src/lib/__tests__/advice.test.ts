// The machine to order among SICOR's and Montanari's: each maker's proposal checked with the installation, the ranking
// criterion after criterion with its reason, the values that load it into the replacement's calculator, and the
// machine of the draft order (the one the record verified, else the advice's first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { readInputs } from '@/calc/inputs';
import { mirrorRopes } from '@/lib/present/analysis';
import { defaultLift } from '@/lib/lift';
import { ADVICE_BRANDS, liftAdvice, rankCandidates, valuesAdvice, type MachineCandidate } from '@/lib/lift/advice';
import { calcOrder, catalogMachineOf, designOrder } from '@/lib/order/machine';

test('consiglio per il progetto: la proposta di ogni costruttore, verificata, e la prima da ordinare', () => {
  const L = defaultLift(), A = liftAdvice(L);
  assert.deepEqual(A.candidates.map((c) => c.brand).sort(), [...ADVICE_BRANDS].sort());
  for (const c of A.candidates) {
    assert.equal(c.fails, 0, `${c.model}: passa le verifiche`);
    assert.ok(c.staticKg >= c.testKg, `${c.model}: carico statico ammesso`);
    assert.ok(c.ratio.length > 0 && Math.abs(c.dv) <= 0.1, `${c.model}: rapporto a catalogo`);
    assert.ok(!c.others.includes(c.model));
  }
  // the deflector of the example: SICOR's SH140 stands on its own bedplate with the pulley, Montanari's on ours
  const sicor = A.candidates.find((c) => c.brand === 'SICOR');
  assert.equal(sicor?.model, 'SH140');
  assert.equal(sicor?.bedplate?.code, 'XTE6026');
  assert.equal(A.candidates.find((c) => c.brand === 'Montanari')?.bedplate ?? null, null);
  // the first one ranks first by the criterion it names
  const [a, b] = A.candidates;
  assert.ok(a && b && A.why && A.why !== 'only');
  // a machine entered by hand: the advice still proposes from the catalogues
  const hand = liftAdvice({ ...L, auto: { ...L.auto, machine: false } });
  assert.equal(hand.candidates.length, A.candidates.length);
});

test('graduatoria: verifiche, avvisi, basamento con rinvio, taglia, velocità, massa', () => {
  const base = liftAdvice(defaultLift()).candidates[0];
  assert.ok(base);
  const c = (o: Partial<MachineCandidate>): MachineCandidate => ({ ...base, ...o });
  const bp = base.bedplate ?? { brand: 'SICOR', model: 'SH140', code: 'XTE6026', mass: 159, dt: [400, 450], pulleyAxis: 320, sheaveAxis: 1016, top: 736, fall: { min: null, max: 940 }, length: 1170, width: 655, src: '' };
  const cases: [Partial<MachineCandidate>, Partial<MachineCandidate>, string][] = [
    [{ fails: 0, warns: 5 }, { fails: 1, warns: 0 }, 'checks'],
    [{ fails: 0, warns: 1, bedplate: null }, { fails: 0, warns: 2, bedplate: bp }, 'warns'],
    [{ fails: 0, warns: 1, bedplate: bp, staticKg: 5000 }, { fails: 0, warns: 1, bedplate: null, staticKg: 2000 }, 'bedplate'],
    [{ fails: 0, warns: 1, bedplate: null, staticKg: 2000 }, { fails: 0, warns: 1, bedplate: null, staticKg: 2600 }, 'smaller'],
    [{ fails: 0, warns: 1, bedplate: null, staticKg: 2000, dv: -0.01 }, { fails: 0, warns: 1, bedplate: null, staticKg: 2000, dv: 0.04 }, 'speed'],
    [{ fails: 0, warns: 1, bedplate: null, staticKg: 2000, dv: 0.01, mass: 150 }, { fails: 0, warns: 1, bedplate: null, staticKg: 2000, dv: -0.01, mass: 180 }, 'lighter'],
  ];
  for (const [x, y, why] of cases) {
    const first = c({ ...x, model: 'A' }), second = c({ ...y, model: 'B' });
    for (const order of [[first, second], [second, first]]) {
      const r = rankCandidates(order, []);
      assert.deepEqual(r.candidates.map((m) => m.model), ['A', 'B'], why);
      assert.equal(r.why, why);
    }
  }
  assert.equal(rankCandidates([c({})], ['Montanari']).why, 'only');
  assert.deepEqual(rankCandidates([], ['SICOR', 'Montanari']), { candidates: [], none: ['SICOR', 'Montanari'], why: null });
});

test('consiglio per il calcolatore: i valori dell’argano consigliato, riconosciuto nel calcolo salvato', () => {
  const A = valuesAdvice(PRESETS.A), first = A.candidates[0];
  assert.ok(first);
  // the deflector of example A: SICOR's machine with its bedplate first
  assert.equal(first.brand, 'SICOR');
  assert.ok(first.bedplate);
  assert.equal(A.why, 'bedplate');
  // its values in the calculator verify it, and the saved calculation is recognised as that machine
  const V = mirrorRopes({ ...PRESETS.A, ...first.values }), { I, N } = readInputs(V);
  assert.equal(N.shaftMax, first.staticKg);
  assert.equal(catalogMachineOf(I, N)?.machine.model, first.model);
  const own = calcOrder(V);
  assert.ok(own?.recorded);
  assert.equal(own.machine.model, first.model);
  // values that are no catalogue machine's: the order is for the advice's first, flagged
  const other = calcOrder(PRESETS.A);
  assert.ok(other && !other.recorded);
  assert.equal(other.machine.model, first.model);
});

test('bozza d’ordine del progetto: l’argano scelto, altrimenti il primo del consiglio', () => {
  const L = defaultLift();
  const chosen = designOrder({ ...L, catalog: { brand: 'SICOR', model: 'SH140' } });
  assert.ok(chosen?.recorded);
  assert.equal(chosen.machine.model, 'SH140');
  const grid = designOrder(L), first = liftAdvice(L).candidates[0];
  assert.ok(grid && !grid.recorded && first);
  assert.equal(grid.machine.model, first.model);
});
