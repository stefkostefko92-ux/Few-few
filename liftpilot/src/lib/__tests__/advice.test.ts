// The machine to order among SICOR's and Montanari's: every model verified with the installation, the ranking criterion
// after criterion with its reason, where the data come from, the diverting pulley when direct pull finds no machine,
// the values that load the first into the replacement's calculator, and the machine of the draft order (the one the
// record verified, else the advice's first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { readInputs } from '@/calc/inputs';
import { MACHINES, MAKER_SITE, BRANDS } from '@/lib/catalog/machines';
import { analyse, mirrorRopes, proposalValues } from '@/lib/present/analysis';
import { KL, defaultLift } from '@/lib/lift';
import { ADVICE_BRANDS, ADVICE_MODELS, CRITERIA, adviceOf, deflectorInputs, liftAdvice, liftAlternative, sourcesOf, valuesAdvice, type MachineCandidate } from '@/lib/lift/advice';
import { calcMachine, calcOrder, catalogMachineOf, designOrder } from '@/lib/order/machine';

test('consiglio per il progetto: ogni modello verificato, il primo di ogni costruttore', () => {
  const L = defaultLift(), A = liftAdvice(L);
  assert.equal(ADVICE_MODELS.length, MACHINES.filter((m) => ADVICE_BRANDS.includes(m.brand) && !m.byName).length);
  assert.ok(A.candidates.length > ADVICE_BRANDS.length, 'più modelli per costruttore');
  assert.deepEqual(A.best.map((c) => c.brand).sort(), [...ADVICE_BRANDS].sort());
  assert.equal(A.best[0], A.candidates[0], 'il primo della graduatoria è il primo dei consigliati');
  for (const c of A.best) {
    assert.equal(c.fails, 0, `${c.model}: passa le verifiche`);
    assert.ok(c.staticKg >= c.testKg, `${c.model}: carico statico ammesso`);
    assert.ok(c.ratio.length > 0 && Math.abs(c.dv) <= KL.catalogRatioTol, `${c.model}: rapporto a catalogo`);
  }
  // the deflector of the example: SICOR's SH140 on its own bedplate with the pulley, Montanari's on ours
  const sicor = A.best.find((c) => c.brand === 'SICOR'), monta = A.best.find((c) => c.brand === 'Montanari');
  assert.equal(sicor?.model, 'SH140');
  assert.equal(sicor?.bedplate?.code, 'XTE6026');
  assert.ok(sicor?.drawn, 'SH140 disegnato con le quote del costruttore');
  assert.equal(monta?.bedplate ?? null, null);
  // both from the makers' documents (Montanari's technical catalogue): the criterion `why` names decides — every one
  // before it ties, that one puts the first ahead
  assert.equal(sicor?.sources[0], 'D');
  assert.equal(monta?.sources[0], 'D');
  const [a, b] = A.best, at = CRITERIA.findIndex(([why]) => why === A.why);
  assert.ok(a && b && at >= 0);
  CRITERIA.forEach(([why, f], k) => { if (k < at) assert.equal(f(a, b), 0, why); });
  assert.ok((CRITERIA[at]?.[1](a, b) ?? 0) < 0);
  // a machine entered by hand: the advice still verifies the catalogues' machines
  const hand = liftAdvice({ ...L, auto: { ...L.auto, machine: false } });
  assert.equal(hand.candidates.length, A.candidates.length);
});

test('graduatoria: un criterio dopo l’altro, con il suo perché', () => {
  const base = liftAdvice(defaultLift()).best[0];
  assert.ok(base);
  const bp = base.bedplate;
  assert.ok(bp);
  const c = (o: Partial<MachineCandidate>): MachineCandidate => ({ ...base, fails: 0, warns: 1, sources: ['D'], bedplate: null, staticKg: 2000, drawn: false, dv: 0.01, mass: 200, ...o });
  // each pair: the first wins on the criterion named, the second is better on every one after it
  const cases: [Partial<MachineCandidate>, Partial<MachineCandidate>, string][] = [
    [{ fails: 0, warns: 5, sources: ['E'] }, { fails: 1, warns: 0, bedplate: bp }, 'checks'],
    [{ sources: ['D', 'E'], warns: 3 }, { sources: ['E', 'D'], bedplate: bp, warns: 0 }, 'documented'],
    [{ bedplate: bp, staticKg: 5000, warns: 3 }, { staticKg: 2000, warns: 0, drawn: true }, 'bedplate'],
    [{ staticKg: 2000, warns: 3, dv: 0.04 }, { staticKg: 2600, warns: 0, drawn: true, dv: 0 }, 'smaller'],
    [{ warns: 1, dv: 0.04 }, { warns: 2, drawn: true, dv: 0 }, 'warns'],
    [{ drawn: true, dv: 0.04, mass: 300 }, { dv: 0, mass: 100 }, 'drawn'],
    [{ dv: -0.012, mass: 300 }, { dv: 0.04, mass: 100 }, 'speed'],
    [{ dv: 0.012, mass: 150 }, { dv: -0.008, mass: 180 }, 'lighter'],
  ];
  assert.deepEqual(cases.map(([, , why]) => why), CRITERIA.map(([why]) => why), 'un caso per criterio, nell’ordine');
  for (const [x, y, why] of cases) {
    const first = c({ ...x, brand: 'SICOR', model: 'A' }), second = c({ ...y, brand: 'Montanari', model: 'B' });
    for (const found of [[first, second], [second, first]]) {
      const r = adviceOf(found);
      assert.deepEqual(r.candidates.map((m) => m.model), ['A', 'B'], why);
      assert.deepEqual(r.best.map((m) => m.model), ['A', 'B'], why);
      assert.equal(r.why, why);
    }
  }
  // one maker only, none at all
  const one = adviceOf([c({ model: 'A' }), c({ model: 'C', warns: 4 })]);
  assert.deepEqual(one.best.map((m) => m.model), ['A']);
  assert.equal(one.why, 'only');
  assert.deepEqual(one.none, ['Montanari']);
  assert.deepEqual(adviceOf([]), { candidates: [], best: [], none: ['SICOR', 'Montanari'], why: null, models: ADVICE_MODELS, wall: false });
});

