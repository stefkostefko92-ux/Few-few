// Round 37 (W2-G2-02): traction at the brake's real deceleration predicts the acceptance test, so it also takes the car
// with 1,25·Q moving down toward the bottom of the travel (UNI EN 81-20:2020, 6.3.3 b)); the design check of UNI EN
// 81-50:2020, 5.11.2.2.2, at the minimum deceleration keeps the rated load and the empty car only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { K } from '@/calc/norme';
import { brakeLoad } from '@/calc/compute';
import { deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { textsFor } from '@/lib/present/texts';
import { makePres } from '@/lib/present/tr';
import calcIt from '../../../messages/calc/it.json';

const withK = (k: number | null): LiftInputs => {
  const L = newLift();
  return k === null ? L : { ...L, calc: { ...L.calc, k } };
};

test('frenatura con il freno reale: anche la prova di aderenza con 1,25·Q in discesa verso il fondo', () => {
  // the example as proposed: the empty car up at the top still governs (1,399)
  const base = deriveLift(withK(null)).analysis.res;
  assert.deepEqual([base.real.load, base.real.pos, base.real.dir], ['e', 't', 'up']);
  assert.ok(Math.abs(base.real.util - 1.399) < 1e-3);
  // with a lighter counterweight the test governs: 1,459 against 1,397 of the empty car (round 36 showed 1,397)
  const r = deriveLift(withK(0.4)).analysis.res;
  assert.deepEqual([r.real.load, r.real.pos, r.real.dir], ['q125', 'b', 'dn']);
  assert.ok(Math.abs(r.real.util - 1.459) < 1e-3, `${r.real.util}`);
  assert.ok(Math.abs(r.real.aEff - 1.92) < 5e-3, `${r.real.aEff}`);
  // only with the real brake, only moving down, only at the bottom
  assert.deepEqual(r.brkReal.filter((c) => c.load === 'q125').map((c) => [c.pos, c.dir]), [['b', 'dn']]);
  assert.ok(r.brk.every((c) => c.load !== 'q125'), 'la verifica di progetto alla decelerazione minima resta con Q e cabina vuota');
  assert.equal(brakeLoad('q125', 630), K.loadTestFactor * 630);
  // the brake window's upper bound and the output torque take it too (registry azionamento.coppia.uscita)
  assert.ok(r.brakeUtil(r.brake.avail) >= r.real.util - 1e-12);
  assert.equal(r.drive.MpBrakeCase.load, 'q125');
  // the relazione names the case and the test
  const X = textsFor(makePres(calcIt, 'it-IT'));
  assert.equal(X.caseText(r.real), 'cabina con 1,25·Q in discesa, in basso, a 1,92 m/s² (dal freno), prova UNI EN 81-20:2020, 6.3.3 b)');
});
