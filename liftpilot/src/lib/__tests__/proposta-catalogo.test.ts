// Round 36: the proposal from a maker's catalogue passes every check the relazione then shows — its motor, groove and
// brake sized again at the catalogue's ratio and on the geometry the machine has where it stands (L1-01, L1-02) — and
// the rope geometry entered by hand that the shaft design contradicts is an issue (L1-03, L2-03, L4-04).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, compute, readInputs, sizeMachine } from '@/calc/index';
import { resizeMachine } from '@/calc/sizing';
import { KL, defaultLift, deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { drawnIssues } from '@/lib/lift/drawn';

test('argano di catalogo più veloce della griglia: il motore scelto di nuovo con il suo rapporto, fino al massimo del costruttore', () => {
  // example C at 800 kg: the grid's 3 × Ø13 on Ø 600 at the ideal ratio 45,55 takes 7,5 kW; a catalogue's 1/43 runs the
  // machine 5,9 % faster and the static power asked grows with it (registry azionamento.potenza)
  const c = readInputs({ ...PRESETS.C, Q: 800, compare: false }), o = sizeMachine(c.I, c.N, 0, null).options.find((x) => x.D === 600 && x.n === 3 && x.d === 13);
  assert.ok(o, 'opzione 3 × Ø13 su Ø 600');
  assert.equal(o.Pn, 7.5);
  const M = { ...o.M, i: 43 }, plain = compute(c.I, M);
  assert.ok(plain.drive.Peq / 1000 > 7.5 && plain.fails.some((x) => x.id === 'd_pst'), 'con il motore della griglia la potenza non basta');
  const r = resizeMachine(c.I, M, null);
  assert.ok(r);
  assert.equal(r.M.Pn, 11);
  assert.deepEqual(r.res.fails, []);
  assert.ok(r.res.drive.Peq / 1000 <= r.M.Pn);
  // a maker listing no motor over 7,5 kW does not take the option
  assert.equal(resizeMachine(c.I, M, 7.5), null);
});

const withCalc = (L: LiftInputs, c: Record<string, string>): LiftInputs => ({ ...L, calc: { ...L.calc, ...c } });
const cwLeft = (L: LiftInputs, cwPos?: number): LiftInputs => ({ ...L, shaft: { ...L.shaft, cw: 'left', ...(cwPos !== undefined ? { plan: { ...(L.shaft.plan ?? {}), cwPos } } : {}) } });
const below = (L: LiftInputs): LiftInputs => ({ ...withCalc(L, { layout: 'bottom' }), shaft: { ...L.shaft, room: null }, bottom: 'head' });

test('proposta dal catalogo: con l’asse e il telaio dell’argano com’è, ogni verifica passa (gola, freno e motore di nuovo)', () => {
  const cases: [string, LiftInputs, string | null][] = [
    // 2:1 with the counterweight at the left, SICOR SH160: its axis lowers the pulley's h to 0,749 m and the wrap angle with
    // it — until round 36 the grid's groove held braking upwards at 1,014 (KO)
    ['2:1 SH160', { ...withCalc(cwLeft(newLift()), { r: '2' }), catalog: { brand: 'SICOR', model: 'SH160' } }, 'SH160'],
    // Montanari M93: the wrap angle 161° → 155°, traction 0,968 → 0,987 with the grid's groove; now sized again on it
    ['M93', { ...newLift(), catalog: { brand: 'Montanari', model: 'M93' } }, 'M93'],
    ['M93 diagonale', { ...cwLeft(newLift(), 300), catalog: { brand: 'Montanari', model: 'M93' } }, 'M93'],
    ['SH160', { ...defaultLift(), catalog: { brand: 'SICOR', model: 'SH160' } }, 'SH160'],
  ];
  for (const brand of ['SICOR', 'Montanari', 'Sassi', 'GEM', 'FAER'] as const) {
    cases.push([`${brand} esempio`, { ...defaultLift(), catalog: { brand } }, null], [`${brand} in basso`, { ...below(newLift()), catalog: { brand } }, null]);
  }
  for (const [tag, inp, model] of cases) {
    const d = deriveLift(inp), r = d.analysis.res;
    if (model) assert.equal(d.catalog?.fit?.machine.model, model, `${tag}: preso dal catalogo`);
    assert.deepEqual(r.fails.map((x) => x.id), [], `${tag}: ${d.catalog?.fit?.machine.model ?? 'griglia'}`);
    assert.deepEqual(d.issues, [], tag);
    if (d.catalog?.fit) {
      // the catalogue's ratio, and the margin of the grid's sizing kept where the rope's safety factor allows it
      assert.equal(d.analysis.ctx.N.i, Math.round(d.catalog.fit.i * 1000) / 1000, tag);
      for (const c of [r.load, r.dn, r.up]) assert.ok(c.util <= 1, `${tag}: aderenza ${c.util}`);
    }
  }
});

test('Hv e L0 inseriti contro il progetto del vano: oltre la tolleranza sono da correggere', () => {
  // the tolerance: within it the value measured stays
  assert.deepEqual(drawnIssues({ L0: 1.0, Hv: 15 }, { L0: 1.0 + KL.l0Tol - 0.01, Hv: 15 - KL.hvTol + 0.01 }), []);
  assert.deepEqual(drawnIssues({ L0: 1.0, Hv: 15 }, { L0: 1.0 + KL.l0Tol + 0.01, Hv: 15 - KL.hvTol - 0.01 }), ['L0', 'Hv']);
  assert.deepEqual(drawnIssues({ L0: 2, Hv: 24 }, { L0: null, Hv: null }), [], 'presi dal progetto: nessun confronto');
  // a machine below at the lowest floor (scheme head): the calculator's example Hv 24 m in a 17 m shaft
  const B = below(newLift()), auto = deriveLift(B);
  assert.deepEqual(auto.issues, []);
  assert.deepEqual(auto.drawn, { L0: null, Hv: null });
  const Hv = Number(auto.values.Hv);
  assert.ok(Hv > 10 && Hv < 17, `Hv dal vano ${Hv}`);
  const entered = deriveLift({ ...withCalc(B, { Hv: '24' }), auto: { ...B.auto, Hv: false } });
  assert.ok(entered.issues.includes('Hv'), entered.issues.join(','));
  assert.equal(entered.drawn.Hv, Hv);
  // measured within half a metre of the design: kept as entered, no issue
  const near = deriveLift({ ...withCalc(B, { Hv: String(Math.round((Hv + 0.3) * 1000) / 1000) }), auto: { ...B.auto, Hv: false } });
  assert.ok(!near.issues.includes('Hv'), near.issues.join(','));
  // the rope beyond the travel entered by hand
  const A = defaultLift(), L0 = Number(deriveLift(A).values.L0);
  const far = deriveLift({ ...withCalc(A, { L0: '2' }), auto: { ...A.auto, L0: false } });
  assert.ok(Math.abs(2 - L0) > KL.l0Tol, `L0 dal vano ${L0}`);
  assert.ok(far.issues.includes('L0'));
  assert.equal(far.drawn.L0, L0);
  assert.ok(!deriveLift({ ...withCalc(A, { L0: String(L0 + 0.2) }), auto: { ...A.auto, L0: false } }).issues.includes('L0'));
});