test('fonte dei dati: le lettere del catalogo, la principale prima; il sito di ogni costruttore', () => {
  assert.deepEqual(sourcesOf('E: montanarigiulio.com, M65; D: brochure generale 2015'), ['E', 'D']);
  assert.deepEqual(sourcesOf('D: scheda; D: brochure; R: Donati'), ['D', 'R']);
  assert.deepEqual(sourcesOf('nessuna'), []);
  for (const m of MACHINES) assert.ok(sourcesOf(m.src).length > 0, `${m.brand} ${m.model}: fonte`);
  for (const b of BRANDS) assert.ok(MACHINES.some((m) => m.brand === b && m.src.includes(MAKER_SITE[b])), `${b}: sito dalle fonti`);
});

test('tiro diretto senza argano: la proposta con la puleggia di rinvio nel locale macchina', () => {
  const L = defaultLift(), top = { ...L, calc: { ...L.calc, layout: 'top' } };
  const A = liftAdvice(top);
  assert.equal(A.candidates.length, 0, 'la puleggia della calata non è a catalogo con questi dati');
  const alt = liftAlternative(top, A);
  assert.ok(alt && alt.best.length > 0);
  for (const c of alt.candidates) assert.equal(c.I.layout, 'topDefl');
  assert.equal(deflectorInputs(L), null, 'con il rinvio già scelto nessuna alternativa');
  assert.equal(liftAlternative(L, liftAdvice(L)), null);
});

test('consiglio per il calcolatore: i valori dell’argano consigliato, riconosciuto nel calcolo salvato', () => {
  const A = valuesAdvice(PRESETS.A), first = A.best[0];
  assert.ok(first);
  // the deflector of example A: SICOR's machine with its bedplate first
  assert.equal(first.brand, 'SICOR');
  assert.ok(first.bedplate);
  // its values in the calculator verify it, and the saved calculation is recognised as that machine
  const V = mirrorRopes({ ...PRESETS.A, ...first.values }), { I, N } = readInputs(V);
  assert.equal(N.shaftMax, first.staticKg);
  assert.equal(catalogMachineOf(I, N)?.machine.model, first.model);
  assert.equal(calcMachine(V)?.model, first.model);
  const own = calcOrder(V);
  assert.ok(own?.recorded);
  assert.equal(own.machine.model, first.model);
  // values that are no catalogue machine's: the order is for the advice's first, flagged
  const other = calcOrder(PRESETS.A, A);
  assert.ok(other && !other.recorded);
  assert.equal(other.machine.model, first.model);
});

test('bozza d’ordine del progetto: l’argano scelto, altrimenti il primo del consiglio', () => {
  const L = defaultLift();
  const chosen = designOrder({ ...L, catalog: { brand: 'SICOR', model: 'SH140' } });
  assert.ok(chosen?.recorded);
  assert.equal(chosen.machine.model, 'SH140');
  const A = liftAdvice(L), grid = designOrder(L, A), first = A.best[0];
  assert.ok(grid && !grid.recorded && first);
  assert.equal(grid.machine.model, first.model);
});

test('argano a catalogo: il freno ridimensionato con il suo rapporto, il nome scelto tenuto', () => {
  // tiro diretto 1:1, 320 kg a 1,6 m/s: il rapporto di catalogo 2/42 chiede più coppia al freno della griglia
  const V = mirrorRopes({ ...PRESETS.A, Q: 320, P: 360, v: 1.6, layout: 'top', r: '1', alphaMode: 'geo' });
  const A = valuesAdvice(V);
  assert.ok(A.candidates.length > 0);
  for (const c of A.candidates) {
    const one = analyse(mirrorRopes({ ...V, ...c.values })).res.checks.find((x) => x.id === 'b_one');
    assert.equal(one?.status, 'ok', `${c.model}: freno per il suo rapporto`);
  }
  // M93 e M95 hanno gli stessi dati: il preso resta quello
  const B = valuesAdvice(PRESETS.A), m95 = [...B.candidates].find((c) => c.model === 'M95') ?? null;
  const W = m95 ? mirrorRopes({ ...PRESETS.A, ...m95.values }) : null;
  if (m95 && W) {
    assert.equal(W.n_model, 'Montanari M95');
    assert.equal(calcMachine(W)?.model, 'M95');
    const { n_model: _drop, ...unnamed } = W;
    void _drop;
    assert.ok(['M93', 'M95'].includes(calcMachine(unnamed)?.model ?? ''), 'senza nome: riconosciuto dai valori');
  }
  // a proposal of the grid: no name, no output torque from a catalogue (the check waits for the reducer's data)
  const g = analyse(PRESETS.B).sizing.pick;
  assert.ok(g);
  const P = proposalValues(g);
  assert.equal(P.n_model, '');
  assert.equal(P.n_MpCat, '');
  assert.ok(!analyse(mirrorRopes({ ...PRESETS.B, ...P })).res.checks.some((c) => c.id === 'd_mp'));
});
