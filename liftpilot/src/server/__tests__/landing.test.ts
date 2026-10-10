// The landing page's numbers come from the software and must stay true as the engines change: the sample installation
// of the product showcase passes every check of its machine (the page says the software proposes a machine that
// passes), the emergency stop it reports peaks at the value of the check it replays, and the registries' counts add up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import calcIt from '../../../messages/calc/it.json';
import { VOCI } from '@/calc/norme';
import { VOCI_VANO } from '@/shaft';
import { VOCI_IMPIANTO } from '@/lib/lift/norme';
import { VOCI_SIM } from '@/sim/norme';
import { deriveLift, newLift } from '@/lib/lift';
import { makePres } from '@/lib/present/tr';
import { asCalcDict } from '@/components/calc/dict';
import { registryCounts, sampleChecks, sampleStop } from '@/components/landing/example';

const P = makePres(asCalcDict(calcIt), 'it-IT');

test('landing: the sample installation passes every check of its machine', () => {
  const s = sampleChecks(P);
  assert.ok(s.checks.length > 10);
  assert.deepEqual(s.checks.filter((c) => c.status === 'fail').map((c) => c.id), []);
  assert.match(s.machine.ropes, /^\d+ × Ø\d+ mm$/);
  assert.match(s.machine.Q, /^\d[\d.]* kg$/);
  assert.match(s.machine.v, /^\d+,\d\d m\/s$/);
});

test('landing: the emergency stop peaks at the value of the check it replays', () => {
  const stop = sampleStop(), d = deriveLift(newLift());
  const value = d.analysis.res.checks.find((c) => c.id === 'tr_up')?.value;
  assert.ok(typeof value === 'number');
  assert.ok(Math.abs(stop.peak - value) < 1e-3, `${stop.peak} vs ${value}`);
  assert.ok(stop.peak < stop.efa, 'the ropes hold');
  assert.ok(stop.util > 0 && stop.util < 1 && stop.accel > 0 && stop.stop > 0);
});

test('landing: the registries\' counts', () => {
  const c = registryCounts();
  assert.equal(c.values, VOCI.length + VOCI_VANO.length + VOCI_IMPIANTO.length + VOCI_SIM.length);
  assert.ok(c.checks >= 50 && c.checks <= c.values);
});
